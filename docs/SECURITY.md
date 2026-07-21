# Security Guide

Security posture, threat model, and the production hardening checklist. To
**report** a vulnerability, see [/SECURITY.md](../SECURITY.md).

## Security architecture

### Zero-trust MCP gateway
Every AI tool call traverses one pipeline:

```
Agent → MCP endpoint → identity → risk scoring → policy → credential injection → tool adapter → audit
```

No tool executes without identity verification, a policy allow, and an audit
record. Destructive DB ops (DROP/TRUNCATE/unscoped DELETE) are hard-denied.

### Encryption
- **Vault secrets** — AES-GCM-256 at rest (WebCrypto).
- **Capability tokens** — HMAC-SHA256, session-bound, single-use, time-limited.
- **Passwords** — scrypt + a server-side pepper (`AUTH_PEPPER`).
- **Audit logs** — secrets redacted before persistence.

### Authentication & sessions
- Session tokens are random 256-bit values; only their HMAC is stored.
- Cookies are `httpOnly`, `sameSite=lax`, and `Secure` in production.
- `AUTH_PEPPER` keys both password hashes and the session HMAC. In production
  the app rejects unset and well-known placeholder values.

### Multi-tenancy
Every org-scoped query filters by `orgId`. Agent status changes, vault
delete, permission grants, sandbox approval, scans, and MCP calls all verify the
resource belongs to the caller's org.

### Filesystem confinement
Caller-supplied paths from the HTTP API are resolved (symlinks included) and
must fall inside `SHADOWPASTE_PROJECT_ROOTS`; workspace listing/deletion is
confined to `.workspaces/`; the tool sandbox is confined to `.workspace/` and
`.sandbox/`. Sandbox git operations shell out via argument arrays (no shell
string interpolation).

## Threat model

| Threat | Mitigation |
|--------|------------|
| Secret exposure to AI | Secrets vaulted + replaced with dead fakes before AI sees the workspace |
| Stolen/replayed agent token | Agents can be revoked/quarantined; capability tokens are single-use + expiring |
| Cross-tenant access | Every query is `orgId`-scoped; verified by `attack-tenant-isolation` |
| Prompt injection | Detector flags injected input; policy blocks escalation |
| Path traversal / arbitrary file write | Path confinement on all caller-supplied paths |
| Command injection (sandbox) | `execFileSync` with argument arrays, path confinement |
| Billing bypass | Stripe webhook signature verification; server-side plan limits |
| Brute force | Rate limiting on auth (10/15min) and other endpoints |

## Rate limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` + `/api/auth/signup` | 10 | 15 min |
| `/api/mcp/call` | 60 | 1 min |
| `/api/scan` + `/api/workspace/*` | 5 | 1 min |
| `/api/vault/*` | 20 | 1 min |
| other API | 100 | 1 min |

Exceeding a limit returns HTTP 429 with a `Retry-After` header.

## Security headers (`src/middleware.ts`)
`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (camera/mic/geolocation off).

## Production hardening checklist
- [ ] `AUTH_PEPPER` set to a unique `openssl rand -hex 32` value (in a secrets manager)
- [ ] `NODE_ENV=production`
- [ ] Served over HTTPS (so `Secure` cookies + HSTS apply) — see `Caddyfile`
- [ ] PostgreSQL `DATABASE_URL`; Prisma datasource switched to `postgresql`
- [ ] `SHADOWPASTE_PROJECT_ROOTS` restricted to intended directories
- [ ] `STRIPE_WEBHOOK_SECRET` set if billing is enabled
- [ ] `SEED_TOKEN` set (or seeding left disabled)
- [ ] Database backups scheduled (`pg_dump`)
- [ ] Audit logs exported/retained per policy

## Verified security tests

| Test | Result | Source |
|------|--------|--------|
| Prompt injection (50 payloads) | 50/50 blocked | `tests/attack-prompt-injection.ts` |
| Tenant isolation (10 checks) | 10/10 | `tests/attack-tenant-isolation.ts` |
| Stolen/revoked token (6 checks) | 6/6 | `tests/attack-stolen-token.ts` |
| Rate limiting | 429 after limit | `tests/attack-rate-limit.ts` |
| Billing limit enforcement | blocked at plan cap | `tests/attack-billing-bypass.ts` |
| Real scanner (success + failure paths) | 4/4 | `tests/test-real-scanner.ts` |
| Secret detection (1,000-file corpus) | 0 false negatives | `tests/load-secret-detector.ts` |

## Operational notes
- **Incident — token theft:** `PATCH /api/agents/[id] { status: "revoked" }`
  blocks all future calls immediately.
- **Secret rotation:** delete + re-add the vault entry (old ciphertext discarded).
- **Vault keys** are process-bound; document key escrow for enterprise recovery.

## Known limitations (need a real deployment to verify)
Real PostgreSQL + Redis wiring, OAuth/passkey flows, and large-scale
(100K-request) load are configured but not exercised in the sandbox.
