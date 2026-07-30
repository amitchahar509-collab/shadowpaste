import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext } from "@/lib/auth"
import { auditUnauthorized } from "@/lib/audit-request"

// GET /api/agents/[id] — read one agent (config, recent sessions, tool calls).
//
// This previously did `getContext(req) || anonymousContext()`, and
// anonymousContext() resolves to orgId "default" — so an unauthenticated caller
// could read the default org's agent configuration, permissions and recent
// tool-call history. Same anti-pattern as the audit-logs disclosure. Now
// authenticated and scoped to the caller's own org.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/agents/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }
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
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/agents/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

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

// DELETE /api/agents/[id] — remove an agent and its cascade (sessions,
// permissions, tool calls all have onDelete: Cascade).
//
// There was no delete path at all: an agent could be created and revoked but
// never removed, so an org permanently accumulated agents against its plan
// limit. Authenticated, tenant-scoped, audited. `agent.manage` is required —
// deletion is a management action, not something a VIEWER performs.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/agents/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const { requirePermission } = await import("@/lib/auth")
  const allowed = requirePermission(authCtx.role, "agent.manage")
  if (!allowed.ok) {
    return NextResponse.json({ error: "forbidden", message: "Your role does not permit deleting agents" }, { status: 403 })
  }

  // Tenant scope enforced in the WHERE clause: deleteMany returns count 0 rather
  // than throwing when the id belongs to another org, so cross-tenant deletion
  // is a 404, not an error leak.
  const res = await db.agent.deleteMany({ where: { id, orgId: authCtx.orgId } })
  if (res.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 })
  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user.id, action: "agent.delete", target: id, metadata: JSON.stringify({ deleted: true }) } })
  return NextResponse.json({ ok: true, deleted: id })
}
