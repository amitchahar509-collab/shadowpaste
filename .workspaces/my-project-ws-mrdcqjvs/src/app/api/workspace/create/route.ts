import { NextRequest, NextResponse } from "next/server"
import { getContext, anonymousContext } from "@/lib/auth"
import { createSafeWorkspace } from "@/lib/workspace"
import { db } from "@/lib/db"
import { promises as fs } from "fs"
import path from "path"

// POST /api/workspace/create — scan a project folder + create AI-safe workspace copy
// Body: { sourcePath: string, projectName?: string }
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const { sourcePath, projectName } = await req.json()
  if (!sourcePath) return NextResponse.json({ error: "sourcePath required" }, { status: 400 })

  // Resolve and validate path (prevent path traversal)
  const resolved = path.resolve(sourcePath)
  try {
    const stat = await fs.stat(resolved)
    if (!stat.isDirectory()) return NextResponse.json({ error: "sourcePath must be a directory" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: `directory not found: ${resolved}` }, { status: 404 })
  }

  const name = projectName || path.basename(resolved)

  // Find or create project record
  let project = await db.project.findFirst({ where: { orgId: ctx.orgId, name } })
  if (!project) {
    project = await db.project.create({ data: { orgId: ctx.orgId, name, repoUrl: null, description: `Local project: ${resolved}` } })
  }

  try {
    const workspace = await createSafeWorkspace({
      projectId: project.id,
      orgId: ctx.orgId,
      sourcePath: resolved,
      projectName: name,
    })

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorType: ctx.user ? "user" : "system",
        actorId: ctx.user?.id,
        action: "workspace.create",
        target: workspace.id,
        metadata: JSON.stringify({ files: workspace.fileCount, secrets: workspace.secretCount, project: name }),
      },
    })

    return NextResponse.json({
      ok: true,
      workspace: {
        id: workspace.id,
        projectId: workspace.projectId,
        workspacePath: workspace.workspacePath,
        status: workspace.status,
        fileCount: workspace.fileCount,
        secretCount: workspace.secretCount,
        secrets: workspace.secrets.map((s) => ({ filePath: s.filePath, line: s.line, fake: s.fake, provider: s.provider, vaulted: s.vaulted })),
        createdAt: workspace.createdAt.toISOString(),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
