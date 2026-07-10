import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// DELETE /api/permissions/[id]
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.permission.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
