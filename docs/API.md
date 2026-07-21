# API Reference

All endpoints live under `/api`. Authentication is via the `sp_session` cookie
(set by login/signup) or a `Authorization: Bearer <token>` header.

**Auth legend:** 🔓 public · 🔐 authenticated · 🏢 authenticated + tenant-scoped

## Authentication

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/signup` | 🔓 | `{ email, password, name }` → sets session cookie |
| POST | `/api/auth/login` | 🔓 | `{ email, password }` → sets session cookie (rate-limited 10/15min) |
| POST | `/api/auth/logout` | 🔐 | Clears session |
| GET | `/api/auth/me` | 🔐 | Current user + org |

## Workspace (protect / restore)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/workspace/create` | 🔐 | `{ sourcePath, projectName? }` — path confined to `SHADOWPASTE_PROJECT_ROOTS` |
| POST | `/api/workspace/restore` | 🔐 | `{ workspacePath, sourcePath, secrets[] }` — paths confined |
| GET | `/api/workspace/[id]?workspacePath=` | 🔐 | List workspace files (confined to `.workspaces/`) |
| DELETE | `/api/workspace/[id]?workspacePath=` | 🔐 | Remove a workspace (confined to `.workspaces/`) |

## Scanning

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/scan` | 🏢 | `{ repo, token? }` — real GitHub scan, persists project + scan |
| GET | `/api/scan?projectId=` | 🏢 | Project + latest scans (org-scoped) |
| POST | `/api/github/scan-real` | 🏢 | Authenticated real scan |
| POST | `/api/public-scan` | 🔓 | `{ repo }` — anonymous demo scan, returns a shareId |
| GET | `/api/public-scan?shareId=` | 🔓 | Fetch a shared scan |

## MCP gateway

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/mcp` | 🔓* | JSON-RPC MCP endpoint; tools still policy-gated via the gateway. Optional `Bearer <agent-key>`. |
| GET | `/api/mcp?sse=1` | 🔓* | SSE stream |
| POST | `/api/mcp/call` | 🏢 | `{ agentId, toolName, input }` — real tool execution (rate-limited 60/min) |
| GET | `/api/mcp/tools` | 🔓 | Registered tool catalog |

## Agents & permissions

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/agents` | 🏢 | List org agents |
| POST | `/api/agents` | 🔐 | Create agent (billing-enforced) |
| GET | `/api/agents/[id]` | 🏢 | Agent detail |
| PATCH | `/api/agents/[id]` | 🏢 | Update status/trust/metadata (kill switch) |
| GET/POST | `/api/permissions` | 🏢 | List / set a permission decision |
| DELETE | `/api/permissions/[id]` | 🏢 | Revoke a grant |

## Vault

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/vault` | 🔓/🏢 | Masked secret list (org-scoped) |
| POST | `/api/vault` | 🔐 | Store a secret (encrypted, billing-enforced) |
| DELETE | `/api/vault/[id]` | 🏢 | Delete a secret (tenant-scoped) |

## Sandbox, session DNA, marketplace, red-team

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/sandbox` | 🏢 | List sandbox changes |
| POST | `/api/sandbox` | 🏢 | Create / write / merge / reject a git sandbox |
| POST/DELETE | `/api/sandbox/[id]/approve` | 🏢 | Approve (merge) / delete a change |
| POST | `/api/session-dna/create` | 🔐 | Mint a session signing identity |
| GET/DELETE | `/api/session-dna/[id]` | 🔐 (delete) | Status / revoke |
| POST | `/api/marketplace/[id]/install` | 🔐 | Install an MCP package |
| POST | `/api/attacks/run` | 🏢 | Run a red-team scenario against an org agent |

## Billing

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/billing/plans` | 🔓 | Plan catalog |
| GET | `/api/billing/usage` | 🔐 | Current usage vs. limits |
| POST | `/api/billing/checkout` | 🔐 | Start checkout |
| POST | `/api/billing/webhook` | 🔓† | Stripe webhook — **signature-verified**; rejected in production if `STRIPE_WEBHOOK_SECRET` unset |

## Observability

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | 🔓 | DB / vault / MCP / GitHub checks |
| GET | `/api/metrics` | 🔓 | Aggregate counters |
| GET | `/api/dashboard` | 🔓/🏢 | Dashboard rollups |
| GET | `/api/audit` · `/api/audit-logs` | 🏢 | Audit trail (CSV export) |
| POST | `/api/audit/clear` | 🔐 | Clear demo attack history |
| POST\|GET | `/api/seed` | 🔓 dev / 🔐 token | Seed demo data (gated in production by `SEED_TOKEN`) |

\* The `/api/mcp` protocol endpoint accepts optional agent auth for local MCP
clients; **every tool still runs through the policy-gated gateway**.
† Webhook authenticity comes from the Stripe signature, not a session.
