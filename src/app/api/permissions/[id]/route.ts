import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext } from "@/lib/auth"
import { auditUnauthorized } from "@/lib/audit-request"

// DELETE /api/permissions/[id] — revoke a permission grant.
// Authenticated + tenant-scoped.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/permissions/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const res = await db.permission.deleteMany({ where: { id, agent: { orgId: authCtx.orgId } } })
  if (res.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 })

  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user.id, action: "permission.revoke", target: id } })
  return NextResponse.json({ ok: true })
}
