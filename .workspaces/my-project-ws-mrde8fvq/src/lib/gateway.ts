// ShadowPaste V19 — MCP Zero Trust Gateway (REAL execution)
// agent -> gateway -> risk -> policy -> credential injection -> REAL execute -> audit
// Replaces V18 simulateExecution with real adapters from src/lib/tools/adapters.

import { db } from "@/lib/db";
import { assessRisk } from "@/lib/risk";
import { evaluatePolicy } from "@/lib/policy";
import { executeTool, type ExecResult } from "@/lib/tools/adapters";
import { redactSecrets } from "@/lib/security/vault";

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
  output: Record<string, unknown> | null;
  executed: boolean;
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

  // Record audit (always). Input/output are REDACTED of any secrets.
  const redactedInput = redactSecrets(JSON.stringify(req.input), []);
  const redactedOutput = execResult ? execResult.redactedOutput : JSON.stringify({ status: "not_executed", decision: policy.decision });

  const toolCall = await db.toolCall.create({
    data: {
      agentId: req.agentId, sessionId: req.sessionId || null,
      toolName: req.toolName,
      input: redactedInput, output: redactedOutput,
      riskScore: risk.finalScore, riskLevel: risk.finalLevel,
      decision: policy.decision === "allow_always" || policy.decision === "allow_once" ? "allowed" : policy.decision === "ask" ? "pending" : policy.decision,
      reason: policy.reason, duration: Date.now() - start,
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
      metadata: JSON.stringify({ decision: policy.decision, riskScore: risk.finalScore, executed }),
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
    decision: policy.decision, reason: policy.reason, policy: policy.policy,
    riskScore: risk.finalScore, riskLevel: risk.finalLevel, auditRequired: policy.auditRequired,
    toolCallId: toolCall.id, output: execResult?.output ?? null, executed,
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
