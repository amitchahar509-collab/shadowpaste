// ShadowPaste — automatic project stack detection.
//
// Inspects a project directory's marker files (package.json, go.mod, Dockerfile,
// .git, …) and reports frameworks, languages, package managers, dependency
// counts, and project shape (monorepo / workspace / docker / git). Used to give
// import a rich "we understood your project" summary. Read-only; bounded I/O.

import path from "path"
import { promises as fs } from "fs"

export interface StackInfo {
  languages: string[]
  frameworks: string[]
  packageManagers: string[]
  dependencyCount: number
  hasGit: boolean
  hasDocker: boolean
  isMonorepo: boolean
  isWorkspace: boolean
  projectType: string
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}
async function readJson(p: string): Promise<Record<string, unknown> | null> {
  // Strip a UTF-8 BOM before parsing. Windows editors and PowerShell write
  // package.json with a leading U+FEFF; JSON.parse throws on it, so the project
  // came back as "Generic Project" with 0 dependencies and no framework — on
  // the platform a large share of users are on.
  try {
    const raw = await fs.readFile(p, "utf8")
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
  } catch { return null }
}
async function readText(p: string): Promise<string> {
  try { return await fs.readFile(p, "utf8") } catch { return "" }
}

export async function detectStack(dir: string): Promise<StackInfo> {
  const languages = new Set<string>()
  const frameworks = new Set<string>()
  const packageManagers = new Set<string>()
  let dependencyCount = 0
  let isMonorepo = false
  let isWorkspace = false

  const has = async (f: string) => exists(path.join(dir, f))
  const hasGit = await has(".git")
  const hasDocker = (await has("Dockerfile")) || (await has("docker-compose.yml")) || (await has("compose.yaml")) || (await has("docker-compose.yaml"))

  // ---- Node / JS ecosystem ----
  const pkg = await readJson(path.join(dir, "package.json"))
  if (pkg) {
    languages.add("JavaScript")
    packageManagers.add("npm")
    const deps = { ...(pkg.dependencies as object || {}), ...(pkg.devDependencies as object || {}) } as Record<string, string>
    const depNames = Object.keys(deps)
    dependencyCount += depNames.length
    const dep = (n: string) => depNames.includes(n)
    if (await has("tsconfig.json")) languages.add("TypeScript")
    if (dep("next")) frameworks.add("Next.js")
    if (dep("react") || dep("react-dom")) frameworks.add("React")
    if (dep("vue")) frameworks.add("Vue")
    if (dep("svelte") || dep("@sveltejs/kit")) frameworks.add("Svelte")
    if (dep("@angular/core")) frameworks.add("Angular")
    if (dep("nuxt")) frameworks.add("Nuxt")
    if (dep("astro")) frameworks.add("Astro")
    if (dep("express")) frameworks.add("Express")
    if (dep("@nestjs/core")) frameworks.add("NestJS")
    if (dep("fastify")) frameworks.add("Fastify")
    if (dep("vite")) frameworks.add("Vite")
    if (!frameworks.size) frameworks.add("Node.js")
    // monorepo / workspace markers
    if (pkg.workspaces) { isMonorepo = true; isWorkspace = true }
  }
  if (await has("pnpm-workspace.yaml")) { packageManagers.add("pnpm"); isMonorepo = true }
  if (await has("pnpm-lock.yaml")) packageManagers.add("pnpm")
  if (await has("yarn.lock")) packageManagers.add("yarn")
  if (await has("bun.lock") || await has("bun.lockb")) packageManagers.add("bun")
  if (await has("turbo.json") || await has("nx.json") || await has("lerna.json")) isMonorepo = true

  // ---- Python ----
  if (await has("requirements.txt") || await has("pyproject.toml") || await has("setup.py") || await has("Pipfile")) {
    languages.add("Python")
    if (await has("poetry.lock") || (await readText(path.join(dir, "pyproject.toml"))).includes("[tool.poetry]")) packageManagers.add("poetry")
    else packageManagers.add("pip")
    const req = await readText(path.join(dir, "requirements.txt"))
    if (req) dependencyCount += req.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length
    const reqAll = (req + " " + (await readText(path.join(dir, "pyproject.toml")))).toLowerCase()
    if (reqAll.includes("django")) frameworks.add("Django")
    if (reqAll.includes("flask")) frameworks.add("Flask")
    if (reqAll.includes("fastapi")) frameworks.add("FastAPI")
    if (![...frameworks].some((f) => ["Django", "Flask", "FastAPI"].includes(f))) frameworks.add("Python")
  }

  // ---- Go ----
  if (await has("go.mod")) {
    languages.add("Go"); packageManagers.add("go modules")
    const gomod = await readText(path.join(dir, "go.mod"))
    dependencyCount += (gomod.match(/^\s+[\w.\-/]+ v/gm) || []).length
    if (gomod.includes("gin-gonic")) frameworks.add("Gin")
    else if (gomod.includes("gofiber")) frameworks.add("Fiber")
    else frameworks.add("Go")
  }

  // ---- Rust ----
  if (await has("Cargo.toml")) {
    languages.add("Rust"); packageManagers.add("cargo"); frameworks.add("Rust")
    const cargo = await readText(path.join(dir, "Cargo.toml"))
    if (cargo.includes("[workspace]")) isMonorepo = true
  }

  // ---- JVM ----
  if (await has("pom.xml")) { languages.add("Java"); packageManagers.add("maven"); frameworks.add("Maven") }
  if (await has("build.gradle") || await has("build.gradle.kts")) { languages.add("Java/Kotlin"); packageManagers.add("gradle"); frameworks.add("Gradle") }

  // ---- Ruby ----
  if (await has("Gemfile")) {
    languages.add("Ruby"); packageManagers.add("bundler")
    if ((await readText(path.join(dir, "Gemfile"))).includes("rails")) frameworks.add("Rails"); else frameworks.add("Ruby")
  }

  // ---- PHP ----
  if (await has("composer.json")) {
    languages.add("PHP"); packageManagers.add("composer")
    const comp = await readText(path.join(dir, "composer.json"))
    if (comp.includes("laravel/")) frameworks.add("Laravel"); else if (comp.includes("symfony/")) frameworks.add("Symfony"); else frameworks.add("PHP")
  }

  // ---- .NET ----
  try {
    const entries = await fs.readdir(dir)
    if (entries.some((e) => e.endsWith(".csproj") || e.endsWith(".sln"))) { languages.add("C#"); packageManagers.add("nuget"); frameworks.add(".NET") }
    if (entries.includes("packages") || entries.includes("apps") || entries.includes("services")) {
      // heuristic monorepo layout
      if (entries.includes("packages") && (pkg?.workspaces || await has("pnpm-workspace.yaml"))) isMonorepo = true
    }
  } catch { /* ignore */ }

  const projectType =
    isMonorepo ? "Monorepo" :
    hasDocker ? "Docker Project" :
    frameworks.size ? [...frameworks][0] + " Project" :
    languages.size ? [...languages][0] + " Project" :
    "Generic Project"

  return {
    languages: [...languages],
    frameworks: [...frameworks],
    packageManagers: [...packageManagers],
    dependencyCount,
    hasGit,
    hasDocker,
    isMonorepo,
    isWorkspace,
    projectType,
  }
}
