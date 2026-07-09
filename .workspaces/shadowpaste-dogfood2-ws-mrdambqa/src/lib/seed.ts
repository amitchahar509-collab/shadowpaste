// ShadowPaste V19 — Seed data (multi-tenant aware)
// Creates a default organization + demo agents/tools/packages for the public demo.
// Real user signups get their own org via /api/auth/signup.

import { db } from "./db"
import { TOOL_REGISTRY, MCP_PACKAGES } from "./tool-registry"
import { DEMO_REPO_FILES, runScan } from "./scanner"
import { shadow-rnoaatyaeDguKe1Jg, analyzeDiff } from "./sandbox"
import { ATTACK_SCENARIOS } from "./attacks"
import { storeSecret } from "./security/vault"

const DEFAULT_ORG_ID = "default"

export async function ensureDefaultOrg() {
  let org = await db.organization.findUnique({ where: { id: DEFAULT_ORG_ID } })
  if (!org) {
    org = await db.organization.create({ data: { id: DEFAULT_ORG_ID, name: "ShadowPaste Demo", slug: "demo", plan: "enterprise" } })
  } else if (org.plan !== "enterprise") {
    // Ensure the demo org is always on ENTERPRISE plan (unlimited) so the public demo + war tests work
    org = await db.organization.update({ where: { id: DEFAULT_ORG_ID }, data: { plan: "enterprise" } })
  }
  return org
}

export async function seedDatabase() {
  const agentCount = await db.agent.count()
  // Always ensure the default org exists + is on ENTERPRISE plan (fixes stale plan from prior seeds)
  await ensureDefaultOrg()
  if (agentCount > 0) return { seeded: false, reason: "already populated" }

  // 1. Agents (all under default org)
  const agents = await db.$transaction([
    db.agent.create({ data: { orgId: DEFAULT_ORG_ID, name: "Claude Code Agent", provider: "Claude", description: "Anthropic Claude coding agent — file edits, PRs, repo ops", trustScore: 88, status: "active", avatarColor: "#d97706", modelVersion: "claude-sonnet-4.5" } }),
    db.agent.create({ data: { orgId: DEFAULT_ORG_ID, name: "Cursor Dev Agent", provider: "Cursor", description: "Cursor IDE agent — code generation, refactors", trustScore: 74, status: "active", avatarColor: "#0ea5e9", modelVersion: "cursor-1.0" } }),
    db.agent.create({ data: { orgId: DEFAULT_ORG_ID, name: "GPT-4o Assistant", provider: "ChatGPT", description: "OpenAI GPT-4o general assistant", trustScore: 62, status: "active", avatarColor: "#10b981", modelVersion: "gpt-4o" } }),
    db.agent.create({ data: { orgId: DEFAULT_ORG_ID, name: "Rogue Experiment X", provider: "Custom", description: "Unvetted custom agent — under quarantine", trustScore: 18, status: "quarantined", avatarColor: "#ef4444", modelVersion: "custom-0.1" } }),
    db.agent.create({ data: { orgId: DEFAULT_ORG_ID, name: "Copilot Workspace", provider: "Copilot", description: "GitHub Copilot workspace agent", trustScore: 81, status: "active", avatarColor: "#6366f1", modelVersion: "copilot-2.1" } }),
  ])

  // 2. MCP tools + packages
  for (const t of TOOL_REGISTRY) {
    await db.mcpTool.create({ data: { name: t.name, category: t.category, description: t.description, riskLevel: t.riskLevel, riskScore: t.riskScore, inputSchema: JSON.stringify(t.inputSchema), enabled: true, packageName: t.packageName } })
  }
  for (const p of MCP_PACKAGES) {
    await db.mcpPackage.create({ data: { name: p.name, displayName: p.displayName, description: p.description, category: p.category, icon: p.icon, installs: p.installs, verified: p.verified, riskLevel: p.riskLevel, publisher: p.publisher, version: p.version, toolCount: p.toolCount } })
  }

  // 3. Sessions
  for (const a of agents) {
    await db.session.create({ data: { agentId: a.id, status: a.status === "quarantined" ? "blocked" : "active", context: JSON.stringify({ project: "acme-platform", environment: "development" }), source: a.provider.toLowerCase() } })
  }

  // 4. Permissions for Claude agent
  const claude = agents[0]
  const permSeeds = [
    { toolName: "fs.read", scope: "read", decision: "allow_always", riskLevel: "low" },
    { toolName: "fs.write", scope: "write", decision: "allow_always", riskLevel: "medium" },
    { toolName: "github.read", scope: "read", decision: "allow_always", riskLevel: "low" },
    { toolName: "github.pr.create", scope: "write", decision: "allow_always", riskLevel: "medium" },
    { toolName: "github.pr.merge", scope: "admin", decision: "ask", riskLevel: "high" },
    { toolName: "github.repo.delete", scope: "dangerous", decision: "deny", riskLevel: "critical" },
    { toolName: "db.read", scope: "read", decision: "allow_always", riskLevel: "low" },
    { toolName: "db.schema.drop", scope: "dangerous", decision: "deny", riskLevel: "critical" },
    { toolName: "stripe.read", scope: "read", decision: "ask", riskLevel: "low" },
    { toolName: "stripe.charge", scope: "dangerous", decision: "deny", riskLevel: "critical" },
  ]
  for (const p of permSeeds) {
    await db.permission.create({ data: { agentId: claude.id, toolName: p.toolName, scope: p.scope, decision: p.decision, riskLevel: p.riskLevel, grantedBy: p.decision === "allow_always" ? "user" : "auto-policy" } })
  }

  // 5. Project + scan
  const project = await db.project.create({ data: { orgId: DEFAULT_ORG_ID, name: "acme-platform", repoUrl: "https://github.com/acme/platform", description: "Main monorepo — Next.js + API + workers", fileCount: 1248 } })
  const fullContent = DEMO_REPO_FILES.map((f) => f.content).join("\n")
  const result = runScan(fullContent, "acme-platform")
  await db.scan.create({ data: { projectId: project.id, type: "full", status: "completed", findings: JSON.stringify(result.findings), score: result.score } })
  await db.project.update({ where: { id: project.id }, data: { trustScore: result.score, secretsProtected: result.secretsCount, riskyFiles: result.findings.length, agentPermissions: 10, securityIssues: result.findings.filter((f) => f.severity === "high" || f.severity === "critical").length } })

  // 6. Auto-vault a few demo secrets (real encrypted storage)
  try {
    await storeSecret("ghp_shadowtEOM60hmWPd8MsASnZvNQaeFKmiLer", { name: "demo-github-token", contextHint: "github", orgId: DEFAULT_ORG_ID, projectId: project.id })
    await storeSecret("sk_test_shadowOh38fIN4buE8va9nlgcN", { name: "demo-stripe-test-key", contextHint: "stripe", orgId: DEFAULT_ORG_ID, projectId: project.id })
  } catch { /* vault key init may race; ignore */ }

  // 7. Sandbox changes
  const changes = generateSyntheticChanges("acme-platform")
  for (const c of changes) {
    const analyzed = analyzeDiff(c.diff)
    await db.sandboxChange.create({ data: { projectId: project.id, agentId: claude.id, filePath: c.filePath, changeType: c.changeType, diff: c.diff, riskLevel: analyzed.riskLevel, riskReason: analyzed.riskReason, approved: false } })
  }

  // 8. Public scan share
  await db.publicScan.create({ data: { repoUrl: "https://github.com/acme/platform", repoName: "acme/platform", score: result.score, secrets: result.secretsCount, permissions: result.permissionsCount, configs: result.configsCount, findings: JSON.stringify(result.findings), shareId: "share-acme-001" } })

  // 9. Attack scenarios (pre-seeded, clearly marked as "Expected" defense — clearable via /api/audit/clear)
  for (const s of ATTACK_SCENARIOS) {
    await db.attackTest.create({ data: { type: s.type, description: s.title, payload: s.payload, result: "blocked", severity: "critical", defense: `Expected: ${s.expectedDefense}` } })
  }

  return { seeded: true, agents: agents.length, tools: TOOL_REGISTRY.length, packages: MCP_PACKAGES.length, vaultedSecrets: 2 }
}
