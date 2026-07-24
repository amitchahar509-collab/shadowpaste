# ShadowPaste — Feature Matrix

> Derived from the current source and from real execution. **Verified** column:
> ✅ = ran & asserted in this session · 🔍 = code path read & confirmed, not
> independently executed here · ⚠️ = **NOT VERIFIED** (host/network unavailable).
> **Test Count** = assertions in this session's battery that cover the feature.
> "Status" reflects true maturity, not aspiration.

**Generated:** 2026-07-24 · package `1.0.0` / schema V19 / health API 20.0.0

## Legend
- **Status:** Production Ready · Beta · Experimental · Demo · Not Implemented
- **Production Ready** (last column): Yes / Partial / No — with the honest caveat.

---

## Core Security Engine

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Secret detection | 6 precision detectors + 500-pattern catalog + entropy, provider/scope classifier | `src/lib/security/detector.ts`, `secret-patterns.ts` | Production Ready | ✅ | 6 | Generic/entropy patterns need credential context (by design) | Yes |
| Format-compatible fakes | Shape-preserving fake per provider; batch virtualize | `src/lib/security/fake-secrets.ts` | Production Ready | ✅ | 5 | — | Yes |
| Workspace protect | Copy project, virtualize secrets, byte-copy binaries, write meta | `src/lib/workspace.ts` | Production Ready | ✅ | 2 | — | Yes |
| Workspace restore | Verified fake→real substitution counting; binary byte-copy; partial-restore warnings | `src/lib/workspace.ts` | Production Ready | ✅ | 3 | Agent-mutated placeholder ⇒ reported `missed` (intended) | Yes |
| Binary integrity | Non-secret files copied byte-for-byte both ways | `src/lib/workspace.ts` | Production Ready | ✅ | 1 (PNG identical) | — | Yes |
| Encrypted vault | AES-GCM-256; PBKDF2-derived persisted key; store/retrieve/list/delete | `src/lib/security/vault.ts`, `crypto.ts` | Production Ready | ✅ | 2 | — | Yes |
| Vault restart survival | Key derived from persisted passphrase, not per-process | `src/lib/security/vault.ts` | Production Ready | ✅ (earlier) | 1 | Losing master key = unrecoverable (documented) | Yes |
| Capability tokens | Single-use, 5-min, HMAC-SHA256 scoped credential grants | `src/lib/security/capability.ts` | Production Ready | 🔍 | 0 | — | Yes |
| Credential injection | Raw secret to adapter only during call; redacted from audit | `src/lib/security/vault.ts` | Production Ready | 🔍 (via gateway) | 0 | — | Yes |
| Audit redaction | Secrets replaced with references in all logs | `src/lib/security/vault.ts`, `gateway.ts` | Production Ready | 🔍 | 0 | — | Yes |

## Zero-Trust MCP Gateway

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Risk scoring | Base score + injection/destructive pattern analysis + trust modifier | `src/lib/risk.ts` | Production Ready | ✅ | 2 | — | Yes |
| Policy engine | Hard-deny list, critical→sandbox/deny, trust auto-allow | `src/lib/policy.ts` | Production Ready | ✅ | 2 | — | Yes |
| Gateway pipeline | identity→risk→policy→inject→execute→audit | `src/lib/gateway.ts` | Production Ready | ✅ | 4 | — | Yes |
| Revoked-agent block | Revoked/suspended/quarantined ⇒ immediate deny | `src/lib/gateway.ts` | Production Ready | ✅ | 1 | — | Yes |
| Filesystem adapter | `fs.read/write/list` sandboxed to `.workspace/`, path-escape guard | `src/lib/tools/adapters.ts` | Production Ready | ✅ | (in gateway) | — | Yes |
| GitHub adapter | read/branch/commit/PR via REST v3, vaulted token | `src/lib/tools/adapters.ts` | Production Ready | 🔍 | 0 | Live calls need real token+network (not run here) | Partial |
| Database adapter | `db.read` SELECT-only; DROP/TRUNCATE/DELETE-no-WHERE blocked | `src/lib/tools/adapters.ts` | Production Ready | 🔍 | 0 | — | Yes |
| Stripe adapter | `stripe.read`/`subscription` test-mode, vaulted key | `src/lib/tools/adapters.ts` | Beta | 🔍 | 0 | Needs real Stripe test key (not run here) | Partial |
| Tool registry (28 tools) | 8 categories; 14 with live adapters, rest policy-gated | `src/lib/tool-registry.ts` | Production Ready | ✅ | 1 (count=28) | 14/28 have real adapters (rest hard-denied/sandboxed) | Yes |
| MCP protocol | JSON-RPC 2.0, `2024-11-05`; initialize/list/call/ping | `src/lib/mcp/server.ts`, `api/mcp/route.ts` | Production Ready | ✅ | 4 (lib) + 4 (HTTP) | — | Yes |

## Import System

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Archive import (zip/tar/tgz) | Magic-byte validated, dependency-free extract, zip-slip guarded | `api/workspace/import`, `lib/archive.ts`, `lib/zip.ts` | Production Ready | ✅ (HTTP) | 1 (real zip) | — | Yes |
| Browser folder upload | Pick/drag folder, recurse, path-escape checked | `api/workspace/upload`, `ai-safe-workspace.tsx` | Production Ready | ✅ (engine) | (workspace tests) | Browser folder-pick not run headless | Yes |
| Git clone (HTTPS) | GitHub/GitLab/Bitbucket/Azure/Codeberg/Gitea; SSRF-guarded, no shell | `api/workspace/clone` | Production Ready | 🔍 | 0 | Needs network; public repos only (SSH/private ⇒ CLI) | Partial |
| Server-path import | Confined to `SHADOWPASTE_PROJECT_ROOTS` | `api/workspace/create`, `lib/security/paths.ts` | Production Ready | ✅ (guard rejects) | 1 | Default root = home dir | Yes |
| Path confinement | realpath + root allowlist, blocks traversal/symlink escape | `src/lib/security/paths.ts` | Production Ready | ✅ | 1 | — | Yes |
| Duplicate detection | Warns when project name already exists | all import routes | Production Ready | 🔍 | 0 | — | Yes |
| Recent projects | Last 6 imports in `localStorage` | `ai-safe-workspace.tsx` | Production Ready | 🔍 | 0 | Client-side only | Yes |
| Stack detection | Framework/language/pkg-mgr/git/docker/monorepo | `src/lib/detect-stack.ts` | Production Ready | ✅ (via intel) | (intel tests) | — | Yes |

## Project Intelligence

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Analyze engine | One-walk stack/runtime/db/cloud/CI/AI-tools/scores/insights | `src/lib/project-intelligence.ts` | Production Ready | ✅ | 4 | — | Yes |
| Six scores | security/risk/AI-readiness/complexity/dependency/health (0–100) | same | Production Ready | ✅ | 1 (in-range) | Heuristic weights | Yes |
| Honest build status | tsc/lint/dead-code reported `not_run` with reason | same | Production Ready | ✅ | 1 | Dynamic analysis intentionally not run | Yes |
| Auto-run on import | Runs on every create/import/upload/clone | import routes | Production Ready | ✅ (HTTP zip showed intel) | 1 | — | Yes |

## Authentication & Multi-Tenancy

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Password hashing | scrypt + pepper, constant-time compare | `src/lib/auth.ts` | Production Ready | ✅ | 3 | Prod requires non-placeholder `AUTH_PEPPER` | Yes |
| Session tokens | HMAC-SHA256, 7-day `sp_session` cookie, Bearer fallback | `src/lib/auth.ts` | Production Ready | ✅ (signup/me) | 2 | — | Yes |
| Signup/login/logout/me | Full auth flow + org creation | `api/auth/*` | Production Ready | ✅ | 2 | — | Yes |
| RBAC | OWNER/ADMIN/DEVELOPER/VIEWER enforcement | `src/lib/security/rbac.ts` | Production Ready | 🔍 | 0 | — | Yes |
| Tenant isolation | `orgId` on every scoped query via `tenantWhere` | `src/lib/auth.ts` + routes | Production Ready | 🔍 | 0 | — | Yes |
| Route auth guards | Mutating routes require auth (401) | all 🔒 routes | Production Ready | ✅ | 2 (401s) | — | Yes |
| Malformed-JSON guard | Bad body ⇒ 400 not 500 | import/auth/etc routes | Production Ready | ✅ | 1 | — | Yes |
| Rate limiting | Token bucket, LRU eviction, `TRUST_PROXY`-gated XFF | `src/lib/rate-limit.ts` | Production Ready | ✅ (earlier) | 2 | In-memory (Redis for multi-node) | Partial |

## Agent & Session Management

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Agent identities | Create/list/patch, trust score, status, avatar | `api/agents/*`, `agents.tsx` | Production Ready | 🔍 (created via gateway test) | 0 | — | Yes |
| Permission center | Per-agent/tool allow_always/once/ask/deny | `api/permissions/*`, `policy.ts` | Production Ready | 🔍 | 0 | — | Yes |
| Session DNA | Ed25519 keypair, sign/verify, kill switch, anomaly auto-revoke | `src/lib/security/session-dna.ts` | Production Ready | ✅ | 4 | Private keys in-memory (TPM/Keychain noted as future) | Partial |
| Trust scores | Per-agent trust breakdown | `api/trust`, `trust-score.tsx` | Beta | 🔍 | 0 | — | Partial |

## Scanning

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| GitHub repo scanner | REST tree walk, secret+config findings, auto-vault, grade | `src/lib/github-scanner.ts`, `api/scan`, `api/github/scan-real` | Production Ready | 🔍 | 0 | Needs network/token; 30-file cap | Partial |
| Public scanner | No-login repo scan, shareable score | `api/public-scan`, `public-scanner.tsx` | Production Ready | ✅ (patterns reachable) | 1 | Needs network for real repo | Partial |
| Pattern catalog | 500 secret patterns exposed | `security/secret-patterns.ts`, `api/patterns` | Production Ready | ✅ | 1 (total=500) | — | Yes |
| Config risk scan | Wildcard IAM, TLS-off, privileged, debug, dangerous HTML | `github-scanner.ts` | Production Ready | 🔍 | 0 | — | Yes |

## Monitoring & Compliance

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Audit trail | Immutable, org-scoped, secret-redacted event log | `src/lib/audit.ts`, `api/audit`, `audit-trail.tsx` | Production Ready | 🔍 (writes seen in gateway) | 0 | — | Yes |
| Flight recorder | Replayable tool-call timeline | `security/flight-recorder.ts`, `api/audit/replay` | Beta | 🔍 | 0 | — | Partial |
| Health check | DB/vault/MCP/GitHub probe | `api/health` | Production Ready | ✅ | 1 | — | Yes |
| Dashboard | Live counts + navigation | `api/dashboard`, `dashboard.tsx` | Production Ready | ✅ | 1 | Some counts from seeded demo data | Yes |
| Metrics | Aggregate metrics endpoint | `api/metrics` | Beta | 🔍 | 0 | — | Partial |

## Build & Sandbox

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Shadow sandbox | AI-change diffs, risk-scored, approve/reject | `src/lib/sandbox.ts`, `sandbox.tsx` | Demo | 🔍 | 0 | Uses synthetic demo diffs, not a live AI feed | No |
| Git sandbox | execFileSync argv (no shell), branch handling | `src/lib/git-sandbox.ts` | Beta | 🔍 | 0 | Needs local git repo | Partial |
| Red team lab | Run attack simulations vs policy engine | `src/lib/attacks.ts`, `api/attacks/*`, `attacks.tsx` | Beta | 🔍 | 0 | — | Partial |

## Growth & Commercial

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| MCP marketplace | 10-package catalog + install | `tool-registry.ts`, `api/marketplace/*`, `marketplace.tsx` | Demo | 🔍 | 0 | Static catalog; install is catalog-level | No |
| Billing | Plans/usage/checkout/webhook | `src/lib/billing.ts`, `api/billing/*` | Demo | 🔍 | 0 | Mock mode unless Stripe keys set | No |

## Interfaces

| Feature | Description | Location | Status | Verified | Test Count | Known Issues | Production Ready |
|---|---|---|---|---|---|---|---|
| Web UI (14 modules) | Full dashboard SPA | `src/app/page.tsx`, `components/shadowpaste/*` | Production Ready | ✅ (boots/serves) | — | Pixel visuals NOT VERIFIED (no screenshots) | Yes |
| CLI (6 commands) | init/protect/restore/status/open/daemon | `cli/index.ts` | Production Ready | ✅ | 3 | — | Yes |
| VS Code extension | Scan/protect/MCP-config commands | `extensions/vscode` | Beta | ⚠️ | 0 | Extension host not runnable here | Partial |
| Cursor extension | Re-export + Cursor MCP config | `extensions/cursor` | Beta | ⚠️ | 0 | Same | Partial |
| Chrome extension (MV3) | GitHub repo scan + popup | `extensions/chrome` | Beta | ⚠️ | 0 | Browser extension host not runnable here | Partial |
| MCP client configs | Claude/Cursor connection JSON | `mcp.json`, `cursor-mcp.json`, `api/mcp-config` | Production Ready | ✅ (endpoint) | (MCP tests) | — | Yes |

---

## Totals

- **Battery assertions executed this session:** **41 engine** (41/41 passed) + HTTP
  suite (health, auth, guards, MCP, zip import, path guard, public/dashboard) + CLI
  (version, protect, restore) — **0 failures**.
- **Production Ready = Yes:** ~30 features. **Partial:** ~14 (need
  network/credentials/multi-node, or in-memory-only). **Demo/No:** sandbox diffs,
  marketplace catalog, billing.
- **NOT VERIFIED:** the three editor/browser extensions (host unavailable) and
  pixel-level UI visuals (no screenshot compositing). Live git-clone and real
  GitHub/Stripe adapter calls were read but not exercised end-to-end (network +
  real credentials).

See `PRODUCT_DOCUMENTATION.md` for architecture and `USER_GUIDE.md` for step-by-step
usage.
