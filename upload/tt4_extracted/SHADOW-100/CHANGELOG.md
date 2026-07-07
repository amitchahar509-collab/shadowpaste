# Changelog

## V14 (current)
- **1000X torture test (Phase 1):** generated 2,850 fake secrets across every provider family
  (OpenAI/Anthropic/Gemini/Mistral/Groq/HF/AWS/GitHub/GitLab/Docker/NPM/Mongo/Postgres/MySQL/Redis/
  Supabase/Firebase/JWT/OAuth/Stripe/Slack/Telegram) → **0 raw leaks**. Committed `tests/torture.node.test.mjs`.
- **Bug found & fixed:** the entropy sweep required BOTH a digit and a letter, so an all-letter bare token
  (e.g. some Mistral keys) could slip through. Now requires a letter and skips only hash/UUID shapes — which
  also **stops over-redacting git SHAs** (verified: 40-hex commit preserved, keys still virtualized).
- **RBAC policy engine (Phase 4, partial):** real, unit-verified `packages/rbac` (OWNER/ADMIN/DEVELOPER/VIEWER
  → permissions, deny reasons, role-change guard). This is the **policy layer only** — no auth/user-store/team-DB.
- Perf: 1,050 secrets protected in ~2s (bulk path). Byte-preservation re-verified. No console errors.
- **Not built (honest):** auth/OAuth/passkeys, team storage, encrypted cloud sync, billing, admin dashboard,
  live-AI round-trip proof, Cursor extension, and the "big-bang 3D universe" — all require a backend/DB/network
  or live AI I cannot run & verify here, so they are not claimed. The V11 neural WebGL hero remains the 3D UI.

## V12
Core purpose hardening — **safe full-project pasting**:
- **Formatting corruption fixed.** The old pipeline collapsed blank lines, rewrote list markers, deduped
  lines, and (in Prompt Intelligence) rewrote the whole input — mangling pasted code. Now gated to OPTIMIZE mode.
- **PROTECT mode (new default):** detects & virtualizes secrets while preserving the source **byte-for-byte
  except secret values**. Verified: output is byte-identical to input (indentation, tabs, blank lines, comments,
  JSON/YAML structure, list markers) with only secrets replaced (`firstDiffAt: null`).
- **TEST mode:** replaces secrets with `[DETECTED_<PROVIDER>_SECRET]` labels, nothing written to the vault (QA).
- **OPTIMIZE mode:** the previous prompt-engineering behavior, unchanged.
- **Inline secret scanner:** catches `password="…"`, `const apiKey="…"`, `token:'…'`, `Authorization: Bearer …`,
  and bare `DB_PASSWORD=…` — replacing only the value, preserving quotes/keys/structure.
- **Classification:** specific `MONGODB/POSTGRES/MYSQL/REDIS`, plus `TELEGRAM`, `ENV_SECRET`, `SSH_PRIVATE_KEY`,
  `AWS_ACCESS_KEY/AWS_SESSION`.
- **AI compatibility:** PROTECT prepends a short legend so the model treats `{{SHADOW_SECRET_*}}` as live
  references, not missing data.
- Verified in-browser: byte-exact preservation, all inline variants, Telegram/Redis/Postgres, OPTIMIZE still
  rewrites, firewall still blocks injection, no console errors, neural hero still runs.
- **Not done this pass (honest):** the "volcano Secret Protection Engine" 3D scene — the V11 neural WebGL hero
  remains; a second unverifiable 3D scene was skipped rather than claimed. No Worker threads added (the batched
  IndexedDB path from V11.1 already handles 1000+ secrets; PROTECT is lighter than the old pipeline).

## V11.1 RC
Release-candidate hardening (verify/fix/ship, no new features):
- **Perf:** bulk-paste batched into single IndexedDB transactions + dedup cache — 1000 secrets 9.1s → 2.2s.
- **Supply chain:** real SHA-384 SRI pins on all 5 CDN libraries (verified loading).
- **SW:** network-first HTML so updates aren't served stale.
- Verified in-browser: E2E flow, red team (injection/reveal/expiry/CRITICAL/**XSS escaped**), SRI load, 1000-secret stress.
- Docs: SHIP_REPORT, LIVE_PROVIDER_TEST (+ runnable script), INSTALL, KNOWN_LIMITATIONS, RELEASE_NOTES.

## V11
**Architecture (Agent 1):** `packages/runtime` composition façade; documented clean boundaries (ARCHITECTURE.md).
**Security (Agent 2/8):** `tests/redteam.node.test.mjs` — 12 attack/defense tests (injection, exfil, jailbreak,
replay, cross-session token theft, tamper/scope-escalation, memory extraction, forged/unknown ref, revoked reuse,
passphrase lock). All verified in-browser.
**Crypto (Agent 3):** PBKDF2-SHA256 (210k) passphrase-locked vault (`VaultStore.fromPassphrase`).
**Backend (Agent 4):** added `POST /policy/check` pre-flight route.
**Frontend (Agent 5):** Security Analytics dashboard — protected count, runtime executions, attacks blocked,
high-risk secrets, risk sparkline, provider distribution. All driven by real event data.
**Extension (Agent 6):** Perplexity added to host permissions + content matches.
**DevOps (Agent 9):** GitHub Actions CI (tests + docker build + secret-leak guard), SECURITY.md checklist,
COMPETITIVE.md, network-first service worker (fixes stale-shell updates).

## V8
Monorepo (`packages/`, `server/`, `apps/`, `tests/`); Fastify runtime server (5 routes); real provider adapters
(OpenAI/Anthropic/Gemini) verified vs mock; MV3 extension; PWA (sw.js + manifest); Dockerfile; REALITY_REPORT.

## V7.5
DB-URI detection hardening (Mongo Atlas/Redis/Postgres/MySQL), precise provider classification (no GENERIC),
prompt-injection shield, capability nonce replay protection, entropy+context scoring, vault risk chips.

## V7
Secret virtualization engine, AES-GCM IndexedDB vault, capability tokens, agent gateway, firewall, glassmorphism UI.
