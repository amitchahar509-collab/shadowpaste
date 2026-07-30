// ShadowPaste V18 — MCP Tool Registry
// Defines all available MCP tools with their risk profiles

export interface ToolDef {
  name: string
  category: string
  description: string
  riskLevel: string
  riskScore: number
  inputSchema: Record<string, unknown>
  /** Parameter names that MUST be supplied. Single source of truth for BOTH
   *  the JSON Schema `required` array in tools/list and runtime validation. */
  required: string[]
  packageName: string
}

// Risk metadata below is the DECLARED base risk. It is asserted against
// risk.ts's TOOL_RISK table by assertRiskMetadataInSync() (see the bottom of this
// file) and by a unit test, because these were two independently hand-maintained
// copies of the same data — which is exactly how stripe.customer.delete came to
// publish "critical/85" while the policy engine resolved it to high/ASK and let a
// single approval click delete a billing record.
//
// Keeping the literals here (rather than computing them) preserves this file as
// the readable public description of the tool surface; the invariant check makes
// silent divergence impossible.
export const TOOL_REGISTRY: ToolDef[] = [
  // Filesystem
  { name: "fs.read", category: "filesystem", description: "Read file contents", riskLevel: "low", riskScore: 10, packageName: "safe-filesystem-mcp", inputSchema: { path: "string" }, required: ["path"] },
  { name: "fs.write", category: "filesystem", description: "Write to a file", riskLevel: "medium", riskScore: 35, packageName: "safe-filesystem-mcp", inputSchema: { path: "string", content: "string" }, required: ["path", "content"] },
  { name: "fs.delete", category: "filesystem", description: "Delete a file", riskLevel: "high", riskScore: 75, packageName: "safe-filesystem-mcp", inputSchema: { path: "string" }, required: ["path"] },
  { name: "fs.execute", category: "filesystem", description: "Execute a file as program", riskLevel: "critical", riskScore: 90, packageName: "safe-filesystem-mcp", inputSchema: { path: "string", args: "string[]" }, required: ["path"] },
  // GitHub
  { name: "github.read", category: "github", description: "Read repo metadata, files, issues", riskLevel: "low", riskScore: 10, packageName: "safe-github-mcp", inputSchema: { repo: "string" }, required: ["repo"] },
  { name: "github.pr.create", category: "github", description: "Open a pull request", riskLevel: "medium", riskScore: 35, packageName: "safe-github-mcp", inputSchema: { repo: "string", title: "string", body: "string" }, required: ["repo", "title"] },
  { name: "github.pr.merge", category: "github", description: "Merge a pull request", riskLevel: "high", riskScore: 70, packageName: "safe-github-mcp", inputSchema: { repo: "string", pr: "number" }, required: ["repo", "pr"] },
  { name: "github.repo.delete", category: "github", description: "DELETE a repository", riskLevel: "critical", riskScore: 100, packageName: "safe-github-mcp", inputSchema: { repo: "string" }, required: ["repo"] },
  { name: "github.secret.access", category: "github", description: "Access repo secrets", riskLevel: "critical", riskScore: 95, packageName: "safe-github-mcp", inputSchema: { repo: "string" }, required: ["repo"] },
  { name: "github.admin", category: "github", description: "Administrative actions on repo/org", riskLevel: "critical", riskScore: 88, packageName: "safe-github-mcp", inputSchema: { repo: "string", action: "string" }, required: ["repo", "action"] },
  // Database
  { name: "db.read", category: "database", description: "Run a SELECT query", riskLevel: "low", riskScore: 20, packageName: "safe-database-mcp", inputSchema: { query: "string" }, required: ["query"] },
  { name: "db.write", category: "database", description: "Run INSERT/UPDATE", riskLevel: "high", riskScore: 55, packageName: "safe-database-mcp", inputSchema: { query: "string" }, required: ["query"] },
  { name: "db.schema.drop", category: "database", description: "DROP TABLE / SCHEMA", riskLevel: "critical", riskScore: 100, packageName: "safe-database-mcp", inputSchema: { target: "string" }, required: ["target"] },
  { name: "db.export", category: "database", description: "Export full database", riskLevel: "critical", riskScore: 92, packageName: "safe-database-mcp", inputSchema: { table: "string" }, required: ["table"] },
  { name: "db.migrate", category: "database", description: "Run a schema migration", riskLevel: "high", riskScore: 65, packageName: "safe-database-mcp", inputSchema: { migration: "string" }, required: ["migration"] },
  // Shell
  { name: "shell.exec", category: "shell", description: "Execute arbitrary shell command", riskLevel: "critical", riskScore: 85, packageName: "safe-shell-mcp", inputSchema: { command: "string" }, required: ["command"] },
  { name: "shell.read", category: "shell", description: "Read command output (non-mutating)", riskLevel: "medium", riskScore: 30, packageName: "safe-shell-mcp", inputSchema: { command: "string" }, required: ["command"] },
  // Network
  { name: "network.fetch", category: "network", description: "HTTP GET request", riskLevel: "low", riskScore: 25, packageName: "safe-network-mcp", inputSchema: { url: "string" }, required: ["url"] },
  { name: "network.webhook", category: "network", description: "Send data to a webhook", riskLevel: "high", riskScore: 60, packageName: "safe-network-mcp", inputSchema: { url: "string", payload: "object" }, required: ["url", "payload"] },
  // Stripe
  { name: "stripe.read", category: "stripe", description: "Read customer/charge data", riskLevel: "low", riskScore: 25, packageName: "safe-stripe-mcp", inputSchema: { resource: "string" }, required: ["resource"] },
  { name: "stripe.refund", category: "stripe", description: "Issue a refund", riskLevel: "high", riskScore: 80, packageName: "safe-stripe-mcp", inputSchema: { chargeId: "string", amount: "number" }, required: ["chargeId"] },
  { name: "stripe.charge", category: "stripe", description: "Create a charge", riskLevel: "critical", riskScore: 90, packageName: "safe-stripe-mcp", inputSchema: { amount: "number", currency: "string" }, required: ["amount", "currency"] },
  { name: "stripe.customer.delete", category: "stripe", description: "Delete a customer record", riskLevel: "critical", riskScore: 85, packageName: "safe-stripe-mcp", inputSchema: { customerId: "string" }, required: ["customerId"] },
  // AI
  { name: "ai.generate", category: "ai", description: "Generate text via LLM", riskLevel: "low", riskScore: 20, packageName: "safe-ai-mcp", inputSchema: { prompt: "string" }, required: ["prompt"] },
  { name: "ai.train", category: "ai", description: "Trigger a model training job", riskLevel: "high", riskScore: 70, packageName: "safe-ai-mcp", inputSchema: { dataset: "string" }, required: ["dataset"] },
  // ShadowPaste high-level tools (the "AI Security Control Plane" surface)
  { name: "shadowpaste.scan", category: "shadowpaste", description: "Scan a GitHub repo for secrets + AI risks. Auto-vaults findings. Returns AI Safety Score.", riskLevel: "low", riskScore: 10, packageName: "shadowpaste-core", inputSchema: { repo: "string", token: "string" }, required: ["repo"] },
  { name: "shadowpaste.protect", category: "shadowpaste", description: "Scan text for secrets, vault them (AES-GCM-256), return redacted text. AI agents never see raw secrets.", riskLevel: "low", riskScore: 5, packageName: "shadowpaste-core", inputSchema: { text: "string", name: "string" }, required: ["text"] },
  { name: "shadowpaste.audit", category: "shadowpaste", description: "Query the immutable audit trail. Returns recent security events (tool calls, vault ops, scans).", riskLevel: "low", riskScore: 5, packageName: "shadowpaste-core", inputSchema: { limit: "number", action: "string" }, required: [] },
]

// Tool bundles exposed through this gateway.
//
// EVERY FIELD HERE MUST BE TRUE. An earlier revision shipped invented adoption
// metrics (`installs: 18420`, `verified: true`) and three bundles — Slack, AWS
// and Vercel — that had no tools behind them at all. None of that was real, and
// shipping invented numbers in the source of a security product is its own
// vulnerability: it tells a reader that nothing else here can be trusted either.
//
// Rules for this list:
//   1. `installs` is NOT declared. It is a database column that starts at 0 and
//      is incremented only by a genuine install (POST /api/marketplace/:id/install).
//   2. `verified` is NOT declared. It defaults to false and may only be set by a
//      real signing/review process, which does not exist yet.
//   3. `toolCount` is DERIVED from TOOL_REGISTRY, so it can never drift.
//   4. A bundle appears here only if it actually has tools in TOOL_REGISTRY.
//   5. `version` tracks the gateway version — these bundles ship with the app
//      and have no independent release cadence.
const PACKAGE_VERSION = "1.0.0"

interface McpPackageSeed {
  name: string
  displayName: string
  description: string
  category: string
  icon: string
  riskLevel: string
  publisher: string
  version: string
  toolCount: number
}

const PACKAGE_DEFS: Array<Omit<McpPackageSeed, "toolCount" | "version">> = [
  { name: "safe-filesystem-mcp", displayName: "Safe Filesystem MCP", description: "Sandboxed file access confined to the workspace, with path allowlists and traversal blocking", category: "filesystem", icon: "FolderTree", riskLevel: "medium", publisher: "ShadowPaste" },
  { name: "safe-github-mcp", displayName: "Safe GitHub MCP", description: "GitHub access with policy gates on merge, secret access and admin actions; repo deletion is hard-denied", category: "github", icon: "Github", riskLevel: "medium", publisher: "ShadowPaste" },
  { name: "safe-database-mcp", displayName: "Safe Database MCP", description: "SQL gateway with a write validator; DROP and full export are hard-denied", category: "database", icon: "Database", riskLevel: "medium", publisher: "ShadowPaste" },
  { name: "safe-shell-mcp", displayName: "Safe Shell MCP", description: "Read-only command execution against a fixed binary allowlist using argv (no shell interpolation). Arbitrary exec is refused — it needs container isolation this build does not provide", category: "devops", icon: "Terminal", riskLevel: "high", publisher: "ShadowPaste" },
  { name: "safe-network-mcp", displayName: "Safe Network MCP", description: "Egress gateway: allowlisted hosts only, with private/loopback/metadata IP blocking and DNS-rebinding re-checks", category: "network", icon: "Globe", riskLevel: "medium", publisher: "ShadowPaste" },
  { name: "safe-stripe-mcp", displayName: "Safe Stripe MCP", description: "Payment operations with capability-scoped credential injection; direct charges are hard-denied", category: "stripe", icon: "CreditCard", riskLevel: "high", publisher: "ShadowPaste" },
  { name: "safe-ai-mcp", displayName: "Safe AI MCP", description: "LLM calls through a provider registry with timeout, retry and cost accounting", category: "ai", icon: "BrainCircuit", riskLevel: "low", publisher: "ShadowPaste" },
  { name: "shadowpaste-core", displayName: "ShadowPaste Core", description: "Secret scanning, AES-GCM-256 vaulting and audit-trail queries", category: "security", icon: "ShieldCheck", riskLevel: "low", publisher: "ShadowPaste" },
]

/** Real tool count per bundle, computed from the registry — never hand-written. */
export function toolCountFor(packageName: string): number {
  return TOOL_REGISTRY.filter((t) => t.packageName === packageName).length
}

export const MCP_PACKAGES: McpPackageSeed[] = PACKAGE_DEFS
  .map((p) => ({ ...p, version: PACKAGE_VERSION, toolCount: toolCountFor(p.name) }))
  // Rule 4: a bundle with no backing tools is not a product.
  .filter((p) => p.toolCount > 0)

/**
 * Assert that published tool metadata matches the risk engine's base table.
 *
 * TOOL_REGISTRY (what tools/list advertises) and TOOL_RISK in risk.ts (what the
 * policy engine scores against) were two hand-maintained copies of the same
 * numbers. When they diverge the product LIES: it publishes one risk level and
 * enforces another. That already happened once — stripe.customer.delete was
 * advertised as critical/85 while the engine resolved it to high, so it fell
 * through to HIGH_RISK_ASK instead of being blocked.
 *
 * Called by a unit test rather than at import time: a module-load throw would
 * take down the whole app for a metadata typo, which is a worse failure than the
 * drift it prevents.
 *
 * @returns a list of human-readable mismatches; empty means in sync.
 */
export function assertRiskMetadataInSync(): string[] {
  // Imported lazily to avoid a module cycle (risk.ts does not depend on this file
  // today, but a static import here would make that a landmine for anyone who
  // later adds one).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getToolBaseRisk } = require("./risk") as typeof import("./risk")
  const problems: string[] = []
  for (const t of TOOL_REGISTRY) {
    const base = getToolBaseRisk(t.name)
    if (base.score !== t.riskScore || base.level !== t.riskLevel) {
      problems.push(
        `${t.name}: registry declares ${t.riskScore}/${t.riskLevel}, risk.ts scores ${base.score}/${base.level}`
      )
    }
  }
  return problems
}
