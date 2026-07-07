import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { generateSyntheticChanges, analyzeDiff } from "@/lib/sandbox"

// GET /api/sandbox?projectId=... — list sandbox changes for a project
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId")
  if (!projectId) {
    // Return all projects with sandbox activity
    const projects = await db.project.findMany({ include: { _count: { select: { sandboxChanges: true } } }, orderBy: { updatedAt: "desc" } })
    return NextResponse.json({ projects })
  }
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { sandboxChanges: { orderBy: { createdAt: "desc" } } },
  })
  return NextResponse.json({ project })
}

// POST — create sandbox + synthetic changes for a project (demo shadow workspace)
export async function POST(req: Request) {
  const body = await req.json()
  const { projectId } = body
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 })
  const changes = generateSyntheticChanges(project.name)
  for (const c of changes) {
    const analyzed = analyzeDiff(c.diff)
    await db.sandboxChange.create({ data: { projectId, filePath: c.filePath, changeType: c.changeType, diff: c.diff, riskLevel: analyzed.riskLevel, riskReason: analyzed.riskReason, approved: false } })
  }
  await db.project.update({ where: { id: projectId }, data: { sandboxStatus: "modified" } })
  return NextResponse.json({ ok: true, changes: changes.length })
}
