import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext } from "@/lib/auth"

// POST /api/marketplace/[id]/install — install an MCP package (increments installs).
// Authenticated only: prevents anonymous install-count inflation.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

  const pkg = await db.mcpPackage.findUnique({ where: { id } })
  if (!pkg) return NextResponse.json({ error: "not found" }, { status: 404 })

  const updated = await db.mcpPackage.update({ where: { id }, data: { installs: { increment: 1 } } })
  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user.id, action: "marketplace.install", target: id } })
  return NextResponse.json({ ok: true, package: updated })
}
