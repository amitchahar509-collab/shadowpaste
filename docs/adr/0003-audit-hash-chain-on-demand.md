# ADR 0003 — Audit integrity via an on-demand hash chain

* Status: Accepted
* Date: 2026-07-30

## Context

`AuditLog` had no update or delete path in application code, making it append-only
*by convention*. Convention is not evidence: anyone with database credentials
could edit or remove a row, and a compliance reviewer had no way to demonstrate
otherwise.

## Decision

Compute a chain **on demand** rather than storing a hash column:

```
H(0) = sha256("shadowpaste-audit-genesis")
H(n) = sha256( H(n-1) || canonical(row_n) )
```

Ordered by `(createdAt, id)` for a deterministic total order. Exposed via
`GET /api/v1/audit/verify` and `POST` for anchor generation.

## Consequences

**Positive.** No schema migration. Detects edits, deletions and re-ordering, and
the first divergent row localises the tampering. Cannot itself be defeated by
editing a stored hash column, because there isn't one.

**Negative, and important.** An attacker who can rewrite the *whole* table can
recompute a consistent chain. The chain proves integrity **relative to an external
anchor** only. `anchorHead()` therefore returns the anchor for the caller to store
outside the database (WORM storage, signed tag, compliance vault) and explicitly
refuses to write it back into the database it protects. Append-only tampering
(fabricated rows at the tail) is likewise undetectable without an anchor.

This limit is documented in the module header, the API response guidance, and the
runbook — rather than left for an auditor to discover.

**Cost.** Verification is O(rows) and paged; the endpoint uses the strict `scan`
rate-limit preset so it cannot be used as a CPU amplifier.
