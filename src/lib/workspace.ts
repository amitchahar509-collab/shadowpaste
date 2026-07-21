// ShadowPaste Core 1.0 — AI Safe Workspace
// The main user flow: select project → scan → create AI-safe copy → AI works inside → restore secrets
//
// The workspace is a real directory copy where all secrets are replaced with
// format-compatible fakes. AI coding tools (Claude Code, Cursor) work inside
// the workspace. When the developer is done, ShadowPaste restores real secrets
// from the vault back into the original project for commit.

import { promises as fs } from "fs"
import path from "path"
import { scanForSecrets } from "./security/detector"
import { virtualizeWithFakes, generateFakeSecret } from "./security/fake-secrets"
import { storeSecret } from "./security/vault"
import { db } from "./db"

export const WORKSPACE_ROOT = path.resolve(process.cwd(), ".workspaces")

export interface WorkspaceSecret {
  id: string
  filePath: string
  line: number
  raw: string
  fake: string
  provider: string
  vaulted: boolean
}

export interface SafeWorkspace {
  id: string
  projectId: string
  orgId: string
  sourcePath: string
  workspacePath: string
  status: "created" | "active" | "restored" | "abandoned"
  fileCount: number
  secretCount: number
  secrets: WorkspaceSecret[]
  createdAt: Date
}

// Scan a real project directory and create an AI-safe workspace copy
export async function createSafeWorkspace(opts: {
  projectId: string
  orgId: string
  sourcePath: string
  projectName: string
}): Promise<SafeWorkspace> {
  const { projectId, orgId, sourcePath, projectName } = opts
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true })

  const workspaceId = `ws-${Date.now().toString(36)}`
  const workspacePath = path.join(WORKSPACE_ROOT, `${projectName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-${workspaceId}`)
  await fs.mkdir(workspacePath, { recursive: true })

  // Walk the source directory (skip node_modules, .git, .next, dist, build)
  const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces", ".workspace", "upload", "download"])
  const SCAN_EXTENSIONS = new Set([".env", ".js", ".ts", ".tsx", ".jsx", ".py", ".rb", ".go", ".rs", ".java", ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".sh", ".sql", ".md"])

  const allSecrets: WorkspaceSecret[] = []
  let fileCount = 0

  async function walkDir(srcDir: string, destDir: string, relPath: string) {
    const entries = await fs.readdir(srcDir, { withFileTypes: true })
    await fs.mkdir(destDir, { recursive: true })
    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name)
      const destPath = path.join(destDir, entry.name)
      const relFilePath = relPath ? `${relPath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walkDir(srcPath, destPath, relFilePath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        const isEnv = entry.name.startsWith(".env") || entry.name === "Dockerfile" || entry.name === "docker-compose.yml"
        if (!SCAN_EXTENSIONS.has(ext) && !isEnv) {
          // Copy binary/non-scannable files as-is
          await fs.copyFile(srcPath, destPath)
          fileCount++
          continue
        }
        // Read, scan, virtualize, write to workspace
        try {
          const content = await fs.readFile(srcPath, "utf8")
          if (content.length > 500000) { // skip huge files
            await fs.copyFile(srcPath, destPath)
            fileCount++
            continue
          }
          const findings = scanForSecrets(content, relFilePath)
          if (findings.length > 0) {
            // Vault each secret + generate fake
            const virtualized = virtualizeWithFakes(content, relFilePath)
            await fs.writeFile(destPath, virtualized.text, "utf8")
            for (const r of virtualized.replacements) {
              let vaulted = false
              try {
                await storeSecret(r.raw, { name: `${relFilePath}:${r.line}`, contextHint: relFilePath, orgId, projectId })
                vaulted = true
              } catch { /* vault optional */ }
              allSecrets.push({
                id: `${workspaceId}-${allSecrets.length}`,
                filePath: relFilePath,
                line: r.line,
                raw: r.raw,
                fake: r.fake,
                provider: r.provider,
                vaulted,
              })
            }
          } else {
            await fs.copyFile(srcPath, destPath)
          }
        } catch {
          await fs.copyFile(srcPath, destPath)
        }
        fileCount++
      }
    }
  }

  await walkDir(sourcePath, workspacePath, "")

  const workspace: SafeWorkspace = {
    id: workspaceId,
    projectId,
    orgId,
    sourcePath,
    workspacePath,
    status: "created",
    fileCount,
    secretCount: allSecrets.length,
    secrets: allSecrets,
    createdAt: new Date(),
  }

  // Update project status. updateMany (not update) so that an ephemeral
  // projectId — the CLI uses "local-*" ids that never hit the DB — is a no-op
  // rather than a thrown "record not found" that Prisma logs to stderr.
  await db.project.updateMany({ where: { id: projectId }, data: { sandboxStatus: "created" } }).catch(() => {})

  return workspace
}

// Restore real secrets back into the original project (for commit)
export async function restoreSecrets(opts: {
  workspacePath: string
  sourcePath: string
  secrets: WorkspaceSecret[]
}): Promise<{ restored: number; errors: string[] }> {
  const { workspacePath, sourcePath, secrets } = opts
  const errors: string[] = []
  let restored = 0

  // Group secrets by file (for fake→real replacement)
  const byFile = new Map<string, WorkspaceSecret[]>()
  for (const s of secrets) {
    if (!byFile.has(s.filePath)) byFile.set(s.filePath, [])
    byFile.get(s.filePath)!.push(s)
  }

  // Walk the ENTIRE workspace and copy every file back to source.
  // Files with secrets get fake→real replacement; files without secrets
  // are copied as-is (preserving AI edits).
  const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"])
  let fileCount = 0

  async function walkAndRestore(wsDir: string, srcDir: string, relPath: string) {
    const entries = await fs.readdir(wsDir, { withFileTypes: true })
    await fs.mkdir(srcDir, { recursive: true })
    for (const entry of entries) {
      // Skip metadata file and hidden files
      if (entry.name.startsWith(".shadowpaste")) continue
      const wsPath = path.join(wsDir, entry.name)
      const srcPath = path.join(srcDir, entry.name)
      const relFilePath = relPath ? `${relPath}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walkAndRestore(wsPath, srcPath, relFilePath)
      } else if (entry.isFile()) {
        try {
          const editedContent = await fs.readFile(wsPath, "utf8")
          // Replace fakes back with real secrets (if this file had any)
          let restoredContent = editedContent
          const fileSecrets = byFile.get(relFilePath) || []
          for (const s of fileSecrets) {
            restoredContent = restoredContent.split(s.fake).join(s.raw)
          }
          await fs.writeFile(srcPath, restoredContent, "utf8")
          restored += fileSecrets.length
          fileCount++
        } catch (e) {
          // Binary files or read errors — copy as-is
          try { await fs.copyFile(wsPath, srcPath); fileCount++ }
          catch { errors.push(`${relFilePath}: ${(e as Error).message}`) }
        }
      }
    }
  }

  await walkAndRestore(workspacePath, sourcePath, "")
  return { restored, errors }
}

// List files in a workspace
export async function listWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const files: string[] = []
  async function walk(dir: string, base: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) await walk(path.join(dir, e.name), base)
      else files.push(path.relative(base, path.join(dir, e.name)))
    }
  }
  try { await walk(workspacePath, workspacePath) } catch {}
  return files
}
