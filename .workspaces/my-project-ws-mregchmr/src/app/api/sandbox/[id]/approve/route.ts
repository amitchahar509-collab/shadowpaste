import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/sandbox/[id]/approve — approve a sandbox change (merge into "main")
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const change = await db.sandboxChange.update({ where: { id }, data: { approved: true } })
  // Check if all changes for this project are approved
  const pending = await db.sandboxChange.count({ where: { projectId: change.projectId, approved: false } })
  if (pending === 0) {
    await db.project.update({ where: { id: change.projectId }, data: { sandboxStatus: "merged" } })
  }
  return NextResponse.json({ ok: true, change, merged: pending === 0 })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  await db.sandboxChange.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
