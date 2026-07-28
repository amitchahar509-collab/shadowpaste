import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext } from "@/lib/auth"
import { auditUnauthorized } from "@/lib/audit-request"

// POST /api/sandbox/[id]/approve — approve a sandbox change (merge into "main").
// Authenticated + tenant-scoped: this is the human gate that lets AI changes
// land, so it must not be reachable anonymously or across orgs.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/sandbox/[id]/approve"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const existing = await db.sandboxChange.findFirst({ where: { id, project: { orgId: authCtx.orgId } } })
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 })

  const change = await db.sandboxChange.update({ where: { id }, data: { approved: true } })
  const pending = await db.sandboxChange.count({ where: { projectId: change.projectId, approved: false } })
  if (pending === 0) {
    await db.project.update({ where: { id: change.projectId }, data: { sandboxStatus: "merged" } })
  }
  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user.id, action: "sandbox.approve", target: id, metadata: JSON.stringify({ merged: pending === 0 }) } })
  return NextResponse.json({ ok: true, change, merged: pending === 0 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/sandbox/[id]/approve"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const res = await db.sandboxChange.deleteMany({ where: { id, project: { orgId: authCtx.orgId } } })
  if (res.count === 0) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
