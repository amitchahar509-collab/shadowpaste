import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"

// GET /api/audit-logs?limit=100&action=vault.store&actorType=agent
// Returns org-scoped audit log entries (compliance trail)
export async function GET(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)
  const action = searchParams.get("action")
  const actorType = searchParams.get("actorType")

  const where: Record<string, unknown> = { orgId: ctx.orgId }
  if (action) where.action = { contains: action }
  if (actorType) where.actorType = actorType

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  // Aggregate counts by action + actorType for the summary
  const allLogs = await db.auditLog.findMany({ where: { orgId: ctx.orgId }, select: { action: true, actorType: true } })
  const byAction: Record<string, number> = {}
  const byActor: Record<string, number> = {}
  for (const l of allLogs) {
    byAction[l.action] = (byAction[l.action] || 0) + 1
    byActor[l.actorType] = (byActor[l.actorType] || 0) + 1
  }

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      orgId: l.orgId,
      actorType: l.actorType,
      actorId: l.actorId,
      action: l.action,
      target: l.target,
      metadata: l.metadata ? safeParse(l.metadata) : null,
      time: l.createdAt.toISOString(),
    })),
    counts: { total: allLogs.length, byAction, byActor },
  })
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return { raw: s } }
}
