import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { createSafeWorkspace } from "@/lib/workspace"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { extractZip, ZipError } from "@/lib/zip"
import path from "path"
import os from "os"
import { promises as fs } from "fs"

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

const MAX_ZIP_BYTES = 100 * 1024 * 1024 // 100 MB compressed upload cap
// Never extract these into the temp source tree — keeps imports small and fast.
// (createSafeWorkspace skips them again when copying, but skipping here avoids
// writing them to disk at all.)
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces"])

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

  const nameLower = (upload.name || "").toLowerCase()
  if (!nameLower.endsWith(".zip")) {
    return NextResponse.json({ error: "file must be a .zip archive" }, { status: 400 })
  }
  if (upload.size === 0) {
    return NextResponse.json({ error: "uploaded ZIP is empty" }, { status: 400 })
  }
  if (upload.size > MAX_ZIP_BYTES) {
    return NextResponse.json(
      { error: `ZIP too large (max ${Math.round(MAX_ZIP_BYTES / 1048576)} MB)` },
      { status: 413 }
    )
  }

  const buf = Buffer.from(await upload.arrayBuffer())
  // ZIP magic: local-file-header "PK\x03\x04" or empty-archive EOCD "PK\x05\x06".
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    return NextResponse.json({ error: "not a valid ZIP file" }, { status: 400 })
  }

  const projectName = sanitizeName(upload.name.replace(/\.zip$/i, "")) || "imported-project"
  const tmpDir = path.join(
    os.tmpdir(),
    `shadowpaste-import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  )

  try {
    let extracted
    try {
      extracted = await extractZip(buf, tmpDir, { skipDirs: SKIP_DIRS })
    } catch (e) {
      if (e instanceof ZipError) return NextResponse.json({ error: e.message }, { status: 400 })
      throw e
    }
    if (extracted.files === 0) {
      return NextResponse.json({ error: "ZIP contained no importable files" }, { status: 400 })
    }

    // Find or create the project record (same behaviour as /create).
    let project = await db.project.findFirst({ where: { orgId: ctx.orgId, name: projectName } })
    if (!project) {
      project = await db.project.create({
        data: { orgId: ctx.orgId, name: projectName, repoUrl: null, description: `Imported from ZIP: ${upload.name}` },
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
          source: "zip",
          fileName: upload.name,
          files: workspace.fileCount,
          secrets: workspace.secretCount,
          project: projectName,
        }),
      },
    })

    return NextResponse.json({
      ok: true,
      source: "zip",
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
