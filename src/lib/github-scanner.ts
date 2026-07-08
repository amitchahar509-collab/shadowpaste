// ShadowPaste V20 — Real GitHub scanner (shared logic)
// Fetches a repo's file tree via GitHub REST API, scans each scannable file
// with the unified secret detector, auto-vaults found secrets, computes trust score.
// Used by /api/scan, /api/public-scan, /api/github/scan-real — ONE implementation.

import { db } from "@/lib/db"
import { scanForSecrets } from "@/lib/security/detector"
import { storeSecret } from "@/lib/security/vault"
import { computeTrustScore, scoreToGrade } from "@/lib/scanner"

export interface ScanFinding {
  type: "secret" | "config"
  severity: "low" | "medium" | "high" | "critical"
  file: string
  line: number
  message: string
  evidence: string
  provider?: string
}

export interface RealScanResult {
  ok: boolean
  repo: { name: string; url: string; stars?: number; defaultBranch: string }
  filesScanned: number
  files: string[]
  findings: ScanFinding[]
  secretsCount: number
  configsCount: number
  vaultedCount: number
  score: number
  grade: string
  error?: string
}

const CONFIG_PATTERNS: Array<{ re: RegExp; name: string; severity: ScanFinding["severity"] }> = [
  { re: /"\*:\*"/g, name: "Wildcard IAM Action (*:*)", severity: "critical" },
  { re: /"Action"\s*:\s*"\*"/g, name: "Wildcard IAM Action (*)", severity: "high" },
  { re: /"Resource"\s*:\s*"\*"/g, name: "Wildcard IAM Resource (*)", severity: "high" },
  { re: /privileged:\s*true/g, name: "Privileged container mode", severity: "high" },
  { re: /rejectUnauthorized\s*=\s*false/g, name: "TLS verification disabled", severity: "high" },
  { re: /verifyTLS\s*=\s*false/gi, name: "TLS verification disabled", severity: "high" },
  { re: /DEBUG\s*=\s*true/g, name: "Debug mode enabled", severity: "medium" },
  { re: /allowDangerousHTML/g, name: "allowDangerousHTML enabled", severity: "medium" },
]

function isScannable(path: string): boolean {
  return /\.(env|js|ts|tsx|jsx|py|rb|go|rs|java|json|ya?ml|toml|ini|conf|sh|sql|md)$/i.test(path)
    || /(^|\/)(\.env|dockerfile|makefile)/i.test(path)
    || /secret|key|credential|config/i.test(path)
}

function scanConfigs(text: string, file: string): ScanFinding[] {
  const out: ScanFinding[] = []
  for (const p of CONFIG_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split("\n").length
      out.push({ type: "config", severity: p.severity, file, line: lineNo, message: p.name, evidence: m[0] })
    }
  }
  return out
}

export async function scanGitHubRepo(repo: string, opts: { token?: string; orgId?: string; projectId?: string } = {}): Promise<RealScanResult> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ShadowPaste-Scanner/1.0",
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  // 1. Repo metadata
  let repoRes: Response
  try {
    repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers, signal: AbortSignal.timeout(10000) })
  } catch (e) {
    return { ok: false, repo: { name: repo, url: "", defaultBranch: "main" }, filesScanned: 0, files: [], findings: [], secretsCount: 0, configsCount: 0, vaultedCount: 0, score: 0, grade: "F", error: (e as Error).message }
  }
  if (!repoRes.ok) {
    return { ok: false, repo: { name: repo, url: "", defaultBranch: "main" }, filesScanned: 0, files: [], findings: [], secretsCount: 0, configsCount: 0, vaultedCount: 0, score: 0, grade: "F", error: `GitHub API ${repoRes.status}` }
  }
  const repoMeta = await repoRes.json()
  const defaultBranch = repoMeta.default_branch || "main"

  // 2. Tree (recursive)
  const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers, signal: AbortSignal.timeout(10000) })
  if (!treeRes.ok) {
    return { ok: false, repo: { name: repo, url: repoMeta.html_url, stars: repoMeta.stargazers_count, defaultBranch }, filesScanned: 0, files: [], findings: [], secretsCount: 0, configsCount: 0, vaultedCount: 0, score: 0, grade: "F", error: `Cannot fetch tree: ${treeRes.status}` }
  }
  const tree = await treeRes.json()
  const files = (tree.tree as Array<{ path: string; type: string; size?: number }>)
    .filter((f) => f.type === "blob" && (f.size || 0) < 100000 && isScannable(f.path))
    .slice(0, 30)

  // 3. Scan each file
  const allFindings: ScanFinding[] = []
  const configFindings: ScanFinding[] = []
  let vaultedCount = 0
  const scannedFiles: string[] = []

  for (const f of files) {
    try {
      const fileRes = await fetch(`https://api.github.com/repos/${repo}/contents/${f.path}`, { headers, signal: AbortSignal.timeout(8000) })
      if (!fileRes.ok) continue
      const fileData = await fileRes.json()
      if (!fileData || fileData.encoding !== "base64" || typeof fileData.content !== "string") continue
      const content = Buffer.from(fileData.content, "base64").toString("utf8")
      scannedFiles.push(f.path)

      const secrets = scanForSecrets(content, f.path)
      for (const s of secrets) {
        if (opts.orgId) {
          try { await storeSecret(s.raw, { name: `${f.path}:${s.line}`, contextHint: f.path, orgId: opts.orgId, projectId: opts.projectId }); vaultedCount++ } catch { /* vault optional */ }
        }
        allFindings.push({ type: "secret", severity: s.severity, file: f.path, line: s.line, message: `${s.provider} ${s.detector}`, evidence: s.masked, provider: s.provider })
      }
      configFindings.push(...scanConfigs(content, f.path))
    } catch { /* skip unscannable */ }
  }

  const findings = [...allFindings, ...configFindings]
  const score = computeTrustScore(findings as never)
  return {
    ok: true,
    repo: { name: repo, url: repoMeta.html_url, stars: repoMeta.stargazers_count, defaultBranch },
    filesScanned: scannedFiles.length,
    files: scannedFiles,
    findings,
    secretsCount: allFindings.length,
    configsCount: configFindings.length,
    vaultedCount,
    score,
    grade: scoreToGrade(score),
  }
}
