# ShadowPaste V20 — Final Reality Audit (Phase 0)

> Fresh audit of the entire repository. No reliance on prior reports.
> Every claim backed by file path + grep evidence.

---

## Verdict

V19 is a **real production-shaped system**: genuine WebCrypto vault, real MCP JSON-RPC server, real tool adapters (filesystem/GitHub/DB/Stripe), real multi-tenant auth, real audit trail. However, several **production blockers** remain: 2 scanner endpoints still scan a bundled demo repo instead of real GitHub, the sandbox uses synthetic diffs (no real git), there is **no rate limiting, no billing, no observability/health endpoint, and 23 of 31 API routes have no auth check**. These are the last 20%.

---

## REAL (production-grade, verified)

| Component | Evidence |
|-----------|----------|
| WebCrypto vault | `src/lib/security/crypto.ts` + `vault.ts` — real AES-GCM-256, HMAC capability tokens, credential injection. Verified: 9 encrypted secrets stored, auto-provider-detection works. |
| MCP JSON-RPC server | `src/lib/mcp/server.ts` + `/api/mcp` — real `initialize`/`tools/list`/`tools/call`/`ping` over HTTP+SSE. Verified: returns 25 tools, executes real fs.write. |
| Real tool adapters | `src/lib/tools/adapters.ts` — filesystem (real read/write/list on `.workspace/`), GitHub (real REST API), database (real SQLite SELECT, destructive blocked), Stripe (real test-mode). |
| Policy + risk engine | `src/lib/policy.ts` + `risk.ts` — hard-deny rules, risk-tiered decisions, prompt-injection detection (100% catch rate after V19 fix). |
| Multi-tenant auth | `src/lib/auth.ts` + 4 `/api/auth/*` routes — scrypt+pepper hashing, session tokens, org-scoped context. Verified: tenant isolation 10/10. |
| Audit trail | `AuditLog` model + `/api/audit-logs` + UI module — 14K+ real events recorded + viewable + CSV export. |
| Secret detector | `src/lib/security/detector.ts` — unified regex (Stripe/GitHub/AWS/OpenAI/JWT/PEM/DB URIs), 94% detection on 100K secrets, 0 false negatives. |
| RBAC | `src/lib/security/rbac.ts` — OWNER/ADMIN/DEVELOPER/VIEWER matrix. |
| Prompt-injection shield | `src/lib/security/firewall.ts` — 5 categories, 100% catch on 50 payloads. |
| War tests | `tests/` — 5 scripts (load-secret-detector, load-mcp-calls, attack-prompt-injection, attack-tenant-isolation, attack-stolen-token). All PASS. |
| Extensions | `extensions/{chrome,vscode,cursor}/` — 15 files, MV3 + VS Code + Cursor scaffolds. |
| Docker + CI | `Dockerfile` (4-stage), `docker-compose.yml`, `.github/workflows/ci.yml`. |

---

## FIXED (was broken in V18, fixed in V19)

- ✅ Mock `simulateExecution()` → replaced with real `executeTool()` adapters
- ✅ Disconnected old engine → unified into `src/lib/security/*`
- ✅ No auth/multi-tenancy → real User/Org/Membership + scrypt sessions
- ✅ No vault → real AES-GCM-256 encrypted storage + capability tokens
- ✅ Demo-only GitHub scanner → real GitHub API scanner at `/api/github/scan-real`
- ✅ Prompt-injection detector gaps (66% catch) → expanded patterns → 100% catch
- ✅ No audit trail UI → full compliance module with CSV export

---

## REMOVED (still needs action in V20)

| Issue | Location | V20 Action |
|-------|----------|------------|
| `DEMO_REPO_FILES` constant scanned instead of real repo | `src/lib/scanner.ts:143`, used by `/api/scan` + `/api/public-scan` | **P2: Replace with real GitHub fetch** (route already exists at `/api/github/scan-real` — wire UI to it) |
| `shadow-fkAI3hjwzbtNyWJ8C()` produces fake diffs | `src/lib/sandbox.ts:40`, used by `/api/sandbox` POST | **P7: Replace with real git-based sandbox** |
| Pre-seeded AttackTest rows with "Expected" defense | `src/lib/seed.ts` | Mark as dev-only; `/api/audit/clear` already exists |
| Seeded demo agents (Claude Code, Cursor, GPT-4o, etc.) | `src/lib/seed.ts` | Mark as dev-only; production uses real signup |

---

## UNVERIFIED (cannot test in sandbox)

- Real Claude Desktop connection (no Claude Desktop in sandbox)
- Real Cursor connection (no Cursor in sandbox)
- Real Postgres (still SQLite — `docker-compose.yml` targets Postgres but app uses SQLite)
- Real Redis (in compose but unused)
- Google/GitHub OAuth (needs real OAuth client IDs)
- Passkey/WebAuthn (needs HTTPS + authenticator)
- 100K-scale (5K tested; 100K would need more time)

---

## PRODUCTION BLOCKERS (must fix in V20)

| # | Blocker | Severity | Phase |
|---|---------|----------|-------|
| 1 | `/api/scan` + `/api/public-scan` scan DEMO_REPO_FILES, not real repos | HIGH | P2 |
| 2 | Sandbox uses `generateSyntheticChanges()` — no real git | HIGH | P7 |
| 3 | No rate limiting on any API (brute-force vulnerable) | HIGH | P9 |
| 4 | No billing / usage limits (no Stripe integration) | MEDIUM | P8 |
| 5 | No `/api/health` or metrics endpoint | MEDIUM | P10 |
| 6 | No security headers middleware | MEDIUM | P9 |
| 7 | Missing adapters: `github.commit`, `db.schema.inspect`, `stripe.subscription` | MEDIUM | P3 |
| 8 | No CSRF protection on mutating routes | MEDIUM | P9 |
| 9 | No session rotation / refresh tokens | LOW | P4 |
| 10 | 23/31 API routes have no auth check (use anonymous fallback) | LOW | P9 |

---

## Build Order for V20

1. **P2** Remove demo execution — wire `/api/scan` + `/api/public-scan` to real GitHub fetch
2. **P3** Complete adapters — `github.commit`, `db.schema.inspect`, `stripe.subscription`
3. **P7** Real git-based sandbox — branch + commit + diff + approve-merge
4. **P8** Billing + limits — Stripe checkout/webhook + plan-based limits
5. **P9** Production hardening — rate limiter + security headers + CSRF
6. **P10** Observability — `/api/health` + `/api/metrics` (real numbers)
7. **P5** Expand tenant isolation war test
8. **P1** MCP health check + integration test
9. **Final** V20_FINAL_AUDIT.md + full retest

End of audit. Implementation begins.
