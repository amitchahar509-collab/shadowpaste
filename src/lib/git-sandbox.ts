// ShadowPaste V20 — Real Git-based Sandbox Engine
// Flow: repo → temp branch → AI changes (via fs.write) → security scan → diff → approve → merge
// AI never touches production directly.

import { promises as fs } from "fs"
import path from "path"
import { db } from "@/lib/db"
import { analyzeDiff } from "@/lib/sandbox"
import { isWithin } from "@/lib/security/paths"

const SANDBOX_ROOT = path.resolve(process.cwd(), ".sandbox")

export interface SandboxRepo {
  projectId: string
  repoPath: string
  branch: string
  baseBranch: string
}

// Initialize a real git repo sandbox for a project
export async function initSandbox(projectId: string, projectName: string): Promise<SandboxRepo> {
  await fs.mkdir(SANDBOX_ROOT, { recursive: true })
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30)
  const repoPath = path.join(SANDBOX_ROOT, `${slug}-${projectId.slice(-6)}`)
  await fs.mkdir(repoPath, { recursive: true })

  // Initialize git repo if not exists. Every git invocation in this module
  // shells out through execFileSync with an argument array — never a single
  // interpolated string — so nothing (branch names, filenames from the repo)
  // is ever interpreted by a shell. Interpolating a repo filename into a
  // shelled `git diff ... "${file}"` was a command-injection sink on POSIX
  // hosts (a file named `` `id`.txt `` would execute).
  const { execFileSync } = await import("child_process")
  const git = (args: string[]) => execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  try {
    git(["init"])
    git(["config", "user.email", "sandbox@shadowpaste.io"])
    git(["config", "user.name", "ShadowPaste Sandbox"])
    // Create initial commit if empty
    const files = await fs.readdir(repoPath)
    if (files.filter((f) => f !== ".git").length === 0) {
      await fs.writeFile(path.join(repoPath, "README.md"), `# ${projectName}\n\nSandbox workspace for ShadowPaste.\n`)
      git(["add", "-A"])
      git(["commit", "-m", "Initial sandbox commit"])
    }
    // Normalise the base branch to "main" regardless of the host's
    // init.defaultBranch (git may create "master"). Without this, the hardcoded
    // baseBranch below never matches, and diff/merge/reject all fail with
    // "pathspec 'main' did not match".
    git(["branch", "-M", "main"])
    // Create sandbox branch
    const branch = `ai/sandbox-${Date.now().toString(36)}`
    git(["checkout", "-b", branch])
    await db.project.update({ where: { id: projectId }, data: { sandboxStatus: "created" } })
    return { projectId, repoPath, branch, baseBranch: "main" }
  } catch (e) {
    throw new Error(`Sandbox init failed: ${(e as Error).message}`)
  }
}

// Write a file to the sandbox repo (AI change).
//
// filePath and message come from the request body, so this used to be doubly
// unsafe: path.join let filePath escape the repo (../../etc/passwd), and the
// values were interpolated into a shelled-out `git ...` string (command
// injection). We now confine the path and shell out via execFileSync with an
// argument array so nothing is interpreted by a shell.
export async function writeSandboxFile(repoPath: string, filePath: string, content: string, message?: string): Promise<void> {
  const { execFileSync } = await import("child_process")
  if (typeof filePath !== "string" || filePath.includes("\0")) throw new Error("invalid filePath")

  const fullPath = path.resolve(repoPath, filePath.replace(/^[/\\]+/, ""))
  if (!isWithin(repoPath, fullPath) || fullPath === repoPath) {
    throw new Error(`filePath escapes the sandbox: ${filePath}`)
  }
  const relPath = path.relative(repoPath, fullPath)

  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content)
  execFileSync("git", ["add", "--", relPath], { cwd: repoPath, stdio: "pipe" })
  execFileSync("git", ["commit", "-m", message || `AI: update ${relPath}`], { cwd: repoPath, stdio: "pipe" })
}

// Generate real git diff between base and sandbox branch
export async function getSandboxDiff(repoPath: string, baseBranch: string, sandboxBranch: string): Promise<Array<{ filePath: string; changeType: "created" | "modified" | "deleted"; diff: string; riskLevel: string; riskReason: string }>> {
  const { execFileSync } = await import("child_process")
  const range = `${baseBranch}...${sandboxBranch}`
  try {
    // Get list of changed files
    const filesOutput = execFileSync("git", ["diff", "--name-status", range], { cwd: repoPath, encoding: "utf-8" }).trim()
    if (!filesOutput) return []
    const changes: Array<{ filePath: string; changeType: "created" | "modified" | "deleted"; diff: string; riskLevel: string; riskReason: string }> = []
    for (const line of filesOutput.split("\n")) {
      const [status, file] = line.split("\t")
      if (!file) continue
      const changeType = status === "A" ? "created" : status === "D" ? "deleted" : "modified"
      // `file` comes from the repo (user-controllable filename) — passed as a
      // standalone argv entry after `--`, so it is never shell-interpreted.
      const diff = execFileSync("git", ["diff", range, "--", file], { cwd: repoPath, encoding: "utf-8" })
      const analyzed = analyzeDiff(diff)
      changes.push({ filePath: file, changeType, diff, riskLevel: analyzed.riskLevel, riskReason: analyzed.riskReason })
    }
    return changes
  } catch (e) {
    return []
  }
}

// Merge sandbox branch to base (approve)
export async function mergeSandbox(repoPath: string, baseBranch: string, sandboxBranch: string): Promise<{ ok: boolean; message: string }> {
  const { execFileSync } = await import("child_process")
  const git = (args: string[]) => execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  try {
    git(["checkout", baseBranch])
    git(["merge", sandboxBranch, "--no-ff", "-m", "Approved: merge AI sandbox changes"])
    git(["branch", "-d", sandboxBranch])
    return { ok: true, message: `Merged ${sandboxBranch} into ${baseBranch}` }
  } catch (e) {
    return { ok: false, message: `Merge failed: ${(e as Error).message}` }
  }
}

// Reject: delete sandbox branch
export async function rejectSandbox(repoPath: string, sandboxBranch: string): Promise<{ ok: boolean; message: string }> {
  const { execFileSync } = await import("child_process")
  const git = (args: string[]) => execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  try {
    git(["checkout", "main"])
    git(["branch", "-D", sandboxBranch])
    return { ok: true, message: `Rejected and deleted ${sandboxBranch}` }
  } catch (e) {
    return { ok: false, message: `Reject failed: ${(e as Error).message}` }
  }
}
