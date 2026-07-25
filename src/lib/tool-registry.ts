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

export const MCP_PACKAGES = [
  { name: "safe-github-mcp", displayName: "Safe GitHub MCP", description: "Zero-trust GitHub access — read/PR/merge with policy gates", category: "github", icon: "Github", installs: 18420, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "2.4.1", toolCount: 6 },
  { name: "safe-stripe-mcp", displayName: "Safe Stripe MCP", description: "Payment ops with charge caps & refund approvals", category: "stripe", icon: "CreditCard", installs: 9210, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "1.8.0", toolCount: 4 },
  { name: "safe-database-mcp", displayName: "Safe Database MCP", description: "SQL gateway with destructive-query blocking", category: "database", icon: "Database", installs: 15300, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "3.1.2", toolCount: 5 },
  { name: "safe-filesystem-mcp", displayName: "Safe Filesystem MCP", description: "Sandboxed file access with path allowlists", category: "filesystem", icon: "FolderTree", installs: 22100, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "2.0.0", toolCount: 4 },
  { name: "safe-shell-mcp", displayName: "Safe Shell MCP", description: "Command execution with command allowlist & audit", category: "devops", icon: "Terminal", installs: 7880, verified: false, riskLevel: "medium", publisher: "Community", version: "0.9.4", toolCount: 2 },
  { name: "safe-network-mcp", displayName: "Safe Network MCP", description: "Egress gateway with domain allowlist", category: "network", icon: "Globe", installs: 6540, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "1.5.0", toolCount: 2 },
  { name: "safe-ai-mcp", displayName: "Safe AI MCP", description: "LLM calls with prompt-injection filtering", category: "ai", icon: "BrainCircuit", installs: 11200, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "1.2.0", toolCount: 2 },
  { name: "safe-slack-mcp", displayName: "Safe Slack MCP", description: "Messaging with channel allowlist & rate limit", category: "communication", icon: "MessageSquare", installs: 5430, verified: false, riskLevel: "low", publisher: "Community", version: "0.7.1", toolCount: 3 },
  { name: "safe-aws-mcp", displayName: "Safe AWS MCP", description: "Cloud ops with IAM-scoped credentials", category: "devops", icon: "Cloud", installs: 8970, verified: true, riskLevel: "medium", publisher: "ShadowPaste", version: "2.1.0", toolCount: 8 },
  { name: "safe-vercel-mcp", displayName: "Safe Vercel MCP", description: "Deploy & rollback with prod-deploy approval", category: "devops", icon: "Rocket", installs: 4320, verified: true, riskLevel: "low", publisher: "ShadowPaste", version: "1.1.0", toolCount: 4 },
]
