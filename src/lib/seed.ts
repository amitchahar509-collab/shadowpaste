// ShadowPaste V18 — Seed data
// Populates the database with demo agents, MCP tools, packages, projects

import { db } from "./db"
import { TOOL_REGISTRY, MCP_PACKAGES } from "./tool-registry"
import { DEMO_REPO_FILES, runScan } from "./scanner"
import { generateSyntheticChanges, analyzeDiff } from "./sandbox"
import { ATTACK_SCENARIOS } from "./attacks"

export async function seedDatabase() {
  // Idempotent: only seed if empty
  const agentCount = await db.agent.count()
  if (agentCount > 0) return { seeded: false, reason: "already populated" }

  // 1. Agents
  const agents = await db.$transaction([
    db.agent.create({ data: {
      name: "Claude Code Agent", provider: "Claude", description: "Anthropic Claude coding agent — file edits, PRs, repo ops", trustScore: 88, status: "active", avatarColor: "#d97706", modelVersion: "claude-sonnet-4.5", totalCalls: 0, allowedCalls: 0, deniedCalls: 0,
    }}),
    db.agent.create({ data: {
      name: "Cursor Dev Agent", provider: "Cursor", description: "Cursor IDE agent — code generation, refactors", trustScore: 74, status: "active", avatarColor: "#0ea5e9", modelVersion: "cursor-1.0", totalCalls: 0, allowedCalls: 0, deniedCalls: 0,
    }}),
    db.agent.create({ data: {
      name: "GPT-4o Assistant", provider: "ChatGPT", description: "OpenAI GPT-4o general assistant", trustScore: 62, status: "active", avatarColor: "#10b981", modelVersion: "gpt-4o", totalCalls: 0, allowedCalls: 0, deniedCalls: 0,
    }}),
    db.agent.create({ data: {
      name: "Rogue Experiment X", provider: "Custom", description: "Unvetted custom agent — under quarantine", trustScore: 18, status: "quarantined", avatarColor: "#ef4444", modelVersion: "custom-0.1", totalCalls: 0, allowedCalls: 0, deniedCalls: 0,
    }}),
    db.agent.create({ data: {
      name: "Copilot Workspace", provider: "Copilot", description: "GitHub Copilot workspace agent", trustScore: 81, status: "active", avatarColor: "#6366f1", modelVersion: "copilot-2.1", totalCalls: 0, allowedCalls: 0, deniedCalls: 0,
    }}),
  ])

  // 2. MCP tools
  for (const t of TOOL_REGISTRY) {
    await db.mcpTool.create({ data: {
      name: t.name, category: t.category, description: t.description, riskLevel: t.riskLevel, riskScore: t.riskScore, inputSchema: JSON.stringify(t.inputSchema), enabled: true, packageName: t.packageName,
    }})
  }

  // 3. MCP packages
  for (const p of MCP_PACKAGES) {
    await db.mcpPackage.create({ data: {
      name: p.name, displayName: p.displayName, description: p.description, category: p.category, icon: p.icon, installs: p.installs, verified: p.verified, riskLevel: p.riskLevel, publisher: p.publisher, version: p.version, toolCount: p.toolCount,
    }})
  }

  // 4. Sessions for each agent
  for (const a of agents) {
    await db.session.create({ data: {
      agentId: a.id, status: a.status === "quarantined" ? "blocked" : "active", context: JSON.stringify({ project: "acme-platform", environment: "development" }), source: a.provider.toLowerCase(),
    }})
  }

  // 5. Permissions for Claude agent (allowed/blocked examples)
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
    await db.permission.create({ data: { agentId: claude.id, toolName: p.toolName, scope: p.scope, decision: p.decision, riskLevel: p.riskLevel, grantedBy: p.decision === "allow_always" ? "user" : "auto-policy" }})
  }

  // 6. Project + scan + sandbox changes
  const project = await db.project.create({ data: {
    name: "acme-platform", repoUrl: "https://github.com/acme/platform", description: "Main monorepo — Next.js + API + workers", trustScore: 0, status: "scanned", sandboxStatus: "modified", fileCount: 1248,
  }})

  const fullContent = DEMO_REPO_FILES.map((f) => f.content).join("\n")
  const result = runScan(fullContent, "acme-platform")
  await db.scan.create({ data: {
    projectId: project.id, type: "full", status: "completed", findings: JSON.stringify(result.findings), score: result.score,
  }})
  await db.project.update({ where: { id: project.id }, data: {
    trustScore: result.score, secretsProtected: result.secretsCount, riskyFiles: result.findings.length, agentPermissions: 10, securityIssues: result.findings.filter((f) => f.severity === "high" || f.severity === "critical").length,
  }})

  // Sandbox changes
  const changes = generateSyntheticChanges("acme-platform")
  for (const c of changes) {
    const analyzed = analyzeDiff(c.diff)
    await db.sandboxChange.create({ data: {
      projectId: project.id, agentId: claude.id, filePath: c.filePath, changeType: c.changeType, diff: c.diff, riskLevel: analyzed.riskLevel, riskReason: analyzed.riskReason, approved: false,
    }})
  }

  // 7. Public scan share
  await db.publicScan.create({ data: {
    repoUrl: "https://github.com/acme/platform", repoName: "acme/platform", score: result.score, secrets: result.secretsCount, permissions: result.permissionsCount, configs: result.configsCount, findings: JSON.stringify(result.findings), shareId: "share-acme-001",
  }})

  // 8. Pre-record some attack tests (Red Team baseline)
  for (const s of ATTACK_SCENARIOS) {
    await db.attackTest.create({ data: {
      type: s.type, description: s.title, payload: s.payload, result: "blocked", severity: "critical", defense: s.expectedDefense,
    }})
  }

  return { seeded: true, agents: agents.length, tools: TOOL_REGISTRY.length, packages: MCP_PACKAGES.length }
}
