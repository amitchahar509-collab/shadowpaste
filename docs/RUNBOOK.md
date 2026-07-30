# ShadowPaste — Operations Runbook

Every command here has been executed against a running instance. Where something
is unverified or requires infrastructure we do not have, it says so.

## 1. Health and posture

```bash
curl -s https://<host>/api/health | jq
```

Checks returned: `database`, `vault`, `mcp`, `github-api`, `rate-limiter`,
`tracing`, `logging`.

**Read the `detail` fields, not just `ok`.** Two are deliberately honest about
degraded-but-working states:

| Detail | Meaning | Action |
|---|---|---|
| `rate-limiter: in-memory (best-effort, per-instance)` | Limits are **per instance** and reset on cold start | Set `UPSTASH_REDIS_REST_URL`/`_TOKEN` |
| `rate-limiter: CONFIGURED BUT UNREACHABLE` | Redis env vars set but failing; silently fell back to memory | Check the REST URL is the `https` endpoint, not `redis://` |
| `tracing: in-process buffer only` | Spans buffered, **not exported** | Set `OTEL_EXPORTER_OTLP_ENDPOINT` |

`GET /api/v1/version` returns the same posture without authentication.

## 2. Tracing an incident from a user report

The user can read `X-Correlation-Id` off any response. Every log line, span and
audit row carries it.

```bash
# Reproduce and capture identity
curl -sD - -o /dev/null https://<host>/api/mcp | grep -i 'x-correlation-id\|x-trace-id'

# Spans for that trace (needs audit.export)
curl -s -H "Authorization: Bearer <token>" \
  "https://<host>/api/v1/traces?traceId=<traceId>" | jq '.spans[] | {name,status,durationMs,attributes}'
```

To continue a trace from your own tooling, send a `traceparent` header — it is
honoured, not replaced.

## 3. Rate limiting

Presets in `src/lib/rate-limit.ts`: `auth` (10 **failed** logins / 15 min),
`signup` (20/hr), `mcp` (60/min), `scan` (5/min), `vault` (20/min),
`publicRead` (120/min), `global` (600/min backstop in `proxy.ts`).

Successful logins do **not** consume the brute-force budget — only failures do.

## 4. Backup, restore, DR

```bash
# Backup (works anywhere the app runs; no pg_dump needed)
node scripts/backup.mjs backup --out ./backups

# Verify integrity + audit-chain head — run this on EVERY backup
node scripts/backup.mjs verify --file ./backups/<file>.json

# Restore into a NEW database (never defaults to DATABASE_URL)
node scripts/backup.mjs restore --file ./backups/<file>.json \
  --target-url "postgresql://.../restore_test"
```

`restore` refuses a non-empty target and refuses `DATABASE_URL` without
`--confirm`. Verified: editing one audit row makes `verify` exit 1 with
`INTEGRITY FAILED` while row count still matches.

**Restore drill (quarterly):** back up → restore to a scratch database → run
`bun run tests/unit/` against it → compare `auditChainHead`.

## 5. Audit integrity / compliance evidence

```bash
# Recompute the chain for your org
curl -s -H "Authorization: Bearer <token>" https://<host>/api/v1/audit/verify | jq

# Generate an anchor to store EXTERNALLY
curl -s -X POST -H "Authorization: Bearer <token>" https://<host>/api/v1/audit/verify | jq .anchor

# Later: prove nothing changed
curl -s -H "Authorization: Bearer <token>" \
  "https://<host>/api/v1/audit/verify?expectedHead=<stored hash>" | jq
```

Mismatch returns **HTTP 409** and writes an audit row at riskScore 95.

> **The anchor must live outside this database.** An anchor stored in the database
> it protects proves nothing against a full rewrite. See ADR 0003.

## 6. Key and secret rotation

* **Vault data key** (`VAULT_KEY`): entries are re-wrapped on `secret.rotate`.
  Rotate the env var only with a re-encryption pass — changing it alone makes
  existing ciphertext undecryptable.
* **`AUTH_PEPPER`**: rotating invalidates all existing password hashes. Requires a
  forced reset cycle. Do not rotate casually.
* **OAuth client secrets**: only the SHA-256 hash is stored; re-register the client
  to rotate. Refresh tokens rotate on every use with family revocation (RFC 9700).
* **Certificates**: terminated by the platform (Vercel/ingress), not the app.

## 7. Known operational gaps

Not implemented — do not assume these exist:

* No alert routing (no PagerDuty/Slack integration). `/api/health` and
  `/api/metrics` are pull-only; wire your own probe.
* No automated backup schedule. `scripts/backup.mjs` must be driven by cron/a job.
* Single region. No multi-region failover.
* No browser E2E suite.

## 8. Alerting

Alerts are recorded regardless of configuration; **delivery** requires an adapter.

```bash
# Is anyone actually being notified?
curl -s https://<host>/api/health | jq '.checks[] | select(.name=="alerting")'
```

`NO delivery adapter configured` means alerts are recorded and **nobody is paged**.

| Variable | Effect |
|---|---|
| `ALERT_WEBHOOK_URL` | Generic JSON webhook (HMAC-signed when `ALERT_WEBHOOK_SECRET` is set) |
| `ALERT_WEBHOOK_SECRET` | Enables `x-shadowpaste-signature: v1=<hmac>` over `<timestamp>.<payload>` |
| `ALERT_SLACK_WEBHOOK_URL` | Slack incoming webhook |
| `ALERT_TEAMS_WEBHOOK_URL` | Teams MessageCard webhook |
| `ALERT_MIN_SEVERITY` | `info` \| `warning` (default) \| `critical` |

**Email is NOT implemented** — it needs an SMTP relay or provider account. The
adapter reports itself unconfigured rather than silently succeeding. Implement
`EmailAdapter.send()` against your provider to enable it.

### Rules (all bound to signals this system actually emits)

| Rule | Severity | Threshold | Cooldown |
|---|---|---|---|
| `security.ssrf_blocked` | warning | 3 | 300s |
| `security.path_escape` | critical | 1 | 300s |
| `security.forbidden_table` | critical | 1 | 300s |
| `security.secrets_in_output` | warning | 5 | 600s |
| `compliance.audit_chain_divergence` | critical | 1 | 60s |
| `ops.rate_limiter_degraded` | warning | 1 | 900s |
| `ops.health_degraded` | critical | 1 | 300s |
| `security.auth_probe_burst` | warning | 10 | 900s |

Deduplication is per `(rule, agent)`. Verified: 5,000 SSRF trips produce **one**
notification carrying an occurrence count, with 4,999 suppressed. An attacker
controls how often they trip a control and therefore page volume — the cooldown
is what stops that becoming a denial-of-attention attack.

### Incident timeline

```bash
curl -s -H "Authorization: Bearer <token>" \
  "https://<host>/api/v1/alerts?severity=critical&limit=50" | jq '.alerts[] | {firedAt,rule,occurrences,correlationId,deliveries}'
```

Every alert carries the `correlationId` and `traceId` of the request that caused
it, so §2 (tracing an incident) works directly from an alert.

### Verifying a received webhook

```
signature = HMAC-SHA256(ALERT_WEBHOOK_SECRET, "<x-shadowpaste-timestamp>.<raw body>")
compare against x-shadowpaste-signature, which is "v1=" + hex
```
Compare in constant time and reject timestamps outside your tolerance window.
