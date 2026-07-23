import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { createSafeWorkspace } from "@/lib/workspace"
import { analyzeProject } from "@/lib/project-intelligence"
import { db } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import path from "path"
import os from "os"
import { promises as fs } from "fs"

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

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    )
  }
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

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
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
      if (/Authentication|could not read Username|terminal prompts disabled|403/i.test(msg)) {
        return NextResponse.json({ error: "repository is private or requires authentication — only public repositories can be cloned here" }, { status: 400 })
      }
      if (/not found|repository .* does not exist|404/i.test(msg)) {
        return NextResponse.json({ error: "repository not found — check the URL" }, { status: 404 })
      }
      return NextResponse.json({ error: `git clone failed: ${msg.split("\n").slice(-3).join(" ").slice(0, 300)}` }, { status: 502 })
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

function sanitizeName(n: string): string {
  return n.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 60)
}
