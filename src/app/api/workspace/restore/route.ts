import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { restoreSecrets, restoreFromMeta, type WorkspaceSecret } from "@/lib/workspace"
import { db } from "@/lib/db"
import { resolveWithinRoots, assertDirectory, PathNotAllowedError } from "@/lib/security/paths"
import { checkRateLimit } from "@/lib/rate-limit"
import { internalError } from "@/lib/api-error"

// POST /api/workspace/restore — restore real secrets back into the source project.
//
// Two forms:
//   { workspacePath }                          → reads .shadowpaste-meta.json in
//                                                the workspace (dashboard path —
//                                                caller never holds real secrets)
//   { workspacePath, sourcePath, secrets[] }   → explicit mapping (CLI path)
//
// Authenticated only: this writes content into the source project, so an
// anonymous caller would mean arbitrary file write on the host.
export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    )
  }

  const ctx = await getContext(req)
  if (!ctx || !ctx.user) {
    return NextResponse.json({ error: "authentication required" }, { status: 401 })
  }

  const { workspacePath, sourcePath, secrets } = await req.json().catch(() => ({}))
  if (!workspacePath) {
    return NextResponse.json({ error: "workspacePath required" }, { status: 400 })
  }

  // Confine the workspace path in both modes.
  let resolvedWorkspace: string
  try {
    resolvedWorkspace = await resolveWithinRoots(workspacePath, "workspacePath")
    await assertDirectory(resolvedWorkspace, "workspacePath")
  } catch (e) {
    if (e instanceof PathNotAllowedError) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }

  try {
    let result: { restored: number; errors: string[] }
    let target = resolvedWorkspace

    if (Array.isArray(secrets) && sourcePath) {
      // Explicit mapping form (CLI-style).
      const resolvedSource = await resolveWithinRoots(sourcePath, "sourcePath")
      await assertDirectory(resolvedSource, "sourcePath")
      result = await restoreSecrets({ workspacePath: resolvedWorkspace, sourcePath: resolvedSource, secrets: secrets as WorkspaceSecret[] })
      target = resolvedSource
    } else {
      // Meta-driven form: the workspace carries its own real↔fake mapping and
      // source path. We still confine the recorded source path.
      const meta = await import("@/lib/workspace").then((m) => m.readWorkspaceMeta(resolvedWorkspace))
      if (!meta) return NextResponse.json({ error: "no .shadowpaste-meta.json in workspace — provide sourcePath + secrets[]" }, { status: 400 })
      await resolveWithinRoots(meta.sourcePath, "sourcePath") // throws if the recorded source escaped the roots
      const r = await restoreFromMeta(resolvedWorkspace)
      result = { restored: r.restored, errors: r.errors }
      target = r.sourcePath
    }

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "workspace.restore",
        target,
        metadata: JSON.stringify({ restored: result.restored, errors: result.errors.length }),
      },
    })

    return NextResponse.json({ ok: true, ...result, sourcePath: target })
  } catch (e) {
    if (e instanceof PathNotAllowedError) return NextResponse.json({ error: e.message }, { status: 400 })
    return internalError(e, "workspace.restore")
  }
}
