import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/metrics — real observability metrics (no fake numbers)
export async function GET() {
  const start = Date.now()

  // Real counts from the database
  const [
    agents, activeAgents, quarantinedAgents,
    toolCalls, allowedCalls, deniedCalls, sandboxedCalls,
    vaultEntries, toolExecutions, auditLogs,
    attacks, blockedAttacks,
    projects, publicScans, mcpTools, mcpPackages,
  ] = await Promise.all([
    db.agent.count(),
    db.agent.count({ where: { status: "active" } }),
    db.agent.count({ where: { status: "quarantined" } }),
    db.toolCall.count(),
    db.toolCall.count({ where: { decision: "allowed" } }),
    db.toolCall.count({ where: { decision: "denied" } }),
    db.toolCall.count({ where: { decision: "sandboxed" } }),
    db.vaultEntry.count(),
    db.toolExecution.count(),
    db.auditLog.count(),
    db.attackTest.count(),
    db.attackTest.count({ where: { result: "blocked" } }),
    db.project.count(),
    db.publicScan.count(),
    db.mcpTool.count(),
    db.mcpPackage.count(),
  ])

  // Avg trust score
  const allAgents = await db.agent.findMany({ select: { trustScore: true } })
  const avgTrust = allAgents.length ? Math.round(allAgents.reduce((s, a) => s + a.trustScore, 0) / allAgents.length) : 0

  // Recent latency (last 100 tool calls)
  const recentCalls = await db.toolCall.findMany({ select: { duration: true }, orderBy: { createdAt: "desc" }, take: 100 })
  const latencies = recentCalls.map((c) => c.duration || 0).filter((d) => d > 0).sort((a, b) => a - b)
  const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0
  const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0
  const p99 = latencies.length ? latencies[Math.floor(latencies.length * 0.99)] : 0

  const blockRate = toolCalls > 0 ? Math.round(((deniedCalls + sandboxedCalls) / toolCalls) * 100) : 0

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    queryLatencyMs: Date.now() - start,
    agents: { total: agents, active: activeAgents, quarantined: quarantinedAgents, avgTrust },
    toolCalls: { total: toolCalls, allowed: allowedCalls, denied: deniedCalls, sandboxed: sandboxedCalls, blockRate },
    latency: { p50, p95, p99, sampleSize: latencies.length },
    security: { vaultEntries, toolExecutions, auditLogs, attacks, blockedAttacks, attackBlockRate: attacks > 0 ? Math.round((blockedAttacks / attacks) * 100) : 100 },
    catalog: { mcpTools, mcpPackages, projects, publicScans },
    memory: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) },
  })
}
