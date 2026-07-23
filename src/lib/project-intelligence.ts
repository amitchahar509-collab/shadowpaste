// ShadowPaste — Project Intelligence Engine.
//
// analyzeProject(dir) walks a project ONCE and produces a rich, honest
// understanding of it: stack, runtime, build tools, databases/ORMs, cloud, CI/CD,
// containers, IaC, monorepo tooling, AI-coding-tool configs, filesystem stats,
// a categorised security picture, scores, insights, and phase recommendations.
//
// Reuse, not duplication:
//   - stack (language/framework/pkg-mgr/git/docker/monorepo)  -> detectStack()
//   - secret detection (categories, severity)                 -> scanForSecrets()
// Only the file-walk, aggregation, scoring, and copy live here.
//
// Honesty: dynamic analysis that needs an install/build (tsc, eslint, unused
// deps, circular deps, dead code, build errors) is NOT faked — it is reported as
// `notRun` with a reason. Everything else is computed from real bytes on disk.

import path from "path"
import crypto from "crypto"
import { promises as fs } from "fs"
import { detectStack, type StackInfo } from "./detect-stack"
import { scanForSecrets } from "./security/detector"

export interface DetectedTool { name: string; evidence: string }
export interface ProjectIntelligence {
  name: string
  projectType: string
  stack: StackInfo
  runtime: string | null
  buildTools: string[]
  databases: string[]
  orms: string[]
  cloudProviders: string[]
  containerization: string[]
  iac: string[]
  cicd: string[]
  monorepoTools: string[]
  aiTools: DetectedTool[]
  // filesystem
  fileCount: number
  folderCount: number
  totalSize: number
  largestFiles: Array<{ path: string; size: number }>
  binaryFileCount: number
  hiddenFileCount: number
  configFiles: string[]
  lockFiles: string[]
  envFiles: string[]
  packageCount: number
  dependencyCount: number
  languageDistribution: Array<{ language: string; files: number; pct: number }>
  hasReadme: boolean
  hasLicense: boolean
  licenseType: string | null
  hasGitignore: boolean
  hasTests: boolean
  // security
  secretsFound: number
  secretsByCategory: Record<string, number>
  // code
  todoCount: number
  fixmeCount: number
  duplicateFileGroups: number
  // scores (0-100)
  scores: {
    security: number; risk: number; aiReadiness: number
    complexity: number; dependency: number; health: number
  }
  buildStatus: { status: "not_run"; reason: string }
  insights: string[]
  recommendations: {
    beforeProtect: string[]; beforeScan: string[]; beforeRestore: string[]
    beforeAiEditing: string[]; beforeProduction: string[]
  }
  analysisMs: number
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces", ".workspace", "vendor", ".venv", "venv", "__pycache__", "target", ".turbo", "coverage", ".cache"])
const SCAN_EXT = new Set([".env", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".go", ".rs", ".java", ".kt", ".php", ".json", ".yaml", ".yml", ".toml", ".ini", ".conf", ".sh", ".sql", ".md", ".txt", ".pem", ".key"])
const CODE_EXT: Record<string, string> = {
  ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python", ".rb": "Ruby", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".php": "PHP", ".cs": "C#",
  ".cpp": "C++", ".c": "C", ".swift": "Swift", ".scala": "Scala", ".sh": "Shell", ".vue": "Vue", ".svelte": "Svelte",
  ".css": "CSS", ".scss": "CSS", ".html": "HTML", ".sql": "SQL",
}
const BINARY_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mov", ".mp3", ".wav", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".bin", ".exe", ".dll", ".so", ".dylib", ".class", ".jar", ".wasm", ".node"])
const MAX_READ = 400 * 1024

export async function analyzeProject(dir: string): Promise<ProjectIntelligence> {
  const started = Date.now()
  const stack = await detectStack(dir)

  // ---- single bounded walk ----
  const relFiles: string[] = []
  const relPaths = new Set<string>()      // fast membership tests
  const langFiles: Record<string, number> = {}
  const largest: Array<{ path: string; size: number }> = []
  const hashes = new Map<string, number>()
  let fileCount = 0, folderCount = 0, totalSize = 0, binaryFileCount = 0, hiddenFileCount = 0
  let todoCount = 0, fixmeCount = 0, secretsFound = 0
  const secretsByCategory: Record<string, number> = {}
  const readCache = new Map<string, string>()

  async function walk(abs: string, rel: string, depth: number) {
    let entries: import("fs").Dirent[]
    try { entries = await fs.readdir(abs, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const relChild = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        folderCount++
        if (depth < 24 && fileCount < 60000) await walk(path.join(abs, e.name), relChild, depth + 1)
      } else if (e.isFile()) {
        fileCount++
        relFiles.push(relChild); relPaths.add(relChild)
        if (e.name.startsWith(".")) hiddenFileCount++
        const ext = path.extname(e.name).toLowerCase()
        let size = 0
        try { size = (await fs.stat(path.join(abs, e.name))).size } catch { /* ignore */ }
        totalSize += size
        pushLargest(largest, relChild, size)
        if (CODE_EXT[ext]) langFiles[CODE_EXT[ext]] = (langFiles[CODE_EXT[ext]] || 0) + 1
        if (BINARY_EXT.has(ext)) { binaryFileCount++; continue }
        // read scannable text files for secrets, TODOs, dedupe hashing
        const isEnvLike = e.name.startsWith(".env") || e.name === "Dockerfile"
        if ((SCAN_EXT.has(ext) || isEnvLike) && size > 0 && size <= MAX_READ) {
          let content = ""
          try { content = await fs.readFile(path.join(abs, e.name), "utf8") } catch { continue }
          readCache.set(relChild, content)
          const h = crypto.createHash("md5").update(content).digest("hex")
          hashes.set(h, (hashes.get(h) || 0) + 1)
          todoCount += (content.match(/\bTODO\b/g) || []).length
          fixmeCount += (content.match(/\bFIXME\b/g) || []).length
          for (const f of scanForSecrets(content, relChild)) {
            secretsFound++
            const cat = categorizeSecret(f.provider, f.scope, f.detector)
            secretsByCategory[cat] = (secretsByCategory[cat] || 0) + 1
          }
        }
      }
    }
  }
  await walk(dir, "", 0)

  const duplicateFileGroups = [...hashes.values()].filter((n) => n > 1).length

  // ---- helpers over the collected file set ----
  const has = (p: string) => relPaths.has(p)
  const hasAny = (...ps: string[]) => ps.some((p) => relPaths.has(p))
  const anyMatch = (re: RegExp) => relFiles.some((f) => re.test(f))
  const pkg = safeJson(readCache.get("package.json"))
  const deps = pkg ? { ...(pkg.dependencies as object || {}), ...(pkg.devDependencies as object || {}) } as Record<string, string> : {}
  const depNames = Object.keys(deps)
  const dep = (n: string) => depNames.includes(n)
  const depLike = (re: RegExp) => depNames.some((d) => re.test(d))

  // ---- runtime ----
  const runtime = detectRuntime(readCache, stack)

  // ---- build tools ----
  const buildTools: string[] = []
  if (dep("vite")) buildTools.push("Vite")
  if (dep("webpack")) buildTools.push("Webpack")
  if (dep("rollup")) buildTools.push("Rollup")
  if (dep("esbuild")) buildTools.push("esbuild")
  if (dep("parcel")) buildTools.push("Parcel")
  if (dep("@swc/core") || dep("swc")) buildTools.push("SWC")
  if (dep("next")) buildTools.push("Turbopack/Next")
  if (has("tsconfig.json")) buildTools.push("tsc")
  if (hasAny("Makefile", "makefile")) buildTools.push("Make")
  if (has("Cargo.toml")) buildTools.push("Cargo")
  if (has("go.mod")) buildTools.push("Go build")
  if (hasAny("pom.xml")) buildTools.push("Maven")
  if (hasAny("build.gradle", "build.gradle.kts")) buildTools.push("Gradle")

  // ---- databases + ORMs ----
  const databases = new Set<string>()
  const orms = new Set<string>()
  if (dep("@prisma/client") || dep("prisma") || anyMatch(/(^|\/)schema\.prisma$/)) orms.add("Prisma")
  if (dep("sequelize")) orms.add("Sequelize")
  if (dep("typeorm")) orms.add("TypeORM")
  if (dep("mongoose")) { orms.add("Mongoose"); databases.add("MongoDB") }
  if (dep("drizzle-orm")) orms.add("Drizzle")
  if (dep("knex")) orms.add("Knex")
  if (depLike(/sqlalchemy/i)) orms.add("SQLAlchemy")
  if (anyMatch(/\bgorm\b/) || depLike(/gorm/)) orms.add("GORM")
  if (dep("pg") || dep("postgres") || dep("@vercel/postgres")) databases.add("PostgreSQL")
  if (dep("mysql") || dep("mysql2")) databases.add("MySQL")
  if (dep("mongodb")) databases.add("MongoDB")
  if (dep("redis") || dep("ioredis")) databases.add("Redis")
  if (dep("sqlite3") || dep("better-sqlite3")) databases.add("SQLite")
  // prisma schema provider
  const prismaSchema = [...readCache.entries()].find(([k]) => k.endsWith("schema.prisma"))?.[1] || ""
  if (/provider\s*=\s*"postgresql"/.test(prismaSchema)) databases.add("PostgreSQL")
  if (/provider\s*=\s*"mysql"/.test(prismaSchema)) databases.add("MySQL")
  if (/provider\s*=\s*"sqlite"/.test(prismaSchema)) databases.add("SQLite")
  if (/provider\s*=\s*"mongodb"/.test(prismaSchema)) databases.add("MongoDB")
  // docker-compose images
  const compose = readCache.get("docker-compose.yml") || readCache.get("docker-compose.yaml") || readCache.get("compose.yaml") || ""
  if (/image:\s*postgres/i.test(compose)) databases.add("PostgreSQL")
  if (/image:\s*mysql|image:\s*mariadb/i.test(compose)) databases.add("MySQL")
  if (/image:\s*mongo/i.test(compose)) databases.add("MongoDB")
  if (/image:\s*redis/i.test(compose)) databases.add("Redis")

  // ---- cloud providers ----
  const cloudProviders = new Set<string>()
  if (depLike(/^@?aws-sdk|^aws-sdk|^@aws-/)) cloudProviders.add("AWS")
  if (depLike(/^@google-cloud|^firebase/)) cloudProviders.add(dep("firebase") ? "Firebase" : "Google Cloud")
  if (depLike(/^@azure\//)) cloudProviders.add("Azure")
  if (has("vercel.json") || dep("@vercel/analytics") || dep("@vercel/postgres")) cloudProviders.add("Vercel")
  if (has("netlify.toml")) cloudProviders.add("Netlify")
  if (has("wrangler.toml")) cloudProviders.add("Cloudflare")
  if (has("fly.toml")) cloudProviders.add("Fly.io")
  if (has("render.yaml")) cloudProviders.add("Render")
  if (has("Procfile")) cloudProviders.add("Heroku")

  // ---- containerization ----
  const containerization = new Set<string>()
  if (has("Dockerfile") || anyMatch(/(^|\/)Dockerfile(\.|$)/)) containerization.add("Docker")
  if (hasAny("docker-compose.yml", "docker-compose.yaml", "compose.yaml", "compose.yml")) containerization.add("Docker Compose")
  if (has("Chart.yaml") || anyMatch(/(^|\/)templates\/.*\.yaml$/) && has("Chart.yaml")) containerization.add("Helm")
  if (anyMatch(/(^|\/)(k8s|kubernetes|manifests|deploy)\//) && [...readCache.values()].some((c) => /kind:\s*(Deployment|Service|Pod|StatefulSet)/.test(c))) containerization.add("Kubernetes")
  else if ([...readCache.entries()].some(([k, c]) => /\.ya?ml$/.test(k) && /apiVersion:\s*apps\/v1[\s\S]*kind:\s*(Deployment|StatefulSet)/.test(c))) containerization.add("Kubernetes")
  if (has("skaffold.yaml")) containerization.add("Skaffold")

  // ---- IaC ----
  const iac = new Set<string>()
  if (anyMatch(/\.tf$/)) iac.add("Terraform")
  if (hasAny("Pulumi.yaml", "Pulumi.yml")) iac.add("Pulumi")
  if (anyMatch(/(^|\/)(ansible|playbook).*\.ya?ml$/)) iac.add("Ansible")
  if ([...readCache.entries()].some(([k, c]) => /\.ya?ml$|\.json$/.test(k) && /AWSTemplateFormatVersion|Resources:\s/.test(c) && /cloudformation/i.test(k))) iac.add("CloudFormation")

  // ---- CI/CD ----
  const cicd = new Set<string>()
  if (anyMatch(/(^|\/)\.github\/workflows\/.+\.ya?ml$/)) cicd.add("GitHub Actions")
  if (has(".gitlab-ci.yml")) cicd.add("GitLab CI")
  if (hasAny("azure-pipelines.yml", "azure-pipelines.yaml")) cicd.add("Azure DevOps")
  if (anyMatch(/(^|\/)\.circleci\/config\.ya?ml$/)) cicd.add("CircleCI")
  if (hasAny("Jenkinsfile")) cicd.add("Jenkins")
  if (has(".travis.yml")) cicd.add("Travis CI")
  if (has("bitbucket-pipelines.yml")) cicd.add("Bitbucket Pipelines")
  if (anyMatch(/(^|\/)\.drone\.yml$/)) cicd.add("Drone CI")

  // ---- monorepo tools ----
  const monorepoTools = new Set<string>()
  if (has("nx.json")) monorepoTools.add("Nx")
  if (has("turbo.json")) monorepoTools.add("Turborepo")
  if (has("lerna.json")) monorepoTools.add("Lerna")
  if (has("pnpm-workspace.yaml")) monorepoTools.add("pnpm Workspace")
  if (has("rush.json")) monorepoTools.add("Rush")
  if (pkg?.workspaces && (has("yarn.lock"))) monorepoTools.add("Yarn Workspace")
  else if (pkg?.workspaces) monorepoTools.add("Workspaces")

  // ---- AI coding tools ----
  const aiTools: DetectedTool[] = []
  const addTool = (name: string, evidence: string) => aiTools.push({ name, evidence })
  if (hasAny("CLAUDE.md", ".claude/settings.json") || anyMatch(/(^|\/)\.claude\//)) addTool("Claude Code", "CLAUDE.md / .claude")
  if (hasAny(".cursorrules") || anyMatch(/(^|\/)\.cursor\//)) addTool("Cursor", ".cursor / .cursorrules")
  if (hasAny(".windsurfrules") || anyMatch(/(^|\/)\.windsurf\//)) addTool("Windsurf", ".windsurfrules")
  if (hasAny("AGENTS.md") || anyMatch(/(^|\/)\.codex\//)) addTool("Codex", "AGENTS.md / .codex")
  if (anyMatch(/(^|\/)\.continue\//) || has(".continuerc.json")) addTool("Continue.dev", ".continue")
  if (hasAny(".clinerules") || anyMatch(/(^|\/)\.cline\//)) addTool("Cline", ".clinerules")
  if (hasAny(".roomodes", ".roorules") || anyMatch(/(^|\/)\.roo\//)) addTool("Roo Code", ".roo")
  if (anyMatch(/(^|\/)\.openhands\//)) addTool("OpenHands", ".openhands")
  if (hasAny(".aider.conf.yml", ".aiderignore") || anyMatch(/(^|\/)\.aider/)) addTool("Aider", ".aider*")
  if (has(".github/copilot-instructions.md")) addTool("GitHub Copilot", "copilot-instructions.md")
  if (hasAny(".mcp.json", "mcp.json", "claude_desktop_config.json") || anyMatch(/mcp.*config|\.mcp\//i)) addTool("MCP Servers", "mcp config")
  if (anyMatch(/(^|\/)(prompts|\.prompts)\//) || anyMatch(/\.prompt(\.md)?$/)) addTool("Prompt files", "prompts/")

  // ---- config / lock / env files ----
  const configFiles = relFiles.filter((f) => /(^|\/)(tsconfig|jsconfig|next\.config|vite\.config|webpack\.config|babel\.config|\.eslintrc|eslint\.config|\.prettierrc|tailwind\.config|postcss\.config|jest\.config|vitest\.config|rollup\.config|svelte\.config|nuxt\.config|astro\.config)\b/i.test(f))
  const lockFiles = relFiles.filter((f) => /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/.test(f))
  const envFiles = relFiles.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$|\.env\.sample$|\.env\.template$/.test(f))

  const hasReadme = anyMatch(/(^|\/)readme(\.md|\.txt|\.rst)?$/i)
  const licenseFile = relFiles.find((f) => /(^|\/)(license|licence|copying)(\.md|\.txt)?$/i.test(f))
  const hasLicense = !!licenseFile
  const licenseType = licenseFile ? detectLicense(readCache.get(licenseFile) || "") : null
  const hasGitignore = has(".gitignore")
  const hasTests = anyMatch(/(^|\/)(test|tests|__tests__|spec)\//i) || anyMatch(/\.(test|spec)\.[a-z]+$/i)
  const packageCount = relFiles.filter((f) => /(^|\/)package\.json$/.test(f)).length || (pkg ? 1 : 0)

  // ---- language distribution ----
  const totalLangFiles = Object.values(langFiles).reduce((a, b) => a + b, 0) || 1
  const languageDistribution = Object.entries(langFiles)
    .map(([language, files]) => ({ language, files, pct: Math.round((files / totalLangFiles) * 100) }))
    .sort((a, b) => b.files - a.files).slice(0, 8)

  // ---- scores ----
  const securityScore = computeSecurity(secretsFound, secretsByCategory, envFiles.length, hasGitignore, readCache)
  const risk = Math.min(100, Math.round((100 - securityScore) * 0.7 + Math.min(secretsFound * 4, 30)))
  const aiReadiness = computeAiReadiness({ hasReadme, hasTests, ts: stack.languages.includes("TypeScript"), lock: lockFiles.length > 0, aiTools: aiTools.length, fileCount, docs: configFiles.length })
  const complexity = computeComplexity({ fileCount, folderCount, langs: languageDistribution.length, deps: stack.dependencyCount, monorepo: stack.isMonorepo })
  const dependency = computeDependency({ deps: stack.dependencyCount, lock: lockFiles.length > 0, pkgMgrs: stack.packageManagers.length })
  const health = Math.round(securityScore * 0.3 + aiReadiness * 0.25 + (hasReadme ? 100 : 40) * 0.1 + (hasLicense ? 100 : 60) * 0.05 + (stack.hasGit ? 100 : 70) * 0.1 + (hasTests ? 100 : 50) * 0.1 + (cicd.size ? 100 : 60) * 0.1)

  const facts = {
    stack, runtime, databases: [...databases], orms: [...orms], cloudProviders: [...cloudProviders],
    containerization: [...containerization], iac: [...iac], cicd: [...cicd], monorepoTools: [...monorepoTools],
    aiTools, secretsFound, secretsByCategory, envFiles, binaryFileCount, hasReadme, hasLicense, hasTests,
    duplicateFileGroups, totalSize, fileCount, dependencyCount: stack.dependencyCount,
  }

  return {
    name: path.basename(dir),
    projectType: stack.projectType,
    stack, runtime, buildTools: dedupe(buildTools),
    databases: [...databases], orms: [...orms], cloudProviders: [...cloudProviders],
    containerization: [...containerization], iac: [...iac], cicd: [...cicd], monorepoTools: [...monorepoTools],
    aiTools,
    fileCount, folderCount, totalSize,
    largestFiles: largest,
    binaryFileCount, hiddenFileCount,
    configFiles: configFiles.slice(0, 40), lockFiles, envFiles,
    packageCount, dependencyCount: stack.dependencyCount,
    languageDistribution,
    hasReadme, hasLicense, licenseType, hasGitignore, hasTests,
    secretsFound, secretsByCategory,
    todoCount, fixmeCount, duplicateFileGroups,
    scores: { security: securityScore, risk, aiReadiness, complexity, dependency, health },
    buildStatus: { status: "not_run", reason: "static import — build/lint/type-check require installing dependencies, which is not run during onboarding" },
    insights: buildInsights(facts),
    recommendations: buildRecommendations(facts),
    analysisMs: Date.now() - started,
  }
}

// ---------- helpers ----------
function pushLargest(list: Array<{ path: string; size: number }>, p: string, size: number) {
  if (list.length < 5) { list.push({ path: p, size }); list.sort((a, b) => b.size - a.size); return }
  if (size > list[list.length - 1].size) { list[list.length - 1] = { path: p, size }; list.sort((a, b) => b.size - a.size) }
}
function safeJson(s: string | undefined): Record<string, unknown> | null { if (!s) return null; try { return JSON.parse(s) } catch { return null } }
function dedupe<T>(a: T[]): T[] { return [...new Set(a)] }

function detectRuntime(cache: Map<string, string>, stack: StackInfo): string | null {
  const nvmrc = cache.get(".nvmrc")?.trim()
  if (nvmrc) return `Node ${nvmrc.replace(/^v/, "")}`
  const pkg = safeJson(cache.get("package.json"))
  const engines = pkg?.engines as { node?: string } | undefined
  if (engines?.node) return `Node ${engines.node}`
  const gomod = cache.get("go.mod") || ""
  const gm = gomod.match(/^go\s+(\d+\.\d+)/m); if (gm) return `Go ${gm[1]}`
  const py = cache.get(".python-version")?.trim() || cache.get("runtime.txt")?.trim()
  if (py) return `Python ${py.replace(/^python-?/i, "")}`
  if (stack.languages.includes("JavaScript") || stack.languages.includes("TypeScript")) return "Node.js"
  if (stack.languages.includes("Python")) return "Python"
  if (stack.languages.includes("Go")) return "Go"
  if (stack.languages.includes("Rust")) return "Rust"
  return null
}

function categorizeSecret(provider: string, scope: string, detector: string): string {
  const p = (provider || "").toUpperCase(); const d = (detector || "").toUpperCase()
  if (d.includes("PEM") || d.includes("RSA") || p === "SSH" || p === "SSH_PRIVATE_KEY") return "Private Keys / SSH"
  if (d.includes("CERT")) return "Certificates"
  if (p === "JWT" || d.includes("JWT") || d.includes("BEARER")) return "JWT / Tokens"
  if (p === "DATABASE" || scope?.startsWith("db.") || p.includes("POSTGRES") || p.includes("MYSQL") || p.includes("MONGO")) return "Database Credentials"
  if (["AWS_ACCESS_KEY", "AWS_SECRET_KEY", "AWS_SESSION", "GOOGLE", "AZURE", "CLOUDFLARE", "VERCEL", "NETLIFY", "FIREBASE"].some((x) => p.includes(x))) return "Cloud Credentials"
  if (p === "OAUTH" || scope?.includes("oauth")) return "OAuth"
  if (d.includes("WEBHOOK") || scope?.includes("webhook")) return "Webhook Secrets"
  if (p === "COOKIES_PASSWORDS" || d.includes("PASSWORD") || d.includes("COOKIE")) return "Passwords / Cookies"
  return "API Keys"
}

function detectLicense(text: string): string {
  const t = text.slice(0, 400).toLowerCase()
  if (t.includes("mit license")) return "MIT"
  if (t.includes("apache license")) return "Apache-2.0"
  if (t.includes("gnu general public")) return "GPL"
  if (t.includes("bsd ")) return "BSD"
  if (t.includes("mozilla public")) return "MPL-2.0"
  if (t.includes("the unlicense")) return "Unlicense"
  if (t.includes("isc license")) return "ISC"
  return "Custom/Other"
}

function computeSecurity(secrets: number, byCat: Record<string, number>, envFiles: number, hasGitignore: boolean, cache: Map<string, string>): number {
  let s = 100
  s -= Math.min(secrets * 6, 50)
  s -= (byCat["Private Keys / SSH"] || 0) * 8
  s -= (byCat["Cloud Credentials"] || 0) * 6
  s -= (byCat["Database Credentials"] || 0) * 5
  // committed .env not gitignored is worse
  const gitignore = cache.get(".gitignore") || ""
  if (envFiles > 0 && !/\.env/.test(gitignore)) s -= 15
  else if (envFiles > 0) s -= 6
  if (!hasGitignore) s -= 5
  return Math.max(0, Math.min(100, Math.round(s)))
}
function computeAiReadiness(o: { hasReadme: boolean; hasTests: boolean; ts: boolean; lock: boolean; aiTools: number; fileCount: number; docs: number }): number {
  let s = 40
  if (o.hasReadme) s += 15
  if (o.hasTests) s += 12
  if (o.ts) s += 10
  if (o.lock) s += 8
  if (o.aiTools > 0) s += 10
  if (o.docs > 0) s += 5
  if (o.fileCount > 20000) s -= 10
  return Math.max(0, Math.min(100, s))
}
function computeComplexity(o: { fileCount: number; folderCount: number; langs: number; deps: number; monorepo: boolean }): number {
  let s = 0
  s += Math.min(o.fileCount / 40, 40)
  s += Math.min(o.folderCount / 20, 20)
  s += Math.min(o.langs * 5, 20)
  s += Math.min(o.deps / 5, 15)
  if (o.monorepo) s += 10
  return Math.max(0, Math.min(100, Math.round(s)))
}
function computeDependency(o: { deps: number; lock: boolean; pkgMgrs: number }): number {
  let s = 70
  if (o.lock) s += 15
  if (o.deps === 0) s = 60
  if (o.deps > 150) s -= 15
  if (o.pkgMgrs > 2) s -= 8
  return Math.max(0, Math.min(100, s))
}

interface Facts {
  stack: StackInfo; runtime: string | null; databases: string[]; orms: string[]; cloudProviders: string[]
  containerization: string[]; iac: string[]; cicd: string[]; monorepoTools: string[]
  aiTools: DetectedTool[]; secretsFound: number; secretsByCategory: Record<string, number>; envFiles: string[]
  binaryFileCount: number; hasReadme: boolean; hasLicense: boolean; hasTests: boolean; duplicateFileGroups: number
  totalSize: number; fileCount: number; dependencyCount: number
}

function buildInsights(f: Facts): string[] {
  const out: string[] = []
  const fw = f.stack.frameworks[0]
  const stackParts = [fw, f.orms[0], f.databases[0]].filter(Boolean)
  if (stackParts.length >= 2) out.push(`${stackParts.join(" + ")} stack.`)
  else if (fw) out.push(`${fw} project detected.`)
  if (f.secretsFound > 0) out.push(`This project contains ${f.secretsFound} secret${f.secretsFound === 1 ? "" : "s"}${f.secretsByCategory["API Keys"] ? ` (incl. ${f.secretsByCategory["API Keys"]} API key${f.secretsByCategory["API Keys"] === 1 ? "" : "s"})` : ""}.`)
  if (f.stack.hasGit) out.push("Git repository detected.")
  if (f.containerization.includes("Docker")) out.push("Docker deployment available.")
  if (f.containerization.includes("Kubernetes")) out.push("Kubernetes manifests detected.")
  if (f.stack.isMonorepo) out.push(`Monorepo detected${f.monorepoTools.length ? ` (${f.monorepoTools[0]})` : ""}.`)
  for (const t of f.aiTools) out.push(`${t.name} configuration detected.`)
  if (f.cicd.length) out.push(`${f.cicd[0]} pipeline configured.`)
  if (f.cloudProviders.length) out.push(`${f.cloudProviders.join(", ")} integration found.`)
  if (f.envFiles.length) out.push(`${f.envFiles.length} environment file${f.envFiles.length === 1 ? "" : "s"} found.`)
  if (f.binaryFileCount > 20) out.push(`Large number of binary files (${f.binaryFileCount}).`)
  if (f.duplicateFileGroups > 3) out.push(`${f.duplicateFileGroups} groups of duplicate files detected.`)
  if (!f.hasReadme) out.push("No README found — AI agents will have less project context.")
  return out
}

function buildRecommendations(f: Facts): ProjectIntelligence["recommendations"] {
  const beforeProtect: string[] = []
  const beforeScan: string[] = []
  const beforeRestore: string[] = []
  const beforeAiEditing: string[] = []
  const beforeProduction: string[] = []

  if (f.secretsFound > 0) beforeProtect.push(`Protect before opening in any AI tool — ${f.secretsFound} real secret${f.secretsFound === 1 ? "" : "s"} would otherwise be exposed.`)
  else beforeProtect.push("No secrets detected, but protecting still gives you a safe, disposable copy to hand the AI.")
  if (f.envFiles.length) beforeProtect.push(`${f.envFiles.length} .env file(s) will be virtualized with format-compatible fakes.`)

  beforeScan.push(`Scan covers ${f.fileCount.toLocaleString()} files across ${f.stack.languages.join(", ") || "this project"}.`)
  if (f.secretsByCategory["Private Keys / SSH"]) beforeScan.push("Private keys present — review before sharing this repo anywhere.")

  beforeRestore.push("Restore copies AI edits back and swaps fakes for the real secrets — commit only after reviewing the diff.")
  if (f.stack.hasGit) beforeRestore.push("Git repo detected — restore then review with `git diff` before committing.")

  if (!f.hasReadme) beforeAiEditing.push("Add a README so the AI has architectural context.")
  if (!f.hasTests) beforeAiEditing.push("No tests found — consider asking the AI to add tests so changes are verifiable.")
  if (f.aiTools.length) beforeAiEditing.push(`${f.aiTools.map((t) => t.name).join(", ")} config detected — the AI will pick up your existing rules.`)

  if (f.envFiles.length) beforeProduction.push("Ensure .env files are gitignored and secrets live in a real vault, not the repo.")
  if (!f.cicd.length) beforeProduction.push("No CI/CD detected — add a pipeline to run tests + a security scan on every push.")
  if (f.containerization.includes("Docker")) beforeProduction.push("Docker present — scan the image for secrets baked into layers before shipping.")

  return { beforeProtect, beforeScan, beforeRestore, beforeAiEditing, beforeProduction }
}
