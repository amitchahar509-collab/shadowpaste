import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const [agents, tools, packages, projects, toolCalls, attacks, publicScans, sandboxChanges] = await Promise.all([
    db.agent.count(), db.mcpTool.count(), db.mcpPackage.count(), db.project.count(),
    db.toolCall.count(), db.attackTest.count(), db.publicScan.count(), db.sandboxChange.count(),
  ])
  const allowedCalls = await db.toolCall.count({ where: { decision: "allowed" } })
  const deniedCalls = await db.toolCall.count({ where: { decision: "denied" } })
  const sandboxedCalls = await db.toolCall.count({ where: { decision: "sandboxed" } })
  const pendingCalls = await db.toolCall.count({ where: { decision: "pending" } })
  const activeAgents = await db.agent.count({ where: { status: "active" } })
  const quarantinedAgents = await db.agent.count({ where: { status: "quarantined" } })
  const blockedAttacks = await db.attackTest.count({ where: { result: "blocked" } })
  const allowedAttacks = await db.attackTest.count({ where: { result: "allowed" } })
  const recentCalls = await db.toolCall.findMany({
    include: { agent: true }, orderBy: { createdAt: "desc" }, take: 8,
  })
  const allAgents = await db.agent.findMany({ select: { trustScore: true } })
  const avgTrust = allAgents.length ? Math.round(allAgents.reduce((s, a) => s + a.trustScore, 0) / allAgents.length) : 0
  return NextResponse.json({
    counts: { agents, tools, packages, projects, toolCalls, attacks, publicScans, sandboxChanges },
    calls: { allowed: allowedCalls, denied: deniedCalls, sandboxed: sandboxedCalls, pending: pendingCalls },
    agents: { active: activeAgents, quarantined: quarantinedAgents, avgTrust },
    attacks: { blocked: blockedAttacks, allowed: allowedAttacks },
    recentCalls: recentCalls.map((c) => ({
      id: c.id, agent: c.agent.name, provider: c.agent.provider, tool: c.toolName,
      decision: c.decision, riskLevel: c.riskLevel, riskScore: c.riskScore, time: c.createdAt.toISOString(),
    })),
  })
}
