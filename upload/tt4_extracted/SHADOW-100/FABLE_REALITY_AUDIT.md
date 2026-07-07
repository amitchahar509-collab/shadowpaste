# FABLE_REALITY_AUDIT.md — ShadowPaste Handover Audit (Phase 0)

**Auditor:** Fable (Opus) acting as Chief Architect + Red Team, on handover from GLM.
**Method:** Read real source, traced wiring by hand. Did **not** trust report files — every
claim below is grounded in a file/line I actually read.
**Date:** 2026-07-07

---

## ⚠️ Environment constraint (read this first)

This audit machine has **no usable runtime**:

- `node` / `npm` — **absent** (only ancient Adobe-bundled `node.exe v8.11.1 / v8.16.0` exist;
  they cannot parse this codebase — it needs Node ≥20 for `node --test`, top-level `await`,
  `globalThis.crypto.subtle`, and `#private` fields).
- `docker` — **absent** from PATH.

**Consequence:** I could **not** independently execute the test suites, the Fastify server,
the Docker stack, or any live provider call. Every runtime claim in this repo — GLM's *and*
mine — is therefore **UNVERIFIED-BY-EXECUTION in this environment**. Where I write `[REAL]`
below, it means *the code is genuinely present and correct on inspection*, not *I ran it*.
This is exactly the state GLM was in too, and — to their credit — their reports say so.

To actually run Phases 1–10, this box needs **Node ≥20 + Docker** installed. See the
"What unblocks execution" section at the end.

---

## REAL
*(present, correct on inspection, and internally consistent — logic is genuinely implemented)*

| Component | File | Notes |
|---|---|---|
| Format-preserving virtualization engine | `packages/engine/index.mjs` | Splices only detected secret spans, copies every other byte verbatim; deterministic overlap resolution (earliest-start, then longest); stable FNV-1a reference ids; idempotent. This is the real product core. |
| Crypto primitives | `packages/crypto/index.mjs` | WebCrypto AES-GCM-256, HMAC-SHA256, PBKDF2 (210k), SHA-256 fingerprint. Non-extractable keys. Ciphertext-only records. Correct use of `subtle.verify` for constant-time-ish HMAC check. |
| Capability-token engine | `packages/capability/index.mjs` | HMAC-signed, canonicalized payload, session-bound, TTL, single-use nonce, usage limit. Verify rejects tamper/expiry/wrong-session/replay/scope-mismatch. |
| Gateway execution core | `packages/gateway/index.mjs` | Vault → firewall → mint/verify capability → decrypt-in-scope → adapter → consume → result-only. Plaintext confined to `#executeAction` local scope; never returned/logged/thrown. Provider errors redacted, not crashed. |
| Provider adapters | `packages/providers/index.mjs` | Real OpenAI / Anthropic / Gemini HTTP shapes; `fetchImpl` injectable; key redacted from any thrown error. |
| Security detectors + classifier + firewall | `packages/security/index.mjs` | Context-aware provider classifier (no weak GENERIC), Shannon entropy gate, categorized InjectionShield, FirewallV2 WHO/WHAT/WHY/RISK. |
| Auth primitives | `packages/auth/index.mjs` | PBKDF2 hash/verify, access/refresh mint/verify/rotate, brute-force lockout. Honestly scoped: header says HTTP/cookie/OAuth/DB layers are **not** here. |
| RBAC policy engine | `packages/rbac/index.mjs` | OWNER/ADMIN/DEVELOPER/VIEWER matrix, `enforce`, `canSetRole` guard. Pure policy — honestly says it is not auth/storage. |
| Encrypted sync (client crypto) | `packages/sync/index.mjs` | Passphrase-derived key, pack/unpack, LWW merge, `bundleLeaks` self-check. |
| AI round-trip orchestrator | `packages/ai/index.mjs` | `roundTrip` protect→send→restore, `referencesSurvived` check, FakeProvider for offline proof. |
| Browser app | `index.html` (~180 KB) | Self-contained: IndexedDB vault, AES-GCM, inline detectors, **working `restorePrompt`** (refs→decrypted secrets), diff view, history ledger, AI preamble injection. Restore is genuinely implemented client-side. |
| MV3 Chrome extension | `apps/extension/*` | Real manifest + content script (intercepts Enter/Send on ChatGPT/Claude/Gemini), self-contained background vault (AES-GCM in `chrome.storage.local`), leak-watch MutationObserver. |
| Test suites (as written) | `tests/*.node.test.mjs` | Genuine `node:test` assertions against real modules — format preservation, classification, red-team (replay/tamper/cross-session/exfil/revoke), SaaS auth/RBAC, 10k torture. **Real tests — but see UNVERIFIED: I could not run them.** |
| Prisma schema | `server/prisma/schema.prisma` | Complete, well-modeled: User/OAuth/Org/TeamMember/Project/SecretVault/AuditLog/ApiKey; ciphertext-only secret columns. |
| Infra files | `Dockerfile`, `docker-compose.yml` | Real, coherent (node:20-alpine, non-root, healthcheck; postgres+redis+api+web). Files themselves are correct. |

---

## PARTIAL
*(exists and works in its own scope, but the end-to-end product claim is not fully wired)*

- **Three divergent, independently-maintained detector implementations.** This is the single
  biggest structural risk and the reports do **not** flag it:
  1. `packages/engine/index.mjs` + `packages/security/index.mjs` (Node path — **the only one the tests cover**),
  2. `index.html` inline detectors (~lines 1238–1355 — **what real users actually run**, untested by the suite),
  3. `apps/extension/background.js` `DETECTORS`/`classify` (a third copy, weaker classifier).
  They will drift. A secret caught by (1) may be missed/mislabeled by (2) or (3). The verified
  test evidence applies to a code path most users never hit.
- **AI round-trip.** `roundTrip` + `restorePrompt` are real, but "survives a *real* AI edit" is
  only proven against `FakeProvider`. No live-model proof (needs an API key + network).
- **Auth / RBAC / Sync.** Primitives and policy are `[REAL]` and tested-in-source, but **none are
  wired into the running server** (see BROKEN). SaaS is "logic exists," not "system runs."
- **Passphrase vault lock.** `VaultStore.fromPassphrase` exists and is tested, but is **opt-in via
  API and not wired into the web UI** (KNOWN_LIMITATIONS admits this). Default vault is origin-bound.
- **PWA.** `sw.js` + `manifest.webmanifest` present; offline behavior not executed here.

---

## FAKE
*(anything pretending production that isn't)*

- **Nothing egregiously fake found.** GLM did not dress stubs up as production. The one place a
  synthetic result is returned — the in-browser `index.html` gateway demo — is **explicitly
  labeled** as non-networked, and the real HTTP path lives in `packages/providers`. `FakeProvider`
  is named honestly as a test double. No `TODO`/`FIXME`/placeholder stubs masquerading as features.
- Caveat: "verified" in the GLM reports means *browser-executed*, not *Node/Docker-executed*.
  That's a softer sense of "verified" than a reader might assume, but the reports state the
  environment limitation plainly, so I classify it as **honest**, not fake.

---

## BROKEN
*(present but does not do what an integrated product needs)*

- **Server is not connected to any database.** `server/server.mjs` imports **no** Prisma and uses a
  process-memory `VaultStore` + an in-array `auditTrail`. `grep` confirms: no `prisma`/`PrismaClient`
  import anywhere in the server. The schema is real but **unused at runtime**; there are **no
  migrations**. "Backend connected to database" = **false**.
- **Server has no authentication and no RBAC.** `server.mjs` imports only crypto/capability/gateway/
  security. There are **no** login/signup routes, **no** auth middleware, **no** RBAC checks. Every
  endpoint (`/vault/request`, `/runtime/execute`, `/capability/*`, `/audit/event`) is reachable by
  anyone who can hit the port — CORS restricts browsers, but not direct HTTP. Phase 4's "every
  protected API must enforce permissions" is **not met by the running server**.
- **No tenant isolation in the server vault.** The vault is a single process-global map and
  `requestSecretUse` never checks that the calling session *owns* a reference — any session that
  learns a reference can use it. Fine for a single-user local runtime; unsafe as multi-tenant SaaS.
- **docker-compose brings up Postgres + Redis that the app never uses.** The `api` service gets
  `DATABASE_URL`/`REDIS_URL` env vars, but `server.mjs` reads neither. The stack would *boot*, but
  the DB/Redis are decorative until the server is wired to them.
- **Extension leak-watcher has a stateful-regex bug (low severity).** `apps/extension/background.js`
  `checkLeak` calls `.test()` on `/g`-flagged regexes shared across many MutationObserver firings;
  `lastIndex` persists between calls, so the leak scan can intermittently start mid-string and miss
  a raw-secret echo. Reset `lastIndex` (or use non-global clones) before each `.test()`.

---

## MISSING
*(not present — would be fabrication to claim)*

- **VS Code / Cursor extension** (Phase 6). Only the MV3 Chrome extension exists; no extension-host code.
- **Extension "restore" path.** The extension virtualizes on send but has **no** RESTORE handler — the
  protect→AI→restore loop in the extension is one-directional (restore only exists in `index.html`).
- **Admin dashboard** (Phase 7): Users/Teams/Orgs/Usage pages — not built.
- **Billing** (Phase 8): Stripe checkout/webhooks/subscriptions — `Plan` enum in schema only.
- **SSO / SCIM / OAuth redirect / WebAuthn ceremony** (Phase 9) — designed in schema, not implemented.
- **Server-side persistent encrypted store, org audit export, multi-user sync API** — not implemented.
- **Root `package.json` / monorepo tooling / lint config.** No root `package.json`; `npm run lint`
  (Phase 1) has nothing to run. Only `server/package.json` exists (start/dev/test scripts).
- **Live-provider proof** — `tests/live-provider.mjs` exists but requires a real key; unrun.

---

## Verdict on the handover

GLM delivered a **genuinely real, well-architected local credential-runtime core** with an honest
paper trail. The protect / detect / capability / gateway / restore machinery is real code, not
theatre. What is *not* real yet is the **SaaS shell around it**: the server is a single-user,
in-memory, unauthenticated runtime, and the database/auth/RBAC/billing layers exist as
tested-in-isolation logic and an un-migrated schema, not a running system.

**Do not rewrite.** The core is worth keeping. The work that remains is *integration and execution*,
not reconstruction.

### What unblocks the rest of the mission (Phases 1–10)
1. Install **Node ≥20** and **Docker Desktop** on this machine (or point me at a box that has them).
   Then I can actually run `npm test`, `docker compose up`, the red-team suite, and the torture test
   instead of marking them UNVERIFIED.
2. Decide the target: **keep it a single-user local runtime** (then the DB/auth "BROKEN" items become
   "out of scope, delete the schema/compose"), or **make it real multi-tenant SaaS** (then wire
   Prisma + auth middleware + RBAC + per-tenant vault into `server.mjs`).

Until a runtime exists here, Phases 1, 2 (execution), 3, 5 (live), 8, 9 remain **UNVERIFIED** and I
will not report them as passing.
