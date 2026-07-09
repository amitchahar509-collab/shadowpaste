// ShadowPaste V18 — AI Safe Scanner + Trust Score Engine
// Scans projects/repos for secrets, dangerous permissions, unsafe configs

export interface ScanFinding {
  type: "secret" | "permission" | "config" | "dependency"
  severity: "low" | "medium" | "high" | "critical"
  file: string
  line: number
  message: string
  evidence: string
}

const SECRET_PATTERNS: Array<{ re: RegExp; name: string; severity: ScanFinding["severity"] }> = [
  { re: /sk_live_[A-Za-z0-9]{16,}/g, name: "Stripe Live Secret Key", severity: "critical" },
  { re: /ghp_[A-Za-z0-9]{36}/g, name: "GitHub Personal Access Token", severity: "critical" },
  { re: /AKIA[0-9A-Z]{16}/g, name: "AWS Access Key ID", severity: "critical" },
  { re: /aws_secret_access_key\s*=\s*["'][A-Za-z0-9/+=]{40}["']/gi, name: "AWS Secret Key", severity: "critical" },
  { re: /xox[baprs]-[A-Za-z0-9-]{10,}/g, name: "Slack Token", severity: "high" },
  { re: /AIza[0-9A-Za-z\-_]{35}/g, name: "Google API Key", severity: "high" },
  { re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, name: "Private Key Block", severity: "critical" },
  { re: /mongodb(\+srv)?:\/\/[^:\s]+:[^@\s]+@/gi, name: "MongoDB Connection w/ Credentials", severity: "high" },
  { re: /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/gi, name: "Postgres Connection w/ Credentials", severity: "high" },
]

const PERMISSION_PATTERNS: Array<{ re: RegExp; name: string; severity: ScanFinding["severity"] }> = [
  { re: /"\*:\*"/g, name: "Wildcard IAM Action (*:*)", severity: "critical" },
  { re: /"Action"\s*:\s*"\*"/g, name: "Wildcard IAM Action (*)", severity: "high" },
  { re: /"Resource"\s*:\s*"\*"/g, name: "Wildcard IAM Resource (*)", severity: "high" },
  { re: /mode:\s*0?[0-7]?777/g, name: "World-writable file mode 777", severity: "medium" },
  { re: /privileged:\s*true/g, name: "Privileged container mode", severity: "high" },
  { re: /allowDangerousHTML/g, name: "allowDangerousHTML enabled", severity: "medium" },
]

const CONFIG_PATTERNS: Array<{ re: RegExp; name: string; severity: ScanFinding["severity"] }> = [
  { re: /verifyTLS\s*=\s*false/gi, name: "TLS verification disabled", severity: "high" },
  { re: /rejectUnauthorized\s*=\s*false/g, name: "TLS rejectUnauthorized disabled", severity: "high" },
  { re: /DEBUG\s*=\s*true/g, name: "Debug mode enabled in config", severity: "medium" },
  { re: /CORS.*\*/gi, name: "Wildcard CORS origin", severity: "medium" },
]

export interface ScanResult {
  findings: ScanFinding[]
  secretsCount: number
  permissionsCount: number
  configsCount: number
  score: number
  grade: string
}

// Scan a text blob (file content or repo listing)
export function scanText(text: string, file = "unknown"): ScanFinding[] {
  const findings: ScanFinding[] = []
  const lines = text.split("\n")

  for (const { re, name, severity } of SECRET_PATTERNS) {
    let m
    const globalRe = new RegExp(re.source, re.flags)
    while ((m = globalRe.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split("\n").length
      findings.push({
        type: "secret",
        severity,
        file,
        line: lineNo,
        message: name,
        evidence: maskEvidence(m[0]),
      })
    }
  }
  for (const { re, name, severity } of PERMISSION_PATTERNS) {
    let m
    const globalRe = new RegExp(re.source, re.flags)
    while ((m = globalRe.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split("\n").length
      findings.push({
        type: "permission",
        severity,
        file,
        line: lineNo,
        message: name,
        evidence: m[0],
      })
    }
  }
  for (const { re, name, severity } of CONFIG_PATTERNS) {
    let m
    const globalRe = new RegExp(re.source, re.flags)
    while ((m = globalRe.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split("\n").length
      findings.push({
        type: "config",
        severity,
        file,
        line: lineNo,
        message: name,
        evidence: m[0],
      })
    }
  }
  return findings
}

function maskEvidence(s: string): string {
  if (s.length <= 12) return s.slice(0, 4) + "***"
  return s.slice(0, 8) + "..." + s.slice(-4)
}

export function computeTrustScore(findings: ScanFinding[]): number {
  let score = 100
  for (const f of findings) {
    const deductions = { critical: 25, high: 12, medium: 5, low: 2 }
    score -= deductions[f.severity]
  }
  return Math.max(0, Math.min(100, score))
}

export function scoreToGrade(score: number): string {
  if (score >= 95) return "A+"
  if (score >= 90) return "A"
  if (score >= 80) return "B"
  if (score >= 70) return "C"
  if (score >= 60) return "D"
  return "F"
}

export function runScan(repoContent: string, repoName: string): ScanResult {
  const findings = scanText(repoContent, repoName)
  const secretsCount = findings.filter((f) => f.type === "secret").length
  const permissionsCount = findings.filter((f) => f.type === "permission").length
  const configsCount = findings.filter((f) => f.type === "config").length
  const score = computeTrustScore(findings)
  return {
    findings,
    secretsCount,
    permissionsCount,
    configsCount,
    score,
    grade: scoreToGrade(score),
  }
}

// Demo repo content for the "Make Repo AI Safe" simulation
export const DEMO_REPO_FILES: Array<{ path: string; content: string }> = [
  {
    path: "config/database.js",
    content: `const url = "shadow-fYaGN7NFAdLy1dGFk1s0VCDCduiqJFiy0nogEUsm"
module.exports = { url }`,
  },
  {
    path: ".env",
    content: `DATABASE_URL="postgresql://localhost/dev"
STRIPE_SECRET_KEY="sk_test_shadowKgP1ciZYas0lFoQzcd11"
GITHUB_TOKEN="ghp_shadowcypTVd8ebOKxgccxkEGUuegY3xOSj5"
AWS_ACCESS_KEY_ID="AKIAZ7FH79Q8O9XS1UQA"`,
  },
  {
    path: "iam/policy.json",
    content: `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "*",
    "Resource": "*"
  }]
}`,
  },
  {
    path: "docker-compose.yml",
    content: `services:
  app:
    image: myapp:latest
    privileged: true
    ports:
      - "3000:3000"`,
  },
  {
    path: "src/server.js",
    content: `const https = require("https")
const agent = new https.Agent({ rejectUnauthorized: false })
// dev only
fetch(url, { agent })`,
  },
  {
    path: "src/index.ts",
    content: `export const app = createApp()
app.listen(3000)`,
  },
]
