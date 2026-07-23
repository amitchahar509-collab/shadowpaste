import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req) || anonymousContext()
  const agent = await db.agent.findFirst({
    where: { id, orgId: authCtx.orgId },
    include: {
      permissions: { orderBy: { createdAt: "desc" } },
      sessions: { orderBy: { createdAt: "desc" }, take: 10 },
      toolCalls: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  })
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ agent })
}

// PATCH /api/agents/[id] — update agent status / trust / metadata.
// Authenticated + tenant-scoped: changing `status` gates the whole
// stolen-token defense (un-quarantining a revoked agent), so this must never
// be reachable anonymously or across orgs.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

  const agent = await db.agent.findFirst({ where: { id, orgId: authCtx.orgId } })
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (typeof body.trustScore === "number") update.trustScore = body.trustScore
  if (body.status) update.status = body.status
  if (body.name) update.name = body.name
  if (body.description !== undefined) update.description = body.description

  const updated = await db.agent.update({ where: { id: agent.id }, data: update })
  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user.id, action: "agent.update", target: agent.id, metadata: JSON.stringify(update) } })
  return NextResponse.json({ agent: updated })
}
