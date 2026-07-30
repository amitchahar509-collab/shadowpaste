# ADR 0002 — Presence-based table denial for `db.read`, not SQL parsing

* Status: Accepted
* Date: 2026-07-30

## Context

`db.read` is `riskScore` 20 / `low` and sits on the policy auto-allow list, so it
executes with no human approval. Its original guard was "starts with SELECT" and
"no DROP/TRUNCATE", which let an auto-approved agent read the entire database —
including `User.passwordHash`, every `Organization` row (cross-tenant), and
`OAuthToken` hashes.

The first remediation added an allowlist enforced by extracting identifiers that
follow `FROM`/`JOIN`. Independent re-verification defeated it in one attempt:

```sql
SELECT u.email FROM "Agent", "User" u   -- parser saw ["agent"] -> ALLOWED
```

A comma-separated join is not preceded by `FROM` or `JOIN`, so the table was never
seen. This returned real user email addresses.

## Decision

Make **presence-based denial** the primary control (`assertNoDeniedTable`): reject
any query in which a non-allowlisted model name appears as a word, outside string
literals and comments. Keep the position parser as defence in depth only.

## Consequences

**Positive.** To read a table its name must appear in the statement, so the
control does not depend on recognising SQL *structure*. Comma joins, `CROSS JOIN`,
`LATERAL`, `ONLY`, schema qualification and subqueries are all covered by the same
rule — verified: 12/12 evasions blocked.

**Negative.** Coarser than a real parser. A query mentioning a denied table name
in a harmless position (e.g. a column alias literally named `user`) is rejected.
We accept false rejections over false acceptances here, because the tool is
auto-approved and the downside is asymmetric.

Word boundaries preserve legitimate access: `"sessionId"` does not match
`\bsession\b`.

**Lesson recorded.** Position-based parsing is the wrong shape for a security
control — there is always another syntax. Patching the regex would have invited
the next variant.
