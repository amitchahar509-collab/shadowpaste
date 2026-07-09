#!/usr/bin/env node
// ShadowPaste CLI — AI Agent Security Control Plane
// Usage: npx shadowpaste init | protect | restore | status | open | daemon

import { Command } from "commander"
import { promises as fs } from "fs"
import path from "path"
import { createSafeWorkspace, restoreSecrets, type WorkspaceSecret } from "../src/lib/workspace"
import { scanForSecrets } from "../src/lib/security/detector"
import { seedDatabase } from "../src/lib/seed"

const program = new Command()

program
  .name("shadowpaste")
  .description("AI Agent Security Control Plane — let AI code your real repo without exposing secrets")
  .version("1.0.0")

// shadowpaste init
program
  .command("init")
  .description("Initialize ShadowPaste in current project")
  .option("--server <url>", "ShadowPaste server URL", "http://localhost:3000")
  .action(async (opts) => {
    console.log("\n  🛡️  ShadowPaste — AI Agent Security Control Plane\n")
    console.log("  Initializing...")
    try {
      await seedDatabase()
      console.log("  ✓ Database initialized")
      const cwd = process.cwd()
      const pkgJson = path.join(cwd, "package.json")
      let projectName = path.basename(cwd)
      try {
        const pkg = JSON.parse(await fs.readFile(pkgJson, "utf8"))
        projectName = pkg.name || projectName
        console.log(`  ✓ Project detected: ${projectName}`)
      } catch {
        console.log(`  ✓ Project: ${projectName}`)
      }
      const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces"])
      const SCAN_EXT = new Set([".env", ".js", ".ts", ".tsx", ".py", ".json", ".yaml", ".yml", ".toml", ".sh"])
      let secretCount = 0
      let fileCount = 0
      async function quickScan(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        for (const e of entries) {
          if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) await quickScan(path.join(dir, e.name)) }
          else if (e.isFile()) {
            const ext = path.extname(e.name).toLowerCase()
            if (SCAN_EXT.has(ext) || e.name.startsWith(".env")) {
              try {
                const content = await fs.readFile(path.join(dir, e.name), "utf8")
                if (content.length < 100000) {
                  const findings = scanForSecrets(content, e.name)
                  if (findings.length > 0) secretCount += findings.length
                  fileCount++
                }
              } catch {}
            }
          }
        }
      }
      await quickScan(cwd)
      console.log(`  ✓ Scanned ${fileCount} files, found ${secretCount} secrets`)
      console.log("\n  ✅ ShadowPaste ready!")
      console.log("\n  Next steps:")
      console.log("    1. shadowpaste protect   — create AI-safe workspace")
      console.log("    2. shadowpaste open       — open in Cursor/Claude")
      console.log("    3. shadowpaste restore    — restore secrets after AI edits")
      console.log(`\n  Server: ${opts.server}`)
      console.log("  Dashboard: http://localhost:3000\n")
    } catch (e) {
      console.error("  ✗ Init failed:", (e as Error).message)
      process.exit(1)
    }
  })

// shadowpaste protect
program
  .command("protect")
  .description("Scan project and create AI-safe workspace copy")
  .option("-p, --path <dir>", "project path", process.cwd())
  .action(async (opts) => {
    const projectPath = path.resolve(opts.path)
    const projectName = path.basename(projectPath)
    console.log(`\n  🛡️  Protecting ${projectName}...\n`)
    try {
      console.log("  Scanning files...")
      const workspace = await createSafeWorkspace({
        projectId: `local-${Date.now().toString(36)}`,
        orgId: "default",
        sourcePath: projectPath,
        projectName,
      })
      console.log(`  ✓ ${workspace.fileCount} files scanned`)
      console.log(`  ✓ ${workspace.secretCount} secrets protected with format-compatible fakes`)
      console.log(`  ✓ Workspace: ${workspace.workspacePath}`)
      if (workspace.secretCount > 0) {
        console.log("\n  Protected secrets:")
        for (const s of workspace.secrets.slice(0, 5)) {
          console.log(`    ${s.filePath}:${s.line} | ${s.provider} → ${s.fake.slice(0, 30)}...`)
        }
        if (workspace.secrets.length > 5) console.log(`    ... and ${workspace.secrets.length - 5} more`)
      }
      const metaPath = path.join(workspace.workspacePath, ".shadowpaste-meta.json")
      await fs.writeFile(metaPath, JSON.stringify({
        id: workspace.id,
        sourcePath: workspace.sourcePath,
        workspacePath: workspace.workspacePath,
        secrets: workspace.secrets.map((s) => ({ filePath: s.filePath, line: s.line, raw: s.raw, fake: s.fake, provider: s.provider, vaulted: s.vaulted })),
        createdAt: workspace.createdAt.toISOString(),
      }))
      console.log("\n  ✅ AI-safe workspace ready!")
      console.log(`\n  Open in Cursor:  cursor ${workspace.workspacePath}`)
      console.log(`  Open in Claude:  claude ${workspace.workspacePath}`)
      console.log("\n  After AI edits:  shadowpaste restore\n")
    } catch (e) {
      console.error("  ✗ Protect failed:", (e as Error).message)
      process.exit(1)
    }
  })

// shadowpaste restore
program
  .command("restore")
  .description("Restore real secrets back into source project")
  .option("-w, --workspace <path>", "workspace path (auto-detected if omitted)")
  .action(async (opts) => {
    console.log("\n  🛡️  Restoring secrets...\n")
    try {
      let workspacePath = opts.workspace
      let meta: { sourcePath: string; secrets: WorkspaceSecret[] }
      if (!workspacePath) {
        const wsRoot = path.resolve(process.cwd(), ".workspaces")
        try {
          const dirs = await fs.readdir(wsRoot)
          if (dirs.length === 0) { console.error("  ✗ No workspace found. Run 'shadowpaste protect' first."); process.exit(1) }
          let latest = ""
          let latestMtime = 0
          for (const d of dirs) {
            const metaPath = path.join(wsRoot, d, ".shadowpaste-meta.json")
            try { const stat = await fs.stat(metaPath); if (stat.mtimeMs > latestMtime) { latestMtime = stat.mtimeMs; latest = path.join(wsRoot, d) } } catch {}
          }
          workspacePath = latest || path.join(wsRoot, dirs[0])
        } catch { console.error("  ✗ No workspace found."); process.exit(1) }
      }
      const metaPath = path.join(workspacePath, ".shadowpaste-meta.json")
      try { meta = JSON.parse(await fs.readFile(metaPath, "utf8")) }
      catch { console.error("  ✗ Workspace metadata not found."); process.exit(1) }
      console.log(`  Workspace: ${workspacePath}`)
      console.log(`  Source: ${meta.sourcePath}`)
      console.log(`  Secrets to restore: ${meta.secrets.length}\n`)
      const result = await restoreSecrets({ workspacePath, sourcePath: meta.sourcePath, secrets: meta.secrets })
      console.log(`  ✓ ${result.restored} secrets restored to source project`)
      if (result.errors.length > 0) { console.log(`  ⚠ ${result.errors.length} errors:`); for (const e of result.errors) console.log(`    - ${e}`) }
      console.log("\n  ✅ Restore complete! Source project has real secrets back.")
      console.log("  You can now commit your changes.\n")
    } catch (e) { console.error("  ✗ Restore failed:", (e as Error).message); process.exit(1) }
  })

// shadowpaste status
program
  .command("status")
  .description("Show ShadowPaste protection status")
  .option("--server <url>", "ShadowPaste server URL", "http://localhost:3000")
  .action(async (opts) => {
    console.log("\n  🛡️  ShadowPaste Status\n")
    const wsRoot = path.resolve(process.cwd(), ".workspaces")
    try {
      const dirs = await fs.readdir(wsRoot)
      if (dirs.length > 0) {
        console.log(`  Active workspaces: ${dirs.length}`)
        for (const d of dirs) {
          const metaPath = path.join(wsRoot, d, ".shadowpaste-meta.json")
          try { const meta = JSON.parse(await fs.readFile(metaPath, "utf8")); console.log(`    - ${d} (${meta.secrets.length} secrets)`) }
          catch { console.log(`    - ${d}`) }
        }
      } else { console.log("  No active workspaces. Run 'shadowpaste protect'.") }
    } catch { console.log("  No workspaces directory. Run 'shadowpaste protect'.") }
    try {
      const res = await fetch(`${opts.server}/api/health`, { signal: AbortSignal.timeout(2000) })
      const health = await res.json()
      console.log(`\n  Server: ${health.status} (${opts.server})`)
      console.log(`  Checks: ${health.checks.map((c: { name: string; ok: boolean }) => `${c.name}:${c.ok ? "✓" : "✗"}`).join(", ")}`)
    } catch { console.log(`\n  Server: not running`) }
    console.log("")
  })

// shadowpaste open
program
  .command("open")
  .description("Open safe workspace in editor")
  .option("-e, --editor <name>", "cursor | claude | code", "cursor")
  .action(async (opts) => {
    const wsRoot = path.resolve(process.cwd(), ".workspaces")
    let workspacePath = ""
    try {
      const dirs = await fs.readdir(wsRoot)
      if (dirs.length === 0) { console.error("  ✗ No workspace."); process.exit(1) }
      let latest = ""; let latestMtime = 0
      for (const d of dirs) { const stat = await fs.stat(path.join(wsRoot, d)); if (stat.mtimeMs > latestMtime) { latestMtime = stat.mtimeMs; latest = path.join(wsRoot, d) } }
      workspacePath = latest
    } catch { console.error("  ✗ No workspace."); process.exit(1) }
    const { execSync } = await import("child_process")
    console.log(`\n  Opening ${workspacePath} in ${opts.editor}...`)
    try {
      execSync(`${opts.editor} "${workspacePath}"`, { stdio: "ignore", detached: true })
      console.log(`  ✓ Opened`)
    } catch { console.log(`  ⚠ ${opts.editor} not found. Open manually: ${workspacePath}`) }
    console.log("")
  })

// shadowpaste daemon start
program
  .command("daemon")
  .description("Daemon commands")
  .argument("<action>", "start | status")
  .action(async (action: string) => {
    if (action === "start") {
      console.log("\n  🛡️  Starting ShadowPaste daemon...\n")
      const cwd = process.cwd()
      const pidFile = path.join(cwd, ".shadowpaste-daemon.pid")
      await fs.writeFile(pidFile, String(process.pid))
      console.log(`  ✓ Daemon started (PID: ${process.pid})`)
      console.log(`  Watching: ${cwd}`)
      console.log("  Press Ctrl+C to stop\n")
      let watching = true
      process.on("SIGINT", () => { watching = false; console.log("\n  Daemon stopped."); process.exit(0) })
      while (watching) {
        await new Promise((r) => setTimeout(r, 5000))
        try {
          const entries = await fs.readdir(cwd, { withFileTypes: true })
          for (const e of entries) {
            if (e.isFile() && e.name.startsWith(".env")) {
              const content = await fs.readFile(path.join(cwd, e.name), "utf8")
              const findings = scanForSecrets(content, e.name)
              if (findings.length > 0) console.log(`  ⚠ ${e.name}: ${findings.length} secrets detected — consider 'shadowpaste protect'`)
            }
          }
        } catch {}
      }
    } else if (action === "status") {
      const pidFile = path.join(process.cwd(), ".shadowpaste-daemon.pid")
      try {
        const pid = await fs.readFile(pidFile, "utf8")
        try { process.kill(Number(pid), 0); console.log(`\n  ✓ Daemon running (PID: ${pid})\n`) }
        catch { console.log("\n  ✗ Daemon not running\n") }
      } catch { console.log("\n  ✗ Daemon not running\n") }
    } else {
      console.error("  Usage: shadowpaste daemon <start|status>")
    }
  })

program.parse()
