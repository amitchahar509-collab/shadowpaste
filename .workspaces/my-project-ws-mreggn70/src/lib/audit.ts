// ShadowPaste V18 — Flight Recorder (AI Black Box)
// Timeline + replay of every agent action

import { db } from "./db"

export interface TimelineEvent {
  id: string
  time: string
  agentName: string
  agentProvider: string
  toolName: string
  decision: string
  riskLevel: string
  riskScore: number
  reason: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
}

export async function getTimeline(opts: { limit?: number; agentId?: string } = {}): Promise<TimelineEvent[]> {
  const calls = await db.toolCall.findMany({
    where: opts.agentId ? { agentId: opts.agentId } : undefined,
    include: { agent: true },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 100,
  })
  return calls.map((c) => ({
    id: c.id,
    time: c.createdAt.toISOString(),
    agentName: c.agent.name,
    agentProvider: c.agent.provider,
    toolName: c.toolName,
    decision: c.decision,
    riskLevel: c.riskLevel,
    riskScore: c.riskScore,
    reason: c.reason || "",
    input: safeParse(c.input),
    output: c.output ? safeParse(c.output) : null,
  }))
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s)
  } catch {
    return { raw: s }
  }
}

export interface ReplayStep {
  index: number
  time: string
  label: string
  detail: string
  decision: string
  riskLevel: string
}

export async function getReplay(sessionId?: string): Promise<ReplayStep[]> {
  const calls = await db.toolCall.findMany({
    where: sessionId ? { sessionId } : undefined,
    include: { agent: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  })
  return calls.map((c, i) => ({
    index: i + 1,
    time: c.createdAt.toISOString(),
    label: `${c.agent.name} → ${c.toolName}`,
    detail: c.reason || "no detail",
    decision: c.decision,
    riskLevel: c.riskLevel,
  }))
}
