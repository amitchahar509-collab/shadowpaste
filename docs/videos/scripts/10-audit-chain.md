# 10 — Tamper-evident audit chain

**Length** 60s · **Audience** security engineers, compliance
**Playlists** Security, Enterprise
**Goal** Viewer understands the difference between an audit log you trust and one
you can verify, and sees a tampered row get caught.

Facts used: FACTS.md → Crypto and identity (audit chain).

---

## Narration

> Most audit logs are a table you are asked to trust. If someone with database
> access edits a row, nothing about the table tells you.
>
> ShadowPaste chains them. Each row's hash commits to the previous row's hash and
> to that row's own canonical contents, so every entry depends on every entry
> before it.
>
> Verify the chain, and it recomputes from the beginning and compares.
>
> Two hundred and forty rows, chain intact.
>
> Now edit one row directly in the database — change a decision from blocked to
> allowed, the exact thing an attacker would want to hide.
>
> Verify again.
>
> Four-oh-nine. The recomputed head does not match the anchor, and it names the
> row where the chain broke.
>
> This does not prevent tampering. Someone with write access to the table can
> still change it. What it means is that they cannot change it *quietly* — and
> for an audit trail, detectable is the property that matters.
>
> Divergence is also the highest-severity alert this system produces, with a
> sixty-second cooldown rather than the usual five minutes, because there is no
> version of this event that should wait.

**Word count** ~185 → ~1m 10s. Trim the alert clause if over 60s.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:02 | Intro | |
| 0:02–0:12 | Diagram | Three rows, each with an arrow from the previous hash into the next. Formula on screen: `H(n) = sha256(H(n-1) ‖ canonical(row_n))` |
| 0:12–0:24 | Terminal | `GET /api/v1/audit/verify` → 200, `ok: true`, `rowsVerified` visible |
| 0:24–0:36 | SQL client | A direct `UPDATE` on one audit row, changing `blocked` to `allowed`. Show the row before and after. |
| 0:36–0:50 | Terminal | Verify again → **409**, `anchorMismatch` with expected vs actual. Hold. |
| 0:50–0:57 | Card, amber | "This does not prevent tampering. It makes tampering detectable." |
| 0:57–1:00 | Outro | |

**Camera** Static. **Transitions** Cut. The SQL edit is the dramatic moment and
needs no help — do not add music stings.

---

## Reproduce this take

```bash
curl -s "http://localhost:3000/api/v1/audit/verify" -H "Cookie: sp_session=<session>"
```

Then, in a SQL client against the same database, modify one `AuditLog` row's
metadata, and re-run the same call.

Expected: 200 with `"ok": true` first; 409 with an `anchorMismatch` after.

Use a scratch database. Do not demonstrate this against a database whose audit
trail matters — the point of the feature is that the edit is permanent evidence.

---

## CTA

> `GET /api/v1/audit/verify` is authenticated and org-scoped, so the chain it
> checks is your own. `docs/RUNBOOK.md` covers anchoring and incident response.
