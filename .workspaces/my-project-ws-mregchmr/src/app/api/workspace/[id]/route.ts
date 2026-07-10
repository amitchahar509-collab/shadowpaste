import { NextRequest, NextResponse } from "next/server"
import { listWorkspaceFiles } from "@/lib/workspace"
import { promises as fs } from "fs"

// GET /api/workspace/[id]?workspacePath=... — list workspace files + status
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params
  const { searchParams } = new URL(req.url)
  const workspacePath = searchParams.get("workspacePath")
  if (!workspacePath) return NextResponse.json({ error: "workspacePath required" }, { status: 400 })

  try {
    const files = await listWorkspaceFiles(workspacePath)
    return NextResponse.json({ files, count: files.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// DELETE — remove a workspace
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params
  const { searchParams } = new URL(_req.url)
  const workspacePath = searchParams.get("workspacePath")
  if (!workspacePath) return NextResponse.json({ error: "workspacePath required" }, { status: 400 })
  try {
    await fs.rm(workspacePath, { recursive: true, force: true })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
