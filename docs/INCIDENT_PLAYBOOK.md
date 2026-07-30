# ShadowPaste — Incident Response Playbook

## Severity

| Sev | Definition | Example |
|---|---|---|
| **1** | Credential exposure or cross-tenant data access | Secret returned to an agent; one org reading another's rows |
| **2** | Security control bypassed, no confirmed exposure | SSRF guard evaded; a policy hard-deny not firing |
| **3** | Degraded control | Rate limiting per-instance instead of global |
| **4** | Operational | Elevated latency, single failed job |

## P1 — Suspected credential exposure

1. **Contain.** Revoke the agent: `PATCH /api/agents/<id> {"status":"revoked"}`.
   The gateway blocks every call from a revoked agent before policy evaluation.
2. **Scope it.** Pull the audit trail and traces for the correlation ID:
   ```bash
   curl -s -H "Authorization: Bearer <t>" "https://<host>/api/audit-logs?limit=500" \
     | jq '[.logs[] | select(.metadata.secretsRedacted > 0)]'
   ```
   `secretsRedacted > 0` marks calls where output contained credentials.
3. **Rotate** the affected provider credential at the provider. ShadowPaste's vault
   copy is not the only copy.
4. **Verify audit integrity** (`/api/v1/audit/verify`) before quoting the trail as
   evidence — establish it wasn't edited.
5. **Preserve.** Snapshot with `scripts/backup.mjs backup` and store the
   `auditChainHead` externally.

## P1 — Suspected cross-tenant access

Two paths have produced this class of bug historically; check both:

1. `db.read` — confirm `assertNoDeniedTable` blocks the query shape:
   ```bash
   # Should return SQL_FORBIDDEN_TABLE
   curl -s -X POST -H "Authorization: Bearer <t>" -H 'content-type: application/json' \
     -d '{"agentId":"<id>","toolName":"db.read","input":{"query":"SELECT * FROM \"User\""}}' \
     https://<host>/api/mcp/call | jq '.output.code'
   ```
2. Any route using `getContext(req) || anonymousContext()`. That pattern resolves
   to org `default` for unauthenticated callers and has caused two disclosures
   (`/api/audit-logs`, `/api/agents/[id]`). Grep for it before closing the incident:
   ```bash
   grep -rn "anonymousContext()" src/app/api/
   ```

## P2 — Control bypass

1. Reproduce with the narrowest possible input; save it as a test **before** fixing.
2. Ask whether the control is the right *shape*, not just whether the pattern needs
   widening. ADR 0002 exists because a regex patch would have invited the next
   evasion.
3. Land the regression test in `tests/unit/` so the coverage gate protects it.

## P3 — Rate limiting ineffective

Symptom: floods are not rejected.

```bash
curl -s https://<host>/api/health | jq '.checks[] | select(.name=="rate-limiter")'
```

* `in-memory` → expected on serverless; set Upstash vars.
* `CONFIGURED BUT UNREACHABLE` → wrong URL form (must be the `https` REST endpoint)
  or bad token. The limiter **fails open to per-instance memory**, so requests keep
  succeeding — absence of 429s is not proof the limiter works.

## Post-incident

* Add a regression test. An incident without one will recur.
* Record an ADR if the *approach* changed, not just the code.
* Update the "Known operational gaps" list in `docs/RUNBOOK.md` if a gap caused or
  prolonged the incident.
