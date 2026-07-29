import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { createSafeWorkspace } from "@/lib/workspace"
import { db } from "@/lib/db"
import path from "path"
import { resolveWithinRoots, assertDirectory, PathNotAllowedError } from "@/lib/security/paths"
import { enforceRateLimit } from "@/lib/rate-limit"
import { analyzeProject } from "@/lib/project-intelligence"
import { internalError } from "@/lib/api-error"
import { auditUnauthorized } from "@/lib/audit-request"

// POST /api/workspace/create — scan a project folder + create AI-safe workspace copy
// Body: { sourcePath: string, projectName?: string }
//
// Authenticated only: this reads every file under sourcePath and extracts the
// secrets it finds, so it must never be reachable anonymously.
export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    )
  }

  const ctx = await getContext(req)
  if (!ctx || !ctx.user) {
    { await auditUnauthorized(req, "/api/workspace/create"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }
  }

  const { sourcePath, projectName } = await req.json().catch(() => ({}))
  if (!sourcePath) return NextResponse.json({ error: "sourcePath required" }, { status: 400 })

  // Confine to the configured project roots — path.resolve() alone would
  // accept any absolute location on the host filesystem.
  let resolved: string
  try {
    resolved = await resolveWithinRoots(sourcePath, "sourcePath")
    await assertDirectory(resolved, "sourcePath")
  } catch (e) {
    if (e instanceof PathNotAllowedError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  const name = projectName || path.basename(resolved)
  const intelligence = await analyzeProject(resolved).catch(() => null)
  const stack = intelligence?.stack || null

  // Find or create project record
  let project = await db.project.findFirst({ where: { orgId: ctx.orgId, name } })
  const duplicate = !!project
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
      source: "path",
      duplicate,
      stack,
      intelligence,
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
    return internalError(e, "workspace.create")
  }
}
