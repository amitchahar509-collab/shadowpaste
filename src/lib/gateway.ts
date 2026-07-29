// ShadowPaste V19 — MCP Zero Trust Gateway (REAL execution)
// agent -> gateway -> risk -> policy -> credential injection -> REAL execute -> audit
// Replaces V18 simulateExecution with real adapters from src/lib/tools/adapters.

import { db } from "@/lib/db";
import { assessRisk, type RiskLevel } from "@/lib/risk";
import { evaluatePolicy } from "@/lib/policy";
import { executeTool, type ExecResult } from "@/lib/tools/adapters";
import { redactSecrets } from "@/lib/security/vault";
import { sanitizeToolOutput } from "@/lib/security/sanitize-output";

export interface GatewayRequest {
  agentId: string;
  sessionId?: string;
  toolName: string;
  input: Record<string, unknown>;
  orgId?: string;
  _tokenOverride?: string; // for public/unauthenticated reads
}

export interface GatewayResponse {
  decision: string;
  reason: string;
  policy: string;
  riskScore: number;
  riskLevel: string;
  auditRequired: boolean;
  toolCallId: string;
  /** Sanitized — every detectable secret has been replaced with a marker. */
  output: Record<string, unknown> | null;
  executed: boolean;
  /** How many secrets were stripped from `output` before it was returned. */
  secretsRedacted?: number;
  adapter?: string;
  factors: Array<{ factor: string; weight: number; description: string }>;
  inputFlags: string[];
  durationMs: number;
}

export async function invokeTool(req: GatewayRequest): Promise<GatewayResponse> {
  const start = Date.now();

  const agent = await db.agent.findUnique({ where: { id: req.agentId } });
  if (!agent) throw new Error(`Agent ${req.agentId} not found`);

  if (agent.status === "revoked" || agent.status === "suspended" || agent.status === "quarantined") {
    return await finalize({
      decision: "deny", reason: `Agent is ${agent.status} — all tool calls blocked`,
      policy: "AGENT_DISABLED", riskScore: 100, riskLevel: "critical", auditRequired: true,
      toolName: req.toolName, agentId: req.agentId, input: req.input, sessionId: req.sessionId,
      factors: [], inputFlags: [], durationMs: Date.now() - start, executed: false, output: null, adapter: undefined,
    });
  }

  const risk = assessRisk(req.toolName, req.input, agent.trustScore);
  const policy = await evaluatePolicy({
    agentId: req.agentId, sessionId: req.sessionId || "", toolName: req.toolName,
    risk, agentTrustScore: agent.trustScore,
  });

  let execResult: ExecResult | null = null;
  let executed = false;
  if (policy.decision === "allow_always" || policy.decision === "allow_once") {
    let sid = req.sessionId;
    if (!sid) {
      const s = await db.session.create({ data: { agentId: req.agentId, status: "active", source: "gateway", context: JSON.stringify({ via: "gateway" }) } });
      sid = s.id;
    }
    execResult = await executeTool(req.toolName, req.input, { sessionId: sid, orgId: req.orgId || agent.orgId, _tokenOverride: req._tokenOverride });
    executed = execResult.ok;
  }

  // ---- Response-side secret sanitization ----------------------------------
  // Runs BEFORE anything is returned or persisted. The adapter's raw `output`
  // must not survive past this point: `safeOutput.output` is what the agent
  // sees and `safeOutput.json` is what the audit trail stores, both derived
  // from the same sanitized text. See src/lib/security/sanitize-output.ts for
  // the leak this closes.
  const safeOutput = sanitizeToolOutput(execResult?.output, `tool:${req.toolName}`);

  // ---- Post-execution risk escalation -------------------------------------
  // Some threats are only detectable INSIDE the adapter, after policy has already
  // scored the call. An SSRF attempt is the clearest case: `network.fetch` scores
  // 25/low on its tool identity, so a request aimed at 169.254.169.254 (cloud
  // metadata), 127.0.0.1 or 10.0.0.0/8 was blocked correctly but recorded as a
  // low-risk event — the audit trail disagreed with the defence that fired.
  // Escalate the RECORDED score so telemetry matches reality.
  const adapterCode = (safeOutput.output as { code?: string } | null)?.code;
  const ESCALATIONS: Record<string, { score: number; level: RiskLevel; reason: string }> = {
    SSRF_BLOCKED: { score: 95, level: "critical", reason: "SSRF attempt blocked — request targeted a private/loopback/metadata address or a non-allowlisted host" },
    COMMAND_REJECTED: { score: 90, level: "critical", reason: "command injection attempt blocked — shell metacharacters in input" },
    SQL_VALIDATION_FAILED: { score: 85, level: "critical", reason: "unsafe SQL blocked by the write validator" },
  };
  const escalation = adapterCode ? ESCALATIONS[adapterCode] : undefined;
  // A tool result that contained credentials is itself a security event: the
  // agent asked for something that turned out to hold secrets. The call still
  // succeeds (sanitized), but it must not be recorded as routine low-risk
  // traffic. Only raise the score — never lower an existing escalation.
  const leakScore = safeOutput.redacted > 0 ? Math.max(risk.finalScore, 70) : risk.finalScore;
  const leakLevel: string = safeOutput.redacted > 0 && leakScore >= 70 ? "high" : risk.finalLevel;

  const recordedScore = escalation ? escalation.score : leakScore;
  const recordedLevel: string = escalation ? escalation.level : leakLevel;
  const recordedReason = escalation
    ? `${escalation.reason} (policy: ${policy.reason})`
    : safeOutput.redacted > 0
      ? `${safeOutput.redacted} secret(s) redacted from tool output before returning to the agent (policy: ${policy.reason})`
      : policy.reason;
  // A blocked attack is never an "allowed" outcome in the audit trail.
  const recordedDecision = escalation
    ? "blocked"
    : policy.decision === "allow_always" || policy.decision === "allow_once"
      ? "allowed"
      : policy.decision === "ask" ? "pending" : policy.decision;

  // Record audit (always). Input/output are REDACTED of any secrets.
  const redactedInput = redactSecrets(JSON.stringify(req.input), []);
  // Persist the SANITIZED text, not the adapter's `redactedOutput` — for most
  // adapters the latter was just JSON.stringify(output) and carried secrets
  // straight into the audit table.
  const redactedOutput = execResult ? safeOutput.json : JSON.stringify({ status: "not_executed", decision: policy.decision });

  const toolCall = await db.toolCall.create({
    data: {
      agentId: req.agentId, sessionId: req.sessionId || null,
      toolName: req.toolName,
      input: redactedInput, output: redactedOutput,
      riskScore: recordedScore, riskLevel: recordedLevel,
      decision: recordedDecision,
      reason: recordedReason, duration: Date.now() - start,
      capabilityToken: execResult?.capabilityNonce,
      executed,
    },
  });

  // Record ToolExecution row (real execution audit) + AuditLog
  if (execResult) {
    await db.toolExecution.create({
      data: {
        orgId: agent.orgId, toolCallId: toolCall.id, toolName: req.toolName, adapter: execResult.adapter,
        input: redactedInput, output: redactedOutput,
        status: execResult.ok ? "success" : "error", errorMessage: execResult.error,
        durationMs: execResult.durationMs,
      },
    });
  }
  await db.auditLog.create({
    data: {
      orgId: agent.orgId, actorType: "agent", actorId: req.agentId,
      action: "tool.invoke", target: req.toolName,
      metadata: JSON.stringify({
        decision: recordedDecision, riskScore: recordedScore, riskLevel: recordedLevel,
        executed, policy: policy.policy,
        ...(escalation ? { escalatedFrom: risk.finalScore, escalationCode: adapterCode } : {}),
        ...(safeOutput.redacted > 0
          ? { secretsRedacted: safeOutput.redacted, redactionDetectors: safeOutput.detectors }
          : {}),
      }),
    },
  });

  await db.agent.update({
    where: { id: req.agentId },
    data: {
      totalCalls: { increment: 1 },
      allowedCalls: executed ? { increment: 1 } : undefined,
      deniedCalls: policy.decision === "deny" ? { increment: 1 } : undefined,
      lastActiveAt: new Date(),
    },
  });

  return {
    decision: escalation ? "blocked" : policy.decision, reason: recordedReason, policy: policy.policy,
    riskScore: recordedScore, riskLevel: recordedLevel, auditRequired: policy.auditRequired || !!escalation,
    // SANITIZED output only — never `execResult.output`.
    toolCallId: toolCall.id, output: safeOutput.output, executed,
    secretsRedacted: safeOutput.redacted,
    adapter: execResult?.adapter, factors: risk.factors, inputFlags: risk.inputFlags,
    durationMs: Date.now() - start,
  };
}

async function finalize(args: {
  decision: string; reason: string; policy: string; riskScore: number; riskLevel: string;
  auditRequired: boolean; toolName: string; agentId: string; input: Record<string, unknown>;
  sessionId?: string; factors: Array<{ factor: string; weight: number; description: string }>;
  inputFlags: string[]; durationMs: number; executed: boolean; output: Record<string, unknown> | null; adapter: string | undefined;
}): Promise<GatewayResponse> {
  const toolCall = await db.toolCall.create({
    data: {
      agentId: args.agentId, sessionId: args.sessionId || null, toolName: args.toolName,
      input: JSON.stringify(args.input), output: JSON.stringify({ status: "not_executed" }),
      riskScore: args.riskScore, riskLevel: args.riskLevel,
      decision: args.decision === "allow_always" || args.decision === "allow_once" ? "allowed" : args.decision,
      reason: args.reason, duration: args.durationMs, executed: false,
    },
  });
  await db.agent.update({
    where: { id: args.agentId },
    data: { totalCalls: { increment: 1 }, deniedCalls: { increment: 1 }, lastActiveAt: new Date() },
  });
  return {
    decision: args.decision, reason: args.reason, policy: args.policy,
    riskScore: args.riskScore, riskLevel: args.riskLevel, auditRequired: args.auditRequired,
    toolCallId: toolCall.id, output: args.output, executed: args.executed,
    adapter: args.adapter, factors: args.factors, inputFlags: args.inputFlags, durationMs: args.durationMs,
  };
}
