import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { createSafeWorkspace } from "@/lib/workspace"
import { db } from "@/lib/db"
import { enforceRateLimit } from "@/lib/rate-limit"
import { extractArchive, classifyArchive, ZipError } from "@/lib/archive"
import { analyzeProject } from "@/lib/project-intelligence"
import path from "path"
import os from "os"
import { promises as fs } from "fs"
import { internalError } from "@/lib/api-error"
import { auditUnauthorized } from "@/lib/audit-request"

// This route uses node:fs / node:zlib and reads a multipart body — force the
// Node runtime (not edge).
export const runtime = "nodejs"

// POST /api/workspace/import — upload a project as a .zip and create an
// AI-safe workspace copy from it.
//
// multipart/form-data with a single `file` field (the .zip). Mirrors
// /api/workspace/create, but the source is an uploaded archive rather than a
// server-side folder path, so there is no filesystem-confinement check: the
// bytes come from the authenticated user and are expanded into a throwaway temp
// directory that only this request can see.
//
// Authenticated only: scanning extracts the secrets it finds, so it must never
// be reachable anonymously.

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024 // 200 MB compressed upload cap
// Never extract these into the temp source tree — keeps imports small and fast.
// (createSafeWorkspace skips them again when copying, but skipping here avoids
// writing them to disk at all.)
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces"])

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
    { await auditUnauthorized(req, "/api/workspace/import"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "expected a multipart/form-data upload" }, { status: 400 })
  }

  const file = form.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "no file uploaded (expected form field 'file')" }, { status: 400 })
  }
  const upload = file as File

  if (upload.size === 0) {
    return NextResponse.json({ error: "uploaded archive is empty" }, { status: 400 })
  }
  if (upload.size > MAX_ARCHIVE_BYTES) {
    return NextResponse.json(
      { error: `archive too large (max ${Math.round(MAX_ARCHIVE_BYTES / 1048576)} MB)` },
      { status: 413 }
    )
  }

  const buf = Buffer.from(await upload.arrayBuffer())
  // Accept .zip / .tar / .tar.gz / .tgz — validated by extension + magic bytes.
  const kind = classifyArchive(upload.name || "", buf)
  if (!kind) {
    return NextResponse.json({ error: "unsupported archive — use .zip, .tar, .tar.gz, or .tgz" }, { status: 400 })
  }

  const projectName = sanitizeName(upload.name.replace(/\.(zip|tar\.gz|tgz|tar|gz)$/i, "")) || "imported-project"
  const tmpDir = path.join(
    os.tmpdir(),
    `shadowpaste-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )

  try {
    let extracted
    try {
      extracted = await extractArchive(buf, upload.name || "", tmpDir, { skipDirs: SKIP_DIRS })
    } catch (e) {
      if (e instanceof ZipError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }
    if (extracted.files === 0) {
      return NextResponse.json({ error: "archive contained no importable files" }, { status: 400 })
    }

    // Detect the project stack from the extracted tree (framework/git/deps).
    const intelligence = await analyzeProject(tmpDir).catch(() => null)
    const stack = intelligence?.stack || null

    // Find or create the project record. `duplicate` tells the UI this name
    // already existed so it can warn instead of silently re-importing.
    let project = await db.project.findFirst({ where: { orgId: ctx.orgId, name: projectName } })
    const duplicate = !!project
    if (!project) {
      project = await db.project.create({
        data: { orgId: ctx.orgId, name: projectName, repoUrl: null, description: `Imported from ${kind}: ${upload.name}` },
      })
    }

    const workspace = await createSafeWorkspace({
      projectId: project.id,
      orgId: ctx.orgId,
      sourcePath: tmpDir,
      projectName,
    })

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorType: "user",
        actorId: ctx.user.id,
        action: "workspace.import",
        target: workspace.id,
        metadata: JSON.stringify({
          source: kind,
          fileName: upload.name,
          files: workspace.fileCount,
          secrets: workspace.secretCount,
          project: projectName,
        }),
      },
    })

    return NextResponse.json({
      ok: true,
      source: kind,
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
    return internalError(e, "workspace.import")
  } finally {
    // The AI-safe copy lives in .workspaces/; the raw extracted source is
    // disposable — remove it so uploads don't accumulate on disk.
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** Make a filesystem/DB-friendly project name from the uploaded filename. */
function sanitizeName(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60)
}
