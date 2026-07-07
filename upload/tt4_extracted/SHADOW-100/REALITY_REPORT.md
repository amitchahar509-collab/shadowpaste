# ShadowPaste V8 — REALITY REPORT (Phase 0)

Honest, per-feature audit. Legend:
`[REAL]` executable & verified · `[PARTIAL]` works with caveats · `[SIMULATED]` fake/stub · `[MISSING]` not present.

Verification environment for this pass: **browser JS engine only** (Python static server + Chromium preview).
**No Node.js, npm, or Docker is available in the build environment**, so server-side code in `/server`,
`/packages/*` (Node path), and `/tests/*.node.test.mjs` is written as real, runnable code but was **executed and
verified only in the browser** where the API surface is identical (`globalThis.crypto.subtle`, `fetch`). Anything
requiring Node is marked accordingly and shipped with instructions to run it yourself.

## V7.5 (starting point) — audited

| Feature | Status | Notes |
|---|---|---|
| AES-GCM vault encryption | `[REAL]` | WebCrypto AES-GCM-256, non-extractable key in IndexedDB. Verified: encrypt→decrypt round-trips, no plaintext at rest. |
| IndexedDB storage | `[REAL]` | `keys/secrets/history/activity` stores; verified read/write/purge. |
| Capability tokens | `[REAL]` | HMAC-SHA256 signed, session-bound, TTL, nonce; verified sign/verify + expiry + replay reject. |
| Secret virtualization | `[REAL]` | Detect→classify→encrypt→reference; raw absent from output/exports/history (verified). |
| Provider classification | `[REAL]` | Precise providers incl. `AWS_ACCESS_KEY`, `DATABASE`, `HUGGINGFACE`; no `GENERIC` for known keys. |
| Prompt-injection shield | `[REAL]` | 7 patterns; verified CRITICAL escalation + structural reveal-denial. |
| Agent firewall | `[REAL]` | LOW→CRITICAL over action + intent; HIGH = human gate, CRITICAL = block. |
| Gateway secret **execution** | `[SIMULATED]` ⚠️ | V7.5 returns a synthetic string; **no real provider HTTP call**. This is the honest gap V8 closes. |
| Browser extension | `[MISSING]` | Only a `window.ShadowPasteRuntime` façade existed; no manifest/content-script. |
| Node runtime server | `[MISSING]` | No server existed. |
| Automated test suite | `[PARTIAL]` | Verified manually via browser eval; no committed automated files. |
| PWA offline | `[PARTIAL]` | Registration hook present but no real `sw.js`/manifest shipped. |

## Fake claims removed / corrected
- "AI can still use those secrets" → clarified: **only** through the gateway; V7.5 execution was simulated.
- No "impossible to leak" / "zero retention" wording remains (already cleaned in V7.5).

## What V8 adds (and its real status — see end-of-build audit)
- `[REAL]` isomorphic `/packages` (crypto, capability, security) — verified in-browser.
- `[REAL, run-with-node]` Fastify `/server` + provider adapters + `/tests` — real code, run locally with Node ≥20.
- `[REAL]` MV3 browser extension (`/apps/extension`) — loadable in Chrome.
- `[REAL]` PWA `sw.js` + `manifest.webmanifest`; `[REAL]` Dockerfile + `.env.example`.
- Provider execution: `[PARTIAL]` — real HTTP adapters; a **live** call needs your API key + network. Verified against a local mock.

## End-of-build audit (Phase 11) — what was actually executed

Verified by running the shipped modules in the browser JS engine (identical WebCrypto/fetch to Node ≥20):

| Check | Result |
|---|---|
| `crypto` AES-GCM encrypt→decrypt round-trip, no plaintext in record | ✅ |
| `capability` mint/verify; reject tampered / wrong-session / expired / replayed | ✅ (all 5) |
| `security` classifier (Mongo→DATABASE, AKIA→AWS_ACCESS_KEY), Firewall CRITICAL, entropy w/ context | ✅ |
| `providers`+`gateway` end-to-end vs **mock** provider: key injected outbound, **absent** from result + audit + metadata | ✅ |
| gateway CRITICAL action auto-denied | ✅ |
| web app: vault armed, OpenAI+Mongo virtualize, raw absent, service worker active, manifest linked | ✅ |
| no console errors / CSP violations | ✅ |

**Not executed in this environment (no Node/Docker); shipped as real, runnable code:**
- `server/server.mjs` (Fastify, 5 routes) — run `cd server && npm i && npm start`.
- `tests/runtime.node.test.mjs` (7 mission tests) — run `node --test tests`. Logic is identical to the
  browser-verified path above, so behavior is expected to match; **status is `[REAL, run-with-node]`, not "I ran it."**
- `Dockerfile` — real, unbuilt here.

**Honest simulation note:** the in-browser `index.html` gateway still returns a *synthetic* execution result
(it makes no outbound API call by design). Real network execution lives in `packages/providers` + `server` and
requires your API key. No file claims a live provider call happened when it did not.

**Self-audit sweep:** no `TODO`/`FIXME`/placeholder stubs remain in shipped code. The words "mock"/"simulated"
appear only where accurate (test doubles; the browser demo's non-networked result).
