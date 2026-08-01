import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { listWorkspaceFiles, WORKSPACE_ROOT, orgWorkspaceRoot } from "@/lib/workspace"
import { getContext } from "@/lib/auth"
import { isWithin } from "@/lib/security/paths"
import { internalError } from "@/lib/api-error"
import { auditUnauthorized } from "@/lib/audit-request"

// Both handlers take a caller-supplied workspacePath that reaches the
// filesystem. It is confined to WORKSPACE_ROOT (.workspaces/) — generated
// workspaces are the only thing these endpoints may ever touch — and both
// require authentication.
// Confined to the CALLER'S OWN org directory, not to WORKSPACE_ROOT.
//
// Confining to WORKSPACE_ROOT alone was satisfied by any authenticated user, so
// there was no tenancy check at all: org B could read — and DELETE — org A's
// workspace just by passing its path. Workspaces have no DB row to check
// ownership against, so the org boundary is enforced by the path itself.
async function resolveWorkspacePath(raw: string | null, orgId: string): Promise<string | null> {
  if (!raw || raw.includes("\0")) return null
  let resolved = path.resolve(raw)
  try {
    resolved = await fs.realpath(resolved)
  } catch {
    return null
  }
  // realpath resolves symlinks first, so a link planted inside the caller's own
  // directory cannot be used to reach another tenant's tree.
  return isWithin(orgWorkspaceRoot(orgId), resolved) ? resolved : null
}

// GET /api/workspace/[id]?workspacePath=... — list workspace files + status
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params
  const auth = await getContext(req)
  if (!auth || !auth.user) { await auditUnauthorized(req, "/api/workspace/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const resolved = await resolveWorkspacePath(searchParams.get("workspacePath"), auth.orgId)
  if (!resolved) return NextResponse.json({ error: "invalid workspacePath" }, { status: 400 })

  try {
    const files = await listWorkspaceFiles(resolved)
    return NextResponse.json({ files, count: files.length })
  } catch (e) {
    return internalError(e, "workspace.id")
  }
}

// DELETE — remove a workspace
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await ctx.params
  const auth = await getContext(req)
  if (!auth || !auth.user) { await auditUnauthorized(req, "/api/workspace/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const resolved = await resolveWorkspacePath(searchParams.get("workspacePath"), auth.orgId)
  // Refuse to delete the root itself — only workspaces beneath it.
  if (!resolved || resolved === WORKSPACE_ROOT || resolved === orgWorkspaceRoot(auth.orgId)) {
    return NextResponse.json({ error: "invalid workspacePath" }, { status: 400 })
  }

  try {
    await fs.rm(resolved, { recursive: true, force: true })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return internalError(e, "workspace.id")
  }
}
