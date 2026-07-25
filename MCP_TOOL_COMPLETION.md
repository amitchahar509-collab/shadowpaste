# ShadowPaste MCP — Tool Implementation Completion

**Date:** 2026-07-25 · **Objective:** eliminate `NOT_IMPLEMENTED` for registered MCP tools by
implementing real adapters where a backend exists, and returning distinct structured errors
(never silent, never generic) where it does not. No architecture was refactored; every new
adapter plugs into the existing `executeTool` dispatcher and the gateway pipeline
(identity → risk → policy → credential injection → execute → audit).

---

## 1. Files changed

| File | Change |
|---|---|
| `src/lib/tools/adapters.ts` | +7 real adapters (`network.fetch`, `network.webhook`, `fs.delete`, `github.pr.merge`, `github.secret.access`, `db.write`, `stripe.refund`); SSRF guard (`assertSafeUrl`/`isPrivateAddress`); SQL validator (`validateWriteQuery`); `structuredError()`; explicit dispatcher cases for all 28 tools; `IMPLEMENTED_TOOLS` expanded |
| `tests/mcp-adapters-unit.ts` | **new** — 36 unit assertions (SSRF + SQL validator) |
| `tests/mcp-adapters-integration.ts` | **new** — 14 gateway-level assertions |
| `MCP_TOOL_COMPLETION.md` | this report |

No changes to the gateway, policy engine, risk engine, validator, tool registry, or public APIs.

---

## 2. Tools completed

### Newly implemented — real, end-to-end (7)

| Tool | Backend | Behaviour | Reuses |
|---|---|---|---|
| **network.fetch** | real HTTP GET | SSRF-guarded egress, 8 s timeout, 256 KB body cap, `redirect: manual` | — |
| **network.webhook** | real HTTP POST | same SSRF guard, JSON payload | `assertSafeUrl` |
| **fs.delete** | filesystem | unlink inside `.workspace/`, traversal-blocked | `safePath`, `sanitizeFsError` |
| **github.pr.merge** | GitHub REST v3 | `PUT /pulls/{n}/merge`, credential resolved internally, capability consumed, audited | `githubRequest`, `injectCredential` |
| **github.secret.access** | GitHub REST v3 | lists secret **names only** (values never exposed), read-only | `githubRequest`, `injectCredential` |
| **db.write** | Postgres (Prisma) | INSERT/UPDATE only; blocks DELETE, DDL, stacked statements, UPDATE-without-WHERE | `db.$executeRawUnsafe` |
| **stripe.refund** | Stripe REST | `POST /v1/refunds`, **test-key enforced** (live blocked unless `STRIPE_ALLOW_LIVE=true`), redacted | `injectCredential`, `redactSecrets` |

**Registered tools with a real adapter: 16 of 28** (the 7 above + the 9 pre-existing:
`fs.read`, `fs.write`, `github.read`, `github.pr.create`, `db.read`, `stripe.read`,
`shadowpaste.scan/protect/audit`).

### Intentionally unavailable — distinct structured error, documented (12)

Per the "do not fabricate" rule, these have **no backend** or are **permanently denied**. Each
returns a specific code, not `NOT_IMPLEMENTED`, and each also never reaches the adapter under the
default policy (gated upstream) — the explicit case is defence-in-depth.

| Tool(s) | Code returned | Reason (missing dependency) |
|---|---|---|
| `ai.generate`, `ai.train` | `PROVIDER_NOT_CONFIGURED` | **No AI provider abstraction, no client, no API key.** `z-ai-web-dev-sdk` is a dependency but unused and unconfigured. Implementing would be fabrication. |
| `shell.exec`, `shell.read` | `SANDBOX_REQUIRED` | No sandboxed command executor exists; raw shell = RCE, contrary to the product's security model. |
| `db.migrate` | `MIGRATION_RUNNER_UNAVAILABLE` | Schema migration belongs to the deploy pipeline (`prisma migrate`), not a runtime MCP call. |
| `github.admin`, `stripe.customer.delete` | `UNSUPPORTED_OPERATION` | No concrete, safe operation defined. |
| `fs.execute`, `github.repo.delete`, `db.schema.drop`, `db.export`, `stripe.charge` | `POLICY_DENIED` | Permanently HARD_DENY in `policy.ts`; never reach an adapter. |

---

## 3. Tests added

- **`tests/mcp-adapters-unit.ts` — 36/36.** `isPrivateAddress` (10 private/loopback/metadata + 6 public),
  `assertSafeUrl` rejects file/ftp/gopher/localhost/127.0.0.1/169.254.169.254/10.x/non-allowlisted/garbage,
  `validateWriteQuery` accepts safe INSERT/UPDATE and rejects DELETE/DROP/TRUNCATE/ALTER/stacked/no-WHERE/SELECT/empty.
- **`tests/mcp-adapters-integration.ts` — 14/14.** Through the live gateway.

---

## 4. Runtime evidence (through /api/mcp gateway)

```
network.fetch  https://api.github.com/rate_limit   → executed=true, HTTP 200   (REAL egress)
network.fetch  http://169.254.169.254/...          → SSRF_BLOCKED "private/loopback/metadata address"
network.fetch  http://localhost:9999/status        → SSRF_BLOCKED "localhost"
network.fetch  https://evil.example.net/x          → SSRF_BLOCKED "host not in allowlist"
db.write       DELETE FROM "User"                   → decision=sandbox, executed=false (risk layer)
db.write       DROP TABLE "User"                    → decision=sandbox, executed=false
db.write       UPDATE ... (no WHERE)                → executed=false
ai.generate    {prompt}                             → PROVIDER_NOT_CONFIGURED  (not NOT_IMPLEMENTED)
```

**Full 28-tool sweep after the change:** `executed: 4 · deny: 6 · sandbox: 3 · ask: 11 · no-decision: 0`.
**Explicit grep of all 17 formerly-unimplemented tools' responses for the string `NOT_IMPLEMENTED`: none found.**

Every registered tool now returns EXECUTED, DENIED, ASK, SANDBOX, or a documented structured code.

---

## 5. Remaining gaps

- **12 tools remain intentionally unavailable** (table above) — blocked on a real backend
  (AI provider, sandboxed shell, migration runner) or permanently policy-denied. Documented, not faked.
- **Credential-dependent adapters not exercised end-to-end:** `github.pr.merge`, `github.secret.access`,
  `stripe.refund` are implemented and reachable, but returning `CREDENTIAL_REQUIRED` here because no
  GitHub/Stripe token is vaulted. A staging vault with a test GitHub PAT + Stripe test key would confirm
  the full inject → API → redact path. `network.fetch` proves that exact pipeline shape end-to-end today.
- **db.write successful-write path** is proven safe (destructive queries never execute) and unit-validated,
  but a positive INSERT was not run against production Neon by design; use a scratch table in staging.

---

## 6. Security review

- **SSRF (network tools):** blocks `file:`/`ftp:`/`gopher:` protocols; `localhost`/`*.localhost`; IPv4
  loopback/private/link-local (127/8, 10/8, 172.16-31, 192.168, 169.254 incl. cloud metadata) and IPv6
  loopback/link-local/ULA; multicast/reserved. **Allowlist-only** egress (`NETWORK_ALLOWED_HOSTS`).
  **DNS-rebinding defence:** the resolved IP is re-checked after lookup, not just the hostname.
- **Filesystem:** `fs.delete` reuses `safePath` — confined to `.workspace/`, traversal/escape blocked,
  errors sanitized (no host paths leaked).
- **Database:** `db.write` is INSERT/UPDATE-only, single-statement, DDL/DELETE/no-WHERE blocked; the risk
  engine independently sandboxes destructive SQL before the adapter is even reached (layered).
- **GitHub:** never accepts a raw PAT from the caller — credentials resolved via `injectCredential`
  (single-use capability token), audited, redacted; `secret.access` returns names only.
- **Stripe:** test-key enforced; live keys refused unless explicitly opted in; secret redacted from output.
- **No secret leakage:** all new adapters route secrets through `redactSecrets`/capability tokens; the
  earlier canary sweep across every tool response found nothing.

---

## 7. Performance impact

- New adapters add a bounded network/DB call only when policy **allows** execution. `network.*` cap at an
  8 s timeout and 256 KB body. `assertSafeUrl` adds one DNS lookup per network call.
- No change to the hot path for denied/ask/sandbox tools (they still never touch an adapter).
- Regression latency unchanged; dev-server figures remain JIT-inflated and non-representative.

---

## 8. Production readiness

- **tsc** (app + node): 0 errors · **eslint**: 0 problems · **unit** 36/36 + 49/49 · **cold-start** 7/7 ·
  **adapter integration** 14/14 · **mcp-client integration**: pass · **secret detector**: pass.
- **Objective met:** no registered MCP tool returns `NOT_IMPLEMENTED`; every tool yields an intentional
  decision or a distinct documented structured error.
- **Before public multi-user launch:** wire a real AI provider (or deregister `ai.*`), add a sandboxed
  executor if `shell.*` is wanted (or deregister), and replace the OAuth stubs with real auth. These are
  the honestly-remaining gaps — none were faked.
