# ShadowPaste V11.1 RC — Release Notes

Release-candidate hardening pass. No new features; verify → fix → ship.

## Fixed
- **Performance:** bulk-paste virtualization batched into single IndexedDB transactions with a preloaded
  dedup cache. 1000-secret `.env`: **9.1s → 2.2s**, no UI-freeze on typical inputs. In-batch dedup verified.
- **Supply chain:** all 5 CDN libraries pinned with real **SHA-384 SRI** hashes (verified they still load).
- **Service worker:** network-first for HTML so app updates appear on reload (was cache-first / stale shell).

## Verified this pass (browser JS engine)
- E2E paste → virtualize → runtime execute; raw key absent from output/result.
- Red team: prompt injection, reveal-denial, expired token, CRITICAL action, **XSS escaped**.
- Passphrase-locked vault (correct vs wrong key). SRI-pinned CDN load. 1000-secret stress.

## Added (docs / tooling)
- `SHIP_REPORT.md`, `LIVE_PROVIDER_TEST.md` (+ `tests/live-provider.mjs`), `INSTALL.md`,
  `KNOWN_LIMITATIONS.md`, this file.

## Not executed here (run locally — Node ≥20)
- Fastify server, `node --test tests`, Docker build, live provider call.

## Version
**ShadowPaste V11.1 — Release Candidate.** Frozen; see `KNOWN_LIMITATIONS.md` for honest scope.
