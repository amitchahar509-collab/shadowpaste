import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { createSafeWorkspace } from "@/lib/workspace"
import { analyzeProject } from "@/lib/project-intelligence"
import { db } from "@/lib/db"
import { enforceRateLimit } from "@/lib/rate-limit"
import path from "path"
import os from "os"
import { promises as fs } from "fs"
import { internalError } from "@/lib/api-error"
import { auditUnauthorized } from "@/lib/audit-request"
import { classifyArchive, extractArchive, IMPORT_LIMITS } from "@/lib/archive"
import { IMPORT_MAX_BYTES, IMPORT_MAX_FILES, overBudgetError } from "@/lib/import-budget"

export const runtime = "nodejs"

// POST /api/workspace/upload — import a whole FOLDER selected/dropped in the
// browser (no server-side path needed). The client reads the folder's files
// (via <input webkitdirectory> or drag-drop directory entries) and posts:
//   multipart/form-data:
//     files      : File[]           (the file blobs)
//     paths      : JSON string[]     (each file's path relative to the folder)
//     projectName: string?           (defaults to the top folder name)
//
// Files are reconstructed into a temp tree, then run through createSafeWorkspace.
// Every relative path is confined inside the temp dir (no traversal), and
// node_modules/.git style dirs are skipped so uploads stay small.

// These used to be 20,000 files / 200 MB — LOOSER than the extraction limits
// they sit in front of, and far past what the import can finish inside a
// request deadline. Both now come from the same measured budget.
const MAX_FILES = IMPORT_MAX_FILES
const MAX_TOTAL_BYTES = IMPORT_MAX_BYTES
const SKIP_SEGMENTS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces"])

export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    )
  }
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/workspace/upload"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  // Check the declared size BEFORE parsing. req.formData() throws on a body
  // larger than the runtime will buffer, and that throw is indistinguishable
  // from "this isn't multipart" — so an over-sized upload used to be reported as
  // `expected a multipart/form-data upload`, which is both wrong and unactionable
  // (measured: a 12 MB upload got that 400). Content-Length lets the budget
  // check run first and return the real reason.
  const declared = Number(req.headers.get("content-length") || 0)
  if (declared > MAX_TOTAL_BYTES) {
    return NextResponse.json(overBudgetError("size"), { status: 413 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    // No Content-Length (chunked) and the parse failed: still most likely size.
    return NextResponse.json(
      declared === 0
        ? { ...overBudgetError("size"), error: "could not read the upload — it is either not multipart/form-data, or larger than this deployment accepts" }
        : { error: "expected a multipart/form-data upload" },
      { status: declared === 0 ? 413 : 400 }
    )
  }

  const files = form.getAll("files").filter((f): f is File => typeof f !== "string")
  if (files.length === 0) return NextResponse.json({ error: "no files uploaded" }, { status: 400 })
  if (files.length > MAX_FILES) return NextResponse.json(overBudgetError("files"), { status: 413 })

  // `paths[]` carries webkitRelativePath for a folder pick, so the directory
  // tree can be rebuilt. A plain file pick (or any API client) has no relative
  // paths — that case used to 400 with "paths[] must match files[] length",
  // which made every upload that was not a folder pick impossible. Fall back to
  // the files' own names instead of rejecting.
  const rawPaths = String(form.get("paths") || "")
  let relPaths: string[]
  try { relPaths = rawPaths ? JSON.parse(rawPaths) : [] } catch { relPaths = [] }
  if (!Array.isArray(relPaths) || relPaths.length === 0) {
    relPaths = files.map((f, i) => f.name || `file-${i}`)
  }
  if (relPaths.length !== files.length) {
    return NextResponse.json({ error: "paths[] must match files[] length" }, { status: 400 })
  }

  // Derive the project name from the common top-level folder.
  const firstSeg = (relPaths[0] || "").replace(/\\/g, "/").split("/")[0]
  const projectName = sanitizeName(String(form.get("projectName") || firstSeg || "uploaded-project")) || "uploaded-project"

  const tmpDir = path.join(os.tmpdir(), `shadowpaste-upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
  const destResolved = path.resolve(tmpDir)

  try {
    await fs.mkdir(destResolved, { recursive: true })
    // Detect and strip a single common wrapping folder (webkitRelativePath
    // always includes the picked folder as the first segment).
    const rootPrefix = detectRootPrefix(relPaths)

    let written = 0, total = 0, skipped = 0
    for (let i = 0; i < files.length; i++) {
      let rel = String(relPaths[i] || "").replace(/\\/g, "/").replace(/^\/+/, "")
      if (rootPrefix && rel.startsWith(rootPrefix)) rel = rel.slice(rootPrefix.length)
      if (!rel) continue
      const segments = rel.split("/").filter(Boolean)
      if (segments.some((s) => SKIP_SEGMENTS.has(s))) { skipped++; continue }

      const outPath = path.resolve(destResolved, rel)
      if (outPath !== destResolved && !outPath.startsWith(destResolved + path.sep)) {
        return NextResponse.json({ error: `path escapes upload root: ${rel}` }, { status: 400 })
      }
      const size = files[i].size
      total += size
      if (total > MAX_TOTAL_BYTES) return NextResponse.json(overBudgetError("size"), { status: 413 })

      const buf = Buffer.from(await files[i].arrayBuffer())

      // An uploaded .zip/.tar/.tgz is a PROJECT, not a file to drop in verbatim.
      // Without this the workspace contained a single opaque archive: the stack
      // detector saw nothing, the secret scanner scanned a compressed blob and
      // reported 0 findings, and the import looked successful while doing
      // nothing. Extract single-archive uploads into the workspace root.
      const kind = classifyArchive(files[i].name || rel, buf)
      if (kind && files.length === 1) {
        const r = await extractArchive(buf, files[i].name || rel, destResolved, IMPORT_LIMITS)
        written += r.files ?? 0
        // Archives usually wrap everything in one top-level directory; lift it so
        // package.json and friends sit where the analyzer expects them.
        const top = await fs.readdir(destResolved, { withFileTypes: true })
        if (top.length === 1 && top[0].isDirectory()) {
          const inner = path.join(destResolved, top[0].name)
          for (const child of await fs.readdir(inner)) {
            await fs.rename(path.join(inner, child), path.join(destResolved, child))
          }
          await fs.rmdir(inner).catch(() => {})
        }
        continue
      }

      await fs.mkdir(path.dirname(outPath), { recursive: true })
      await fs.writeFile(outPath, buf)
      written++
    }
    if (written === 0) return NextResponse.json({ error: "no importable files (everything was skipped or empty)" }, { status: 400 })

    const intelligence = await analyzeProject(destResolved).catch(() => null)
    const stack = intelligence?.stack || null

    let project = await db.project.findFirst({ where: { orgId: ctx.orgId, name: projectName } })
    const duplicate = !!project
    if (!project) {
      project = await db.project.create({ data: { orgId: ctx.orgId, name: projectName, repoUrl: null, description: `Uploaded folder: ${projectName}` } })
    }

    const workspace = await createSafeWorkspace({ projectId: project.id, orgId: ctx.orgId, sourcePath: destResolved, projectName })

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId, actorType: "user", actorId: ctx.user.id, action: "workspace.upload", target: workspace.id,
        metadata: JSON.stringify({ source: "folder", uploaded: written, skipped, files: workspace.fileCount, secrets: workspace.secretCount, project: projectName }),
      },
    })

    return NextResponse.json({
      ok: true,
      source: "folder",
      duplicate,
      stack,
      intelligence,
      workspace: {
        id: workspace.id, projectId: workspace.projectId, workspacePath: workspace.workspacePath, status: workspace.status,
        fileCount: workspace.fileCount, secretCount: workspace.secretCount,
        secrets: workspace.secrets.map((s) => ({ filePath: s.filePath, line: s.line, fake: s.fake, provider: s.provider, vaulted: s.vaulted })),
        createdAt: workspace.createdAt.toISOString(),
      },
    })
  } catch (e) {
    return internalError(e, "workspace.upload")
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

function detectRootPrefix(paths: string[]): string | null {
  const firsts = new Set<string>()
  for (const p of paths) {
    const seg = String(p).replace(/\\/g, "/").split("/")[0]
    if (seg) firsts.add(seg)
    if (firsts.size > 1) return null
  }
  if (firsts.size !== 1) return null
  return [...firsts][0] + "/"
}

function sanitizeName(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60)
}
