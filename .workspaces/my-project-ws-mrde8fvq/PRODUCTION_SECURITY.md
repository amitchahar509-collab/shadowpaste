# ShadowPaste V20 — Production Security Guide

> Security posture, hardening measures, and operational runbook for production deployment.

## Security Architecture

### Zero-Trust MCP Gateway
Every AI agent tool call traverses:
```
Agent → MCP Server → Risk Engine → Policy Engine → Credential Injection → Tool Adapter → Audit
```
No tool executes without: agent identity verification, permission check, risk scoring, and audit recording.

### Encryption
- **Vault secrets**: AES-GCM-256 at rest (WebCrypto, process-bound key)
- **Capability tokens**: HMAC-SHA256 signed, session-bound, single-use, time-limited (5min default)
- **Passwords**: scrypt + server-side pepper (210K iterations)
- **Audit logs**: secrets auto-redacted before persistence

### Multi-Tenancy
- Every org-scoped query filters by `orgId` (tenant isolation)
- Agent creation, vault access, MCP calls all verify `agent.orgId === ctx.orgId`
- Verified: 10/10 cross-tenant attack tests pass

## Hardening Measures (V20)

### Rate Limiting
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` + `/api/auth/signup` | 10 | 15 min |
| `/api/mcp/call` | 60 | 1 min |
| `/api/scan` + `/api/github/scan-real` | 5 | 1 min |
| `/api/vault/*` | 20 | 1 min |
| All other API | 100 | 1 min |

Returns HTTP 429 with `Retry-After` header when exceeded.

### Security Headers (middleware.ts)
- `Content-Security-Policy`: restricts script/style/img/font/connect-src; blocks frame-ancestors
- `shadow-GbewePTMbk3j7rR976`: max-age 1 year + subdomains
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: shadow-77kWpYzJPgvduqhQHnorigin`
- `Permissions-Policy`: camera/microphone/geolocation disabled

### Cookies
- `httpOnly: true` (no JS access)
- `secure: true` in production (HTTPS only)
- `sameSite: "lax"` (CSRF mitigation)
- Session tokens HMAC-signed with server pepper

### Billing Limits (enforced on creation)
- Agent creation: checks `org.plan.limits.agents` → HTTP 402 if exceeded
- Vault, scans, MCP calls: usage tracked; limits checked via `/api/billing/usage`
- Plans: FREE (3 agents), PRO (25), TEAM (100), ENTERPRISE (1000)

### Input Validation
- All API routes validate required fields (return 400 on missing)
- DB adapter blocks: DROP, TRUNCATE, DELETE without WHERE
- Filesystem adapter: path-escape prevention (confines to `.workspace/`)
- Prompt-injection detector: 100% catch on 50 payloads (5 categories)

## Operational Runbook

### Secrets Management
1. Store secrets via `/api/vault` POST (auto-encrypts, auto-detects provider)
2. Never pass raw secrets to AI agents — capability tokens are injected transparently
3. Rotate by deleting + re-adding (old entry cryptographically erased)
4. Audit all vault access via Audit Trail module

### Incident Response
1. **Suspected token theft**: revoke agent (`PATCH /api/agents/[id] { status: "revoked" }`) — blocks all future calls immediately
2. **Prompt injection detected**: flight recorder shows `inputFlags`; quarantine agent
3. **Cross-tenant access attempt**: audit trail logs the attempt; tenant isolation prevents data leakage
4. **Rate-limit attack**: 429 responses auto-throttle; monitor `/api/metrics` for spike

### Backup Strategy
- **Database**: SQLite file at `db/custom.db` — copy on schedule (or use Postgres in production with `pg_dump`)
- **Vault keys**: process-bound; if lost, vaulted secrets are unrecoverable (by design — zero-trust). Document key escrow for enterprise.
- **Audit logs**: never deleted (compliance requirement); export CSV via Audit Trail module

### Encryption Rotation
- Vault key rotation: decrypt all entries with old key, re-encrypt with new key (runbook script needed — UNVERIFIED)
- Capability tokens: auto-expire (5min); no rotation needed
- Password pepper rotation: requires password reset for all users

## Verified Security Tests (V20)

| Test | Result | Method |
|------|--------|--------|
| Prompt injection (50 payloads) | 100% blocked | `tests/attack-prompt-injection.ts` |
| Tenant isolation (10 checks) | 10/10 pass | `tests/attack-tenant-isolation.ts` |
| Stolen/revoked token (6 checks) | 6/6 pass | `tests/attack-stolen-token.ts` |
| Rate limiting | 429 after limit | `tests/attack-rate-limit.ts` (V20) |
| Destructive query (DROP/DELETE) | blocked | DB adapter |
| Path escape | blocked | FS adapter |
| Secret redaction in audit | verified | Gateway redacts before persistence |

## UNVERIFIED (needs production environment)
- Real Postgres connection (still SQLite)
- Real Redis session cache
- Google/GitHub OAuth (needs client IDs)
- Passkey/WebAuthn (needs HTTPS + authenticator)
- 100K-scale load (5K tested)
- Vault key rotation script
- Fresh-clone deploy test
