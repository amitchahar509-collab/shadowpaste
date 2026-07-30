import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, requirePermission } from "@/lib/auth"
import { auditUnauthorized, auditRequest } from "@/lib/audit-request"

// POST /api/sandbox/[id]/approve — approve a sandbox change (merge into "main").
//
// This is the human gate that lets AI-generated changes land, so it is
// authenticated, tenant-scoped AND role-gated.
//
// The role gate was missing. `sandbox.approve` was defined in the RBAC matrix
// (OWNER and ADMIN only) but never checked anywhere — its sole appearance in the
// codebase was as an audit-log action STRING. So any authenticated user could
// approve, including a VIEWER, whose permission set is deliberately empty. The
// approval gate was effectively "is anyone logged in", which is authentication,
// not authorization.
// Returns the NARROWED identity on success, so callers get non-null orgId/userId
// without re-checking. A helper returning the whole context would lose TypeScript's
// narrowing and force non-null assertions at every use — which is how a null-user
// path gets reintroduced later.
type Gate =
  | { error: NextResponse; orgId?: undefined; userId?: undefined }
  | { error?: undefined; orgId: string; userId: string }

async function authorize(req: NextRequest, route: string): Promise<Gate> {
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) {
    await auditUnauthorized(req, route)
    return { error: NextResponse.json({ error: "authentication required" }, { status: 401 }) }
  }
  const allowed = requirePermission(authCtx.role, "sandbox.approve")
  if (!allowed.ok) {
    await auditRequest(req, {
      action: "sandbox.approve_denied", target: route,
      decision: "BLOCKED", riskScore: 65, orgId: authCtx.orgId, actorId: authCtx.user.id,
      detail: { reason: allowed.reason ?? "insufficient role", role: authCtx.role },
    })
    return { error: NextResponse.json({ error: "forbidden", message: "Your role does not permit approving sandbox changes" }, { status: 403 }) }
  }
  return { orgId: authCtx.orgId, userId: authCtx.user.id }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const gate = await authorize(req, "/api/sandbox/[id]/approve")
  if (gate.error) return gate.error
  const { orgId, userId } = gate

  const existing = await db.sandboxChange.findFirst({ where: { id, project: { orgId } } })
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const change = await db.sandboxChange.update({ where: { id }, data: { approved: true } })
  const pending = await db.sandboxChange.count({ where: { projectId: change.projectId, approved: false } })
  if (pending === 0) {
    await db.project.update({ where: { id: change.projectId }, data: { sandboxStatus: "merged" } })
  }
  await db.auditLog.create({ data: { orgId, actorType: "user", actorId: userId, action: "sandbox.approve", target: id, metadata: JSON.stringify({ merged: pending === 0 }) } })
  return NextResponse.json({ ok: true, change, merged: pending === 0 })
}

// DELETE — reject a sandbox change. Rejection is as consequential as approval
// (it discards proposed work), so it carries the same gate, and it now leaves an
// audit record naming the rejector. Previously it was authenticated-only and
// recorded nothing at all.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const gate = await authorize(req, "/api/sandbox/[id]/approve")
  if (gate.error) return gate.error
  const { orgId, userId } = gate

  const res = await db.sandboxChange.deleteMany({ where: { id, project: { orgId } } })
  if (res.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 })
  await db.auditLog.create({
    data: {
      orgId, actorType: "user", actorId: userId,
      action: "sandbox.reject", target: id, metadata: JSON.stringify({ rejected: true }),
    },
  })
  return NextResponse.json({ ok: true })
}
