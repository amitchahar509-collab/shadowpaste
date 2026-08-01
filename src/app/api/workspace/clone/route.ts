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

export const runtime = "nodejs"

// POST /api/workspace/clone — clone a PUBLIC git repository over HTTPS and
// create an AI-safe workspace from it. Covers GitHub, GitLab, Bitbucket, and
// Azure DevOps (all expose HTTPS clone URLs).
//
// Body: { repoUrl: string, projectName?: string }
//
// Security:
//   - HTTPS only, host allow-listed → blocks SSRF to internal/localhost/file://.
//   - Cloned via execFileSync with an argv array (no shell) and a leading `--`
//     so a URL can never be interpreted as a git option.
//   - GIT_TERMINAL_PROMPT=0 → a private repo fails fast instead of hanging on a
//     credential prompt. We never handle credentials here (public repos only).

const ALLOWED_HOSTS = new Set([
  "github.com", "www.github.com",
  "gitlab.com", "www.gitlab.com",
  "bitbucket.org", "www.bitbucket.org",
  "dev.azure.com", "ssh.dev.azure.com",
  "codeberg.org", "gitea.com",
])
const CLONE_TIMEOUT_MS = 90_000
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces"])
const MAX_TARBALL_BYTES = 100 * 1024 * 1024

/**
 * Fetch a public repository as an HTTPS tarball instead of shelling out to git.
 *
 * Used when no `git` binary exists (serverless). The URL is built from the
 * ALREADY-VALIDATED `url` — same host allowlist, same https-only, same
 * no-credentials rules — so this does not widen what can be reached. Returns
 * null on success, or the error to surface.
 */
async function downloadTarball(url: URL, destDir: string): Promise<{ error: string; status: number } | null> {
  const host = url.hostname.toLowerCase()
  const segs = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean)
  if (segs.length < 2) return { error: "repository URL must include owner and repository name", status: 400 }
  const [owner, repo] = segs

  let tarUrl: string
  if (host.endsWith("github.com")) tarUrl = `https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`
  else if (host.endsWith("gitlab.com")) tarUrl = `https://gitlab.com/${owner}/${repo}/-/archive/HEAD/${repo}-HEAD.tar.gz`
  else if (host.endsWith("codeberg.org") || host.endsWith("gitea.com")) tarUrl = `https://${host}/${owner}/${repo}/archive/HEAD.tar.gz`
  else return { error: `cloning from ${host} needs a git binary, which this deployment does not have. Use a GitHub, GitLab, Codeberg or Gitea URL, or self-host.`, status: 501 }

  let res: Response
  try {
    res = await fetch(tarUrl, { redirect: "follow", signal: AbortSignal.timeout(CLONE_TIMEOUT_MS) })
  } catch (e) {
    return { error: `could not download repository archive: ${(e as Error).message.slice(0, 120)}`, status: 502 }
  }
  if (res.status === 404) return { error: "repository not found — check the URL", status: 404 }
  if (res.status === 401 || res.status === 403) {
    return { error: "repository is private or requires authentication — only public repositories can be cloned here", status: 400 }
  }
  if (!res.ok) return { error: `repository archive download failed (HTTP ${res.status})`, status: 502 }

  const len = Number(res.headers.get("content-length") || 0)
  if (len > MAX_TARBALL_BYTES) return { error: "repository is too large to import here", status: 413 }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > MAX_TARBALL_BYTES) return { error: "repository is too large to import here", status: 413 }

  const { extractArchive, IMPORT_LIMITS } = await import("@/lib/archive")
  try {
    // The extractor enforces path-traversal and zip-bomb limits; the archive is
    // remote input, so those checks matter as much here as for an upload.
    await extractArchive(buf, `${repo}.tar.gz`, destDir, IMPORT_LIMITS)
  } catch (e) {
    return { error: `could not extract repository archive: ${(e as Error).message.slice(0, 160)}`, status: 502 }
  }

  // Host tarballs wrap everything in a single `<repo>-<ref>/` directory. Lift it
  // so the workspace root looks the same as a `git clone` result.
  try {
    const entries = await fs.readdir(destDir, { withFileTypes: true })
    if (entries.length === 1 && entries[0].isDirectory()) {
      const inner = path.join(destDir, entries[0].name)
      for (const child of await fs.readdir(inner)) {
        await fs.rename(path.join(inner, child), path.join(destDir, child))
      }
      await fs.rmdir(inner).catch(() => {})
    }
  } catch { /* leaving the wrapper directory in place is not fatal */ }
  return null
}

export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    )
  }
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/workspace/clone"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const { repoUrl, projectName } = await req.json().catch(() => ({}))
  if (!repoUrl || typeof repoUrl !== "string") {
    return NextResponse.json({ error: "repoUrl required" }, { status: 400 })
  }

  // Validate URL: https only, allow-listed host, no option-injection.
  let url: URL
  try { url = new URL(repoUrl.trim()) } catch { return NextResponse.json({ error: "invalid repository URL" }, { status: 400 }) }
  if (url.protocol !== "https:") {
    return NextResponse.json({ error: "only HTTPS clone URLs are supported here. For SSH or private repos, use the CLI: shadowpaste protect -p <local clone>" }, { status: 400 })
  }
  if (url.username || url.password) {
    return NextResponse.json({ error: "credentials in the URL are not accepted — only public repositories can be cloned here" }, { status: 400 })
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
    return NextResponse.json({ error: `host not allowed: ${url.hostname}. Supported: GitHub, GitLab, Bitbucket, Azure DevOps, Codeberg, Gitea.` }, { status: 400 })
  }

  const repoLeaf = url.pathname.replace(/\.git$/, "").split("/").filter(Boolean).pop() || "repo"
  const name = sanitizeName(projectName || repoLeaf) || "cloned-project"
  const tmpDir = path.join(os.tmpdir(), `shadowpaste-clone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)

  try {
    const { execFileSync } = await import("child_process")
    try {
      execFileSync(
        "git",
        ["clone", "--depth", "1", "--single-branch", "--no-tags", "--", url.toString(), tmpDir],
        { stdio: "pipe", timeout: CLONE_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } }
      )
    } catch (e) {
      const msg = (e as Error & { stderr?: Buffer }).stderr?.toString() || (e as Error).message
      // A serverless runtime has no `git` binary at all (spawn ENOENT), which
      // made this endpoint a guaranteed 502 in production. Fall back to the
      // host's HTTPS tarball, which needs no external process. Same transport,
      // same public-repo-only guarantees — just no git.
      if (/ENOENT|not recognized|command not found/i.test(msg)) {
        const tarErr = await downloadTarball(url, tmpDir)
        if (tarErr) {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
          return NextResponse.json({ error: tarErr.error }, { status: tarErr.status })
        }
      } else {
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
        if (/Authentication|could not read Username|terminal prompts disabled|403/i.test(msg)) {
          return NextResponse.json({ error: "repository is private or requires authentication — only public repositories can be cloned here" }, { status: 400 })
        }
        if (/not found|repository .* does not exist|404/i.test(msg)) {
          return NextResponse.json({ error: "repository not found — check the URL" }, { status: 404 })
        }
        return NextResponse.json({ error: `git clone failed: ${msg.split("\n").slice(-3).join(" ").slice(0, 300)}` }, { status: 502 })
      }
    }

    const intelligence = await analyzeProject(tmpDir).catch(() => null)
    const stack = intelligence?.stack || null

    let project = await db.project.findFirst({ where: { orgId: ctx.orgId, name } })
    const duplicate = !!project
    if (!project) {
      project = await db.project.create({ data: { orgId: ctx.orgId, name, repoUrl: url.toString(), description: `Cloned from ${url.hostname}` } })
    }

    const workspace = await createSafeWorkspace({ projectId: project.id, orgId: ctx.orgId, sourcePath: tmpDir, projectName: name })

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId, actorType: "user", actorId: ctx.user.id, action: "workspace.clone", target: workspace.id,
        metadata: JSON.stringify({ source: "git", repoUrl: url.toString(), files: workspace.fileCount, secrets: workspace.secretCount, project: name }),
      },
    })

    return NextResponse.json({
      ok: true,
      source: "git",
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
    return internalError(e, "workspace.clone")
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

function sanitizeName(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60)
}
