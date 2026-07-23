import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"

// GET /api/permissions?agentId=... — list permission decisions, tenant-scoped.
export async function GET(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get("agentId")
  const permissions = await db.permission.findMany({
    where: { agent: { orgId: ctx.orgId }, ...(agentId ? { agentId } : {}) },
    include: { agent: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ permissions })
}

// POST — set/update a permission decision (allow_always / allow_once / ask / deny).
// Authenticated + tenant-scoped: this grants agents standing access to tools,
// so it must not be reachable anonymously or for another org's agent.
export async function POST(req: NextRequest) {
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { agentId, toolName, scope, decision, riskLevel, grantedBy } = body
  if (!agentId || !toolName || !decision) {
    return NextResponse.json({ error: "agentId, toolName, decision required" }, { status: 400 })
  }

  const agent = await db.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } })
  if (!agent) return NextResponse.json({ error: "agent not found in your org" }, { status: 403 })

  const existing = await db.permission.findFirst({ where: { agentId, toolName } })
  let permission
  if (existing) {
    permission = await db.permission.update({ where: { id: existing.id }, data: { decision, scope: scope || existing.scope, riskLevel: riskLevel || existing.riskLevel, grantedBy: grantedBy || ctx.user.email } })
  } else {
    permission = await db.permission.create({ data: { agentId, toolName, scope: scope || "read", decision, riskLevel: riskLevel || "low", grantedBy: grantedBy || ctx.user.email } })
  }
  await db.auditLog.create({ data: { orgId: ctx.orgId, actorType: "user", actorId: ctx.user.id, action: "permission.set", target: `${agentId}:${toolName}`, metadata: JSON.stringify({ decision }) } })
  return NextResponse.json({ permission })
}
