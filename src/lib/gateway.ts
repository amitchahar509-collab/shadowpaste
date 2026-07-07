// ShadowPaste V18 — MCP Zero Trust Gateway
// Central orchestrator: agent -> gateway -> policy -> execution -> audit

import { db } from "./db"
import { assessRisk } from "./risk"
import { evaluatePolicy } from "./policy"

export interface GatewayRequest {
  agentId: string
  sessionId?: string
  toolName: string
  input: Record<string, unknown>
}

export interface GatewayResponse {
  decision: string
  reason: string
  policy: string
  riskScore: number
  riskLevel: string
  auditRequired: boolean
  toolCallId: string
  output: Record<string, unknown> | null
  factors: Array<{ factor: string; weight: number; description: string }>
  inputFlags: string[]
  durationMs: number
}

// Simulated safe tool execution (no real side effects in this demo)
function simulateExecution(toolName: string, input: Record<string, unknown>, decision: string): Record<string, unknown> {
  if (decision === "deny" || decision === "ask") {
    return { status: "not_executed", reason: `Decision: ${decision}` }
  }
  if (decision === "sandbox") {
    return { status: "routed_to_sandbox", sandboxId: `sbx_${Math.random().toString(36).slice(2, 10)}` }
  }
  // Mock success outputs per category
  const cat = toolName.split(".")[0]
  switch (cat) {
    case "fs":
      return { status: "ok", bytes: 1024, content: input.path ? `<contents of ${input.path}>` : null }
    case "github":
      return { status: "ok", ref: `#${Math.floor(Math.random() * 9000) + 1000}`, repo: input.repo }
    case "db":
      return { status: "ok", rows: Math.floor(Math.random() * 50), affected: input.query ? 1 : 0 }
    case "shell":
      return { status: "ok", exitCode: 0, stdout: "command completed" }
    case "network":
      return { status: "ok", httpStatus: 200, bytes: 2048 }
    case "stripe":
      return { status: "ok", id: `ch_${Math.random().toString(36).slice(2, 12)}` }
    case "ai":
      return { status: "ok", tokens: Math.floor(Math.random() * 800) + 100 }
    default:
      return { status: "ok" }
  }
}

export async function invokeTool(req: GatewayRequest): Promise<GatewayResponse> {
  const start = Date.now()

  // 1. Load agent
  const agent = await db.agent.findUnique({ where: { id: req.agentId } })
  if (!agent) {
    throw new Error(`Agent ${req.agentId} not found`)
  }
  if (agent.status === "revoked" || agent.status === "suspended") {
    return finalize({
      decision: "deny",
      reason: `Agent is ${agent.status} — all tool calls blocked`,
      policy: "AGENT_DISABLED",
      riskScore: 100,
      riskLevel: "critical",
      auditRequired: true,
      toolName: req.toolName,
      agentId: req.agentId,
      input: req.input,
      sessionId: req.sessionId,
      factors: [],
      inputFlags: [],
      durationMs: Date.now() - start,
      agent,
    })
  }

  // 2. Risk assessment
  const risk = assessRisk(req.toolName, req.input, agent.trustScore)

  // 3. Policy evaluation
  const policy = await evaluatePolicy({
    agentId: req.agentId,
    sessionId: req.sessionId || "",
    toolName: req.toolName,
    risk,
    agentTrustScore: agent.trustScore,
  })

  // 4. Execute (or route to sandbox)
  const output = simulateExecution(req.toolName, req.input, policy.decision)

  // 5. Record audit (always)
  const toolCall = await db.toolCall.create({
    data: {
      agentId: req.agentId,
      sessionId: req.sessionId || null,
      toolName: req.toolName,
      input: JSON.stringify(req.input),
      output: JSON.stringify(output),
      riskScore: risk.finalScore,
      riskLevel: risk.finalLevel,
      decision: policy.decision === "allow_always" || policy.decision === "allow_once" ? "allowed" : policy.decision === "ask" ? "pending" : policy.decision,
      reason: policy.reason,
      duration: Date.now() - start,
    },
  })

  // 6. Update agent counters
  await db.agent.update({
    where: { id: req.agentId },
    data: {
      totalCalls: { increment: 1 },
      allowedCalls: policy.decision === "allow_always" || policy.decision === "allow_once" ? { increment: 1 } : undefined,
      deniedCalls: policy.decision === "deny" ? { increment: 1 } : undefined,
      lastActiveAt: new Date(),
    },
  })

  return {
    decision: policy.decision,
    reason: policy.reason,
    policy: policy.policy,
    riskScore: risk.finalScore,
    riskLevel: risk.finalLevel,
    auditRequired: policy.auditRequired,
    toolCallId: toolCall.id,
    output,
    factors: risk.factors,
    inputFlags: risk.inputFlags,
    durationMs: Date.now() - start,
  }
}

async function finalize(args: {
  decision: string
  reason: string
  policy: string
  riskScore: number
  riskLevel: string
  auditRequired: boolean
  toolName: string
  agentId: string
  input: Record<string, unknown>
  sessionId?: string
  factors: Array<{ factor: string; weight: number; description: string }>
  inputFlags: string[]
  durationMs: number
  agent: { id: string }
}): Promise<GatewayResponse> {
  const toolCall = await db.toolCall.create({
    data: {
      agentId: args.agentId,
      sessionId: args.sessionId || null,
      toolName: args.toolName,
      input: JSON.stringify(args.input),
      output: JSON.stringify({ status: "not_executed" }),
      riskScore: args.riskScore,
      riskLevel: args.riskLevel,
      decision: args.decision === "allow_always" || args.decision === "allow_once" ? "allowed" : args.decision,
      reason: args.reason,
      duration: args.durationMs,
    },
  })
  await db.agent.update({
    where: { id: args.agentId },
    data: { totalCalls: { increment: 1 }, deniedCalls: { increment: 1 }, lastActiveAt: new Date() },
  })
  return {
    decision: args.decision,
    reason: args.reason,
    policy: args.policy,
    riskScore: args.riskScore,
    riskLevel: args.riskLevel,
    auditRequired: args.auditRequired,
    toolCallId: toolCall.id,
    output: null,
    factors: args.factors,
    inputFlags: args.inputFlags,
    durationMs: args.durationMs,
  }
}
