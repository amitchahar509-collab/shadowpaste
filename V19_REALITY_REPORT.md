# ShadowPaste V19 — Reality Report (Phase 0 Truth Audit)

> Audit of the V18 codebase as it actually exists in `src/`. No reliance on prior reports.
> Every claim below is backed by a file path + line inspection.

---

## Verdict Summary

V18 is a **polished, working demo** of an AI Security OS UI backed by a **real policy + risk + audit pipeline**. However several "features" shown in the UI are **simulated**: tool execution returns mock outputs, the GitHub scanner scans a bundled demo repo (not real repos), the MCP gateway is an HTTP API (not a real MCP-protocol server), and there is **no authentication, no multi-tenancy, no encrypted vault, and no credential injection**. The original ShadowPaste engine (crypto / vault / secret-detector / capability tokens / RBAC) exists in the uploaded `tt4.zip` but is **NOT connected** to the Next.js app.

---

## REAL (works end-to-end)

| Component | Evidence |
|-----------|----------|
| Policy engine | `src/lib/policy.ts` — hard-deny rules, risk-tiered decisions, existing-permission reuse. Verified: `db.schema.drop` → DENY. |
| Risk scoring | `src/lib/risk.ts` — base tool risk + destructive-input regex (DROP, rm -rf, fork bomb, curl\|bash, prompt injection, secret refs) + agent-trust modifier. |
| Audit timeline | `src/lib/audit.ts` + `ToolCall` Prisma model — every gateway call writes a real DB row with input/output/risk/decision/reason. |
| Agent identity model | `Agent` Prisma model + `src/app/api/agents/*` — real CRUD, trust-score updates, status (active/suspended/quarantine/revoked). Revoked agents blocked at gateway. |
| Permission grants | `Permission` model + `/api/permissions` — real upsert/decision (allow_always/allow_once/ask/deny), checked by policy engine. |
| Tool registry | `src/lib/tool-registry.ts` — 25 tools, 10 packages, real risk metadata. |
| Sandbox diff risk detector | `src/lib/sandbox.ts` — `analyzeDiff()` flags DROP/eval/child_process/hardcoded keys with real regex. |
| Secret scanner patterns | `src/lib/scanner.ts` — real regex for Stripe/GitHub/AWS/Slack/Google/private keys/DB URIs. **But only runs against bundled DEMO_REPO_FILES** (see BROKEN). |
| Red-team attack runner | `src/lib/attacks.ts` + `/api/attacks/run` — real risk+policy evaluation per scenario, writes `AttackTest` rows. 6/6 blocked. |
| Dashboard metrics | `/api/dashboard` — real DB aggregates, live recent-calls feed. |

---

## PARTIAL (real core, mock edges)

| Component | What's real | What's fake | Fix |
|-----------|-------------|-------------|-----|
| **MCP Gateway** (`src/lib/gateway.ts`) | Risk → policy → audit pipeline is real | `simulateExecution()` returns mock outputs per category; no real tool side-effects | P3: real adapters |
| **MCP "server"** (`/api/mcp/call`) | HTTP POST invokes the gateway | NOT the MCP JSON-RPC protocol; Claude Desktop / Cursor cannot connect | P2: real MCP endpoint |
| **GitHub scanner** (`/api/scan`) | Scanner regex + trust-score math are real | Always scans `DEMO_REPO_FILES` constant, ignores `repoUrl` | P8: real GitHub API fetch |
| **Public scanner** (`/api/public-scan`) | Same as above | Same — demo repo only | P8 |
| **Sandbox changes** (`src/lib/seed.ts`) | Diff viewer + risk detector are real | `generateSyntheticChanges()` returns 5 hardcoded synthetic diffs, not real AI edits | P5: capture real tool writes |
| **Flight recorder** | Timeline + replay read real `ToolCall` rows | Seeded `AttackTest` history is pre-baked; no "clear seed" | P10: real-only mode |

---

## BROKEN / DISCONNECTED

| Component | Issue |
|-----------|-------|
| **No encrypted vault** | `src/lib/` has NO crypto/vault module. Secrets detected by the scanner are counted but never stored, encrypted, or injectable. The `tt4.zip` `packages/crypto` + `packages/security` + `packages/capability` (real WebCrypto AES-GCM vault + HMAC capability tokens) are **not imported anywhere**. |
| **No credential injection** | Nothing mints temporary, scoped, expiry-bound credentials for tool calls. AI agents would receive raw secrets or none at all. |
| **No authentication** | No `User` model, no NextAuth config, no session. Every API is anonymous. `/api/agents` etc. are world-readable and world-writable. |
| **No multi-tenancy** | No `Organization`, no `orgId` on any model. All users share one global dataset. User A can read/delete User B's agents. |
| **No RBAC** | The `tt4.zip` `packages/rbac` (OWNER/ADMIN/DEVELOPER/VIEWER matrix) is not connected. |
| **MCP marketplace install** | `/api/marketplace/[id]/install` only increments a counter — does not actually register tools or provision anything. |
| **Sandbox approve** | `/api/sandbox/[id]/approve` flips a boolean — no real merge to a filesystem/git happens. |

---

## FAKE BUTTONS / MOCK INTERACTIONS (in UI)

| Button | What it claims | What it actually does |
|--------|----------------|----------------------|
| `mcp-gateway.tsx` "Protect Now" (none — but "Invoke Through Gateway") | Runs tool | Calls gateway which returns mock output |
| `ai-safe-github.tsx` "Protect Now" | Protect repo | No-op (no onClick wired to real protection) |
| `ai-safe-github.tsx` "Scan" | Scan real repo | Scans bundled DEMO_REPO_FILES regardless of URL |
| `trust-score.tsx` "Share Score" | Share badge | `navigator.share` / clipboard only — no real share image generation |
| `marketplace.tsx` "Install" | Install MCP package | Increments `installs` counter only |
| `agents.tsx` "Register Agent" | Create identity | Real DB insert ✓ (this one is honest) |
| `public-scanner.tsx` "Scan" | Scan any GitHub URL | Scans bundled demo repo |

---

## DEMO DATA (seeded, not real)

`src/lib/seed.ts` inserts on every first load:
- 5 agents (Claude Code, Cursor, GPT-4o, Copilot, Rogue Experiment X) — **fabricated**
- 25 MCP tools — **catalog data, not installed tools**
- 10 MCP packages with fake install counts (18420, 9210, …) — **fabricated**
- 1 project "acme-platform" with a scan — **synthetic**
- 5 sandbox changes — **hardcoded synthetic diffs**
- 6 pre-baked `AttackTest` rows marked "blocked" — **not from real runs**
- 1 public scan share — **synthetic**

---

## SECURITY GAPS

1. **No auth on any API** — `/api/agents` POST creates agents anonymously; `/api/agents/[id]` PATCH mutates trust/status with no identity check.
2. **No tenant isolation** — cross-user data access is trivially possible.
3. **No secret vault** — detected secrets are never stored encrypted; the scanner only counts them.
4. **No credential redaction in audit** — `ToolCall.input` stores raw JSON; if a real secret were passed it would be logged in plaintext.
5. **No rate limiting** on `/api/mcp/call` or `/api/public-scan`.
6. **`prisma` log: `['query']`** in `src/lib/db.ts` logs every SQL query (including any secret-bearing rows) to stdout in dev — info leak risk.
7. **No CSRF protection** on mutating routes.
8. **Dev-only SQLite** — no Postgres/Redis despite V19 mission asking for them (sandbox constraint: SQLite only).

---

## DUPLICATED / UNUSED CODE

| Issue | Location |
|-------|----------|
| Risk pattern detection duplicated | `src/lib/risk.ts` (DESTRUCTIVE_PATTERNS) AND `src/lib/sandbox.ts` (DANGEROUS_DIFF_PATTERNS) AND `src/lib/scanner.ts` (SECRET_PATTERNS) — three separate pattern lists, partially overlapping. The `tt4.zip` `packages/security` has a 4th canonical detector matrix. **Must unify.** |
| `scoreToGrade` duplicated | `src/lib/scanner.ts` and `src/components/shadowpaste/shared.tsx` (GradeBadge) — two sources of truth. |
| `riskLevel` type redeclared | `shared.tsx`, `risk.ts`, `policy.ts` all declare RiskLevel. |
| Unused `examples/` websocket demo | `examples/websocket/*` — not referenced by the app. |
| `src/app/api/route.ts` | Default scaffold API root — unused. |

---

## REMOVED (planned for V19)

- `simulateExecution()` mock outputs → replaced by real adapters (P3)
- `DEMO_REPO_FILES` constant dependency in `/api/scan` + `/api/public-scan` → replaced by real GitHub fetch (P8)
- `generateSyntheticChanges()` as the only sandbox source → real tool writes captured (P5/P10)
- Seeded `AttackTest` "blocked" rows → cleared; only real run results kept (P10)
- `db.ts` `log: ['query']` → silenced (security)

---

## STATUS MARKERS

| Area | Status |
|------|--------|
| UI / UX | REAL (polished, VLM-verified) — keep |
| Policy / Risk / Audit engine | REAL — keep, extend |
| MCP Gateway pipeline | PARTIAL → make real (P2/P3) |
| Tool execution | BROKEN (mock) → make real (P3) |
| Vault / Crypto / Capability | REMOVED (disconnected) → reconnect (P1/P4) |
| Secret detector | PARTIAL (duplicated) → unify (P1) |
| GitHub scanner | PARTIAL (demo files) → real API (P8) |
| SaaS backend (User/Org/Auth) | BROKEN (absent) → build (P6) |
| Multi-tenancy | BROKEN (absent) → build (P7) |
| RBAC | REMOVED (disconnected) → reconnect (P1/P7) |
| Extensions | REMOVED (in zip, not in app) → port (P9) |
| Flight recorder | PARTIAL (real reads, seeded writes) → real-only (P10) |

---

## Build Order for V19

1. **P1** Merge old engine → `src/lib/security/*` (one source of truth for crypto/vault/detector/capability/rbac)
2. **P6+P7** SaaS multi-tenant schema + NextAuth + tenant isolation (foundational — everything needs orgId)
3. **P2** Real MCP server endpoint (JSON-RPC over SSE)
4. **P3** Real tool execution adapters (filesystem/github/database/stripe)
5. **P4** Vault credential injection into MCP tool calls
6. **P8** Real GitHub scanner (REST API)
7. **P10** Real flight recorder (clear seed, real-only)
8. **P9/P11/P12** Extensions + war tests + docker/CI (subagents, parallel)

End of audit. Implementation begins.
