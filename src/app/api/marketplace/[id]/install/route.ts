import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/marketplace/[id]/install — install an MCP package (increments installs)
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const pkg = await db.mcpPackage.update({ where: { id }, data: { installs: { increment: 1 } } })
  return NextResponse.json({ ok: true, package: pkg })
}
