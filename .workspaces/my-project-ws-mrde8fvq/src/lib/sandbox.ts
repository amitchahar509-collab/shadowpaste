// ShadowPaste V18 — AI Sandbox (Shadow Workspace)
// Original project -> sandbox copy -> AI changes -> scan -> approve -> merge

import { db } from "./db"

export interface SandboxDiff {
  filePath: string
  changeType: "created" | "modified" | "deleted"
  diff: string
  riskLevel: string
  riskReason: string
  approved: boolean
}

// Risk detector for sandbox changes
const DANGEROUS_DIFF_PATTERNS: Array<{ re: RegExp; level: string; reason: string }> = [
  { re: /process\.env\.[A-Z_]+/g, level: "high", reason: "Reads environment secrets" },
  { re: /fs\.readFile\s*\(\s*['"]\/etc\/passwd/g, level: "critical", reason: "Reads system file /etc/passwd" },
  { re: /eval\s*\(/g, level: "high", reason: "Uses eval() — code injection risk" },
  { re: /child_process/g, level: "high", reason: "Spawns child process" },
  { re: /DROP\s+TABLE/gi, level: "critical", reason: "DROP TABLE in change" },
  { re: /rm\s+-rf/g, level: "critical", reason: "rm -rf in change" },
  { re: /curl\s+.*\|\s*(bash|sh)/g, level: "critical", reason: "curl | shell" },
  { re: /aws_access_key|aws_secret/gi, level: "high", reason: "Hardcoded AWS credentials" },
  { re: /sk_live_|pk_live_/g, level: "high", reason: "Hardcoded Stripe keys" },
  { re: /ghp_[a-zA-Z0-9]{36}/g, level: "high", reason: "Hardcoded GitHub token" },
]

export function analyzeDiff(diff: string): { riskLevel: string; riskReason: string } {
  for (const p of DANGEROUS_DIFF_PATTERNS) {
    if (p.re.test(diff)) {
      return { riskLevel: p.level, riskReason: p.reason }
    }
  }
  if (diff.length > 3000) return { riskLevel: "medium", riskReason: "Large change — review recommended" }
  return { riskLevel: "low", riskReason: "No dangerous patterns detected" }
}

// Generate a synthetic diff for demo sandbox changes
export function shadow-rSrBfSTN81QZaFhhf(projectName: string): Omit<SandboxDiff, "approved">[] {
  const changes: Omit<SandboxDiff, "approved">[] = [
    {
      filePath: `src/api/users.ts`,
      changeType: "modified",
      diff: `@@ -12,7 +12,11 @@
 export async function getUser(id: string) {
-  return db.user.findUnique({ where: { id } })
+  const user = await db.user.findUnique({ where: { id } })
+  // AI: add caching layer
+  await cache.set(\`user:\${id}\`, user, 300)
+  return user
 }`,
      riskLevel: "low",
      riskReason: "No dangerous patterns detected",
    },
    {
      filePath: `scripts/migrate.ts`,
      changeType: "created",
      diff: `+import { db } from "@/lib/db"
+async function run() {
+  await db.$executeRaw\`DROP TABLE old_logs\`
+  console.log("cleaned up")
+}`,
      riskLevel: "critical",
      riskReason: "DROP TABLE in change",
    },
    {
      filePath: `.env.example`,
      changeType: "modified",
      diff: `@@ -1,3 +1,4 @@
 DATABASE_URL="postgresql://localhost/shadow"
+STRIPE_SECRET_KEY="sk_live_..."
+GITHUB_TOKEN="ghp_shadowxQwbjvxsFon4fKlsnqZfb4FGdTssXO"`,
      riskLevel: "high",
      riskReason: "Hardcoded Stripe keys",
    },
    {
      filePath: `src/utils/render.ts`,
      changeType: "modified",
      diff: `@@ -5,4 +5,6 @@
 export function render(template: string, data: any) {
-  return template.replace(/\\{\\{(\\w+)\\}\\}/g, (_, k) => data[k])
+  // AI optimization: use eval for dynamic templates
+  return eval(\`(\${JSON.stringify(data)}) => \\\`\${template}\\\`\`)(data)
 }`,
      riskLevel: "high",
      riskReason: "Uses eval() — code injection risk",
    },
    {
      filePath: `README.md`,
      changeType: "modified",
      diff: `@@ -1,4 +1,5 @@
 # ${projectName}
+> Now with AI-assisted caching and migration tooling.`,
      riskLevel: "low",
      riskReason: "No dangerous patterns detected",
    },
  ]
  // Re-analyze with the detector for consistency
  return changes.map((c) => ({ ...c, ...analyzeDiff(c.diff) }))
}
