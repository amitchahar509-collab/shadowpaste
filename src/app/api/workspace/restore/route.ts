import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { restoreSecrets, type WorkspaceSecret } from "@/lib/workspace"
import { db } from "@/lib/db"
import { resolveWithinRoots, assertDirectory, PathNotAllowedError } from "@/lib/security/paths"
import { checkRateLimit } from "@/lib/rate-limit"

// POST /api/workspace/restore — restore real secrets back into the source project
// Body: { workspacePath: string, sourcePath: string, secrets: [...] }
//
// Authenticated only: this writes caller-supplied content into sourcePath, so
// an anonymous caller here would mean arbitrary file write on the host.
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

  const { workspacePath, sourcePath, secrets } = await req.json()
  if (!workspacePath || !sourcePath || !Array.isArray(secrets)) {
    return NextResponse.json({ error: "workspacePath, sourcePath, secrets[] required" }, { status: 400 })
  }

  let resolvedWorkspace: string
  let resolvedSource: string
  try {
    resolvedWorkspace = await resolveWithinRoots(workspacePath, "workspacePath")
    resolvedSource = await resolveWithinRoots(sourcePath, "sourcePath")
    await assertDirectory(resolvedWorkspace, "workspacePath")
    await assertDirectory(resolvedSource, "sourcePath")
  } catch (e) {
    if (e instanceof PathNotAllowedError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    throw e
  }

  try {
    const result = await restoreSecrets({
      workspacePath: resolvedWorkspace,
      sourcePath: resolvedSource,
      secrets: secrets as WorkspaceSecret[],
    })

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "workspace.restore",
        target: resolvedWorkspace,
        metadata: JSON.stringify({ restored: result.restored, errors: result.errors.length }),
      },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
