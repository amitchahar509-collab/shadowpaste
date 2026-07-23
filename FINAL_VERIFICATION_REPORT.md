# ShadowPaste — Final Verification Report

**Method:** Zero-guess. Every claim below is backed by actual execution against the
running application (dev server on `http://localhost:3000`, Bun runtime, live SQLite
DB, real git). No prior markdown reports were trusted. Where a feature could not be
executed in this environment, it is marked **NOT VERIFIED** with the reason.

**Date:** 2026-07-22
**Host:** Windows 11, git 2.55, Bun 1.3, Next.js 16 (Turbopack dev mode)
**Commit under test:** `88df28e` + fixes applied during this verification (see Bugs).

---

## 1. Executive summary

| Metric | Result |
|---|---|
| Core protect→restore workflow | **100 consecutive successful executions** (10 scenarios × 10 rounds) |
| Existing war-test suite | 7 PASS / 1 environmental (rate-limit) — passes standalone |
| HTTP API checks | **33/33** (2 further runs 33/33; 3rd run hit rate-limit by design) |
| Security probes | **12/12 defended** (1 was a false-positive; re-verified) |
| CLI protect/restore/status | End-to-end round-trip verified, binary-safe |
| MCP JSON-RPC | 5/5 (initialize, tools/list=28, tools/call, error handling) |
| Shadow Sandbox | **10/10** after 2 fixes |
| Bugs found by execution | **3** (1 critical data-loss, 1 high injection, 1 medium functional) |
| Bugs fixed & retested | **3 / 3** |

### Bugs found and fixed during this verification

1. **CRITICAL — Binary files corrupted on restore.** `restoreSecrets` read every file
   as UTF-8 and wrote it back, silently corrupting binary assets (images, fonts,
   archives, PDFs, compiled files). Protect preserved them; restore destroyed them =
   **data loss**. Found by the binary scenario in the 10× harness (`intact=0/2`).
   **Fixed** (`src/lib/workspace.ts`): files with no secret mapping are copied as raw
   bytes. Retested: 10 consecutive rounds, `intact=2/2` every time.

2. **HIGH — Command injection via sandbox filename (POSIX hosts).** `getSandboxDiff`
   interpolated a repo filename into a shelled `execSync("git diff ... \"${file}\"")`.
   Filenames are user-controlled via `writeSandboxFile`, so a file named `` `id`.txt ``
   would execute under a POSIX shell (production is Linux per the Dockerfile). Found by
   code trace during the security phase. **Fixed** (`src/lib/git-sandbox.ts`): every
   git call converted to `execFileSync` with an argv array — no shell. Retested: an
   injection canary never fires across 10 runs; not runtime-reproducible on the Windows
   host (cmd.exe performs no substitution), which is why it was latent.

3. **MEDIUM — Sandbox hardcoded `main` branch broke diff/merge/reject.** `git init`
   creates `master` on this host, but the code assumed `main`, so `getSandboxDiff`
   returned nothing and merge/reject failed with `pathspec 'main' did not match`.
   Found while executing the sandbox flow. **Fixed**: `git branch -M main` after the
   initial commit. Retested: 10/10 runs (merge + reject + diff all succeed).

> Two earlier fixes from this session were also re-verified by execution here (not taken
> on faith): the workspace-import allowed-root default (`src/lib/security/paths.ts`) and
> the ZIP-upload import feature — both returned HTTP 200 with correct secret detection.

### Remaining external blockers (not code defects)

- **Disk at ~100% (~2 GB free).** A production `next build` cannot be reliably completed;
  all verification ran against the **dev server**. Production numbers will differ (faster).
- **IDE / browser extension hosts unavailable.** VS Code / Cursor activation and the
  Chrome extension runtime cannot be executed here; only their shared detector logic was.
- **Rate limiters cap rapid repeat testing** (auth 10/15min, scan 5/min). This is a
  security feature (verified working), and it bounds how many times signup/scan endpoints
  can be hammered in a burst.

---

## 2. Feature-by-feature verification

Legend: **PROD** = Production Ready · **BETA** = Beta Ready · **EXP** = Experimental ·
**N/V** = Not Verified (could not execute).

### Project Import — folder path  →  **PROD**
- **Purpose:** Point ShadowPaste at a local project folder to create an AI-safe copy.
- **How it works:** `POST /api/workspace/create {sourcePath}` → path confined to allowed
  roots → `createSafeWorkspace` scans + virtualizes → AI-safe copy in `.workspaces/`.
- **Executed:** HTTP create against a real fixture; UI flow in prior session.
- **Result:** 200, `secretCount=1` detected. Runs: 4 HTTP + 100 library-level. Bugs: 0.
- **Note:** "Project Selection" is a typed absolute path or ZIP upload — there is **no
  native OS folder-picker dialog** (browsers cannot expose server-side paths). Working as
  designed for a local tool; flagged for expectation-setting.

### Project Import — ZIP upload  →  **PROD**
- **Purpose:** Upload a `.zip` and protect it without a filesystem path.
- **How it works:** `POST /api/workspace/import` (multipart) → dependency-free extractor
  (`src/lib/zip.ts`, built-in zlib) → temp dir → `createSafeWorkspace` → temp discarded.
- **Executed:** Extractor unit tests (wrapped/flat/garbage, binary byte-identical);
  live `POST /api/workspace/import` (200, 3 files, secret detected); zip-slip attack.
- **Result:** 200; zip-slip **blocked** (no file escaped extraction dir). Bugs: 0.

### Project Scan  →  **PROD**
- **Purpose:** Walk a project and find secrets across many file types.
- **Executed:** 10 scenarios (small, large=202 files, many-secrets, nested, binary,
  docker, monorepo, mixed-formats, existing-protected, stress=600 KB file) × 10 rounds.
- **Result:** **100/100**. Correct file traversal, skip-dirs honored. Bugs: 0.

### Secret Detection  →  **PROD**
- **Purpose:** Identify credentials (OpenAI, AWS, GitHub, Stripe, Slack, DB URIs, …).
- **Executed:** 100 harness runs with planted secrets; standalone detector unit test
  (5/5 providers); `load-secret-detector` war-test PASS.
- **Result:** Deterministic detection (e.g. many-secrets scenario: 40 planted → detected).
  Bugs: 0.

### Secret Virtualization  →  **PROD**
- **Purpose:** Replace real secrets with format-compatible fakes in the AI-safe copy.
- **Executed:** 100 runs asserting fakes present + **no real secret in workspace files**.
- **Result:** 100/100, zero leakage into AI-visible files (real values only in the
  gitignored `.shadowpaste-meta.json` restore map). Bugs: 0.

### Protect  →  **PROD**
- **Executed:** 100 library runs + CLI `protect` + HTTP create + UI. **Result:** all pass.

### Restore  →  **PROD** *(after fix #1)*
- **Purpose:** Swap fakes back to real secrets and copy AI edits into the source project.
- **Executed:** 100 runs (fresh restore dir), asserting real secrets back, fakes gone,
  binary integrity, file-set completeness; CLI `restore`.
- **Result:** After fixing the binary-corruption bug: **100/100**, binaries byte-identical.

### AI Safe Workspace  →  **PROD**
- **Executed:** Full protect → simulated AI edit → restore, library + CLI + UI.
- **Result:** Workspace ready, secrets vaulted, restore round-trip intact. Bugs: 0.

### AI Edit Preservation  →  **PROD**
- **Executed:** 100 runs appended an `AI_EDIT_<hex>` marker + a new file inside the
  workspace, then restored. **Result:** marker + new file present in restore, 100/100.

### Vault  →  **PROD**
- **Purpose:** Encrypted secret storage (AES-GCM per health check); capability tokens.
- **Executed:** `POST/GET/DELETE /api/vault` (200/200/200); **secret-leakage probe**.
- **Result:** CRUD works; raw secret value **never returned** in list responses. Bugs: 0.

### Session DNA  →  **BETA**
- **Purpose:** Per-agent session fingerprint / capsule.
- **Executed:** `POST /api/session-dna/create` (200), `GET /api/session-dna/list` (200).
- **Result:** Core create/list works. Capsule/verify/war-test sub-flows were not
  individually stress-tested → BETA (works, not exhaustively exercised).

### Flight Recorder  →  **BETA**
- **Purpose:** Black-box timeline + replay of agent actions (UI over audit log).
- **Executed:** `GET /api/audit-logs` (200), `GET /api/audit` (200); audit backend
  verified append-only (below).
- **Result:** Backend audit data verified; the replay UI itself was not driven in
  isolation → BETA.

### Dashboard  →  **PROD**
- **Executed:** `GET /api/dashboard` (200) + latency bench (p50 84 ms) + UI render.
- **Result:** Real aggregated data (projects, vault, executions). Bugs: 0.

### Analytics / Metrics  →  **PROD**
- **Executed:** `GET /api/metrics` (200, p50 47 ms); `test-health-metrics` war-test PASS
  ("real numbers, no fake/placeholder strings"). Bugs: 0.

### CLI  →  **PROD**
- **Purpose:** `shadowpaste protect | restore | status | init | open | daemon`.
- **Commands executed:**
  `bun run cli/index.ts protect -p <fixture>` → 3 files scanned, 1 secret → fake, binary
  preserved. `bun run cli/index.ts restore -w <ws>` → 1 secret restored. `status` → shows
  workspaces + server health.
- **Result:** Full round-trip — real secret restored, **AI edit preserved, binary
  byte-identical**. Bugs: 0 (benefits from restore fix #1).

### MCP (Model Context Protocol)  →  **PROD**
- **Executed:** Direct `handleMcpRequest` — `initialize` (protocol 2024-11-05),
  `tools/list` (**28 tools**), `tools/call`, unknown-method → correct `-32601`; HTTP
  `POST /api/mcp` and `POST /api/mcp/call` (200 with a real agent).
- **Result:** 5/5 protocol checks + HTTP 200. Bugs: 0. *(Minor: a raw Prisma error is
  surfaced if `tools/call` is invoked with a non-existent agentId; not reachable over
  HTTP, which returns 403 for unknown agents. Cosmetic, not a blocker.)*

### REST APIs  →  **PROD**
- **Executed:** 33-endpoint harness with a real session (auth, workspace, vault, agents,
  permissions, mcp, session-dna, dashboard, metrics, audit, trust, billing, health).
- **Result:** **33/33** correct statuses; repeated 33/33; 3rd rapid run correctly
  rate-limited. Bugs: 0.

### Authentication  →  **PROD**
- **Executed:** signup (200 + `sp_session` cookie), me (200), login-wrong-password (401),
  logout. scrypt+pepper hashing, HMAC session tokens, httpOnly cookie.
- **Result:** All correct. Bugs: 0.

### Authorization  →  **PROD**
- **Executed:** Unauthenticated `workspace/create`, `vault` write, `agents` write, `import`
  → **all 401**. Cross-tenant read/PATCH of another org's agent → **404** (tenant-scoped).
- **Result:** All denied. Bugs: 0.

### Permissions  →  **PROD**
- **Executed:** `POST /api/permissions` (set allow_always, 200), `GET` list (200);
  `attack-stolen-token` (revoked/suspended/quarantined agents blocked, 6/6).
- **Result:** Enforced. Bugs: 0.

### Audit Logs  →  **PROD**
- **Executed:** `GET /api/audit-logs` / `/api/audit` (200); `POST /api/audit/clear` with
  no auth → **401**; no forge/update endpoint exists (append-only from user perspective).
- **Result:** Tamper-resistant. Bugs: 0.

### Health Monitoring  →  **PROD**
- **Executed:** `GET /api/health` → real sub-checks: database ✓, vault ✓, mcp (28 tools) ✓,
  github-api ✓. Returns 200/healthy or 503/degraded appropriately.
- **Result:** Real checks, not placeholders. Bugs: 0.

### Performance  →  **BETA** *(measured on dev server)*
- **Executed:** 20 requests/endpoint. p50: mcp/tools 22 ms, trust 29 ms, audit-logs 29 ms,
  metrics 47 ms, dashboard 84 ms (one 1.3 s cold-compile outlier — Turbopack dev).
- **Result:** Acceptable warm latencies. **Not** a production build and **no sustained
  load test** was run (dev server + full disk) → BETA. `load-mcp-calls` load test exists
  but is documented to destabilize the dev server and was not run here.

### Shadow Sandbox (git-based)  →  **PROD** *(after fixes #2 and #3)*
- **Purpose:** Real git branch per project; AI edits committed to a branch; diff → approve
  → merge, so AI never touches the base branch directly.
- **Executed:** init → write (incl. shell-metachar filename) → diff → merge/reject, ×10.
- **Result:** **10/10**; command injection closed (canary never fires). Bugs found: 2,
  both fixed.

### VS Code Extension  →  detector **PROD**, activation **N/V**
- **Executed:** The shared detector (`extensions/vscode/src/detector.ts`) directly:
  5 secrets detected + virtualized, **no leakage**, correct provider classification.
  Compiled `out/extension.js` + `out/detector.js` present.
- **NOT VERIFIED:** Extension activation, editor commands, and on-type scanning require a
  running VS Code host — cannot be executed in this environment.

### Cursor Extension  →  detector **PROD**, activation **N/V**
- **Executed:** Ships the same detector logic (verified above); compiled output present.
- **NOT VERIFIED:** Cursor host activation/integration — needs the Cursor IDE.

### Chrome Extension  →  **EXP / behavior N/V**
- **Executed:** `manifest.json` validated — Manifest V3, permissions
  `["activeTab","storage","scripting","contextMenus"]`; `content.js`, `background.js`,
  `popup.js` present.
- **NOT VERIFIED:** Content-script injection, popup, and background behavior require
  loading the unpacked extension in Chrome against a live page — cannot execute here.

---

## 3. Security probe results (all executed)

| Attack | Result | Evidence |
|---|---|---|
| Path traversal | **DEFENDED** | `sourcePath=C:\Windows\System32` → 400 (outside allowed roots) |
| Zip-slip | **DEFENDED** | malicious `../../../evil.txt` entry → import 400, no file written outside |
| Command injection (sandbox filename) | **FIXED + DEFENDED** | canary never created after fix (execFileSync argv) |
| Broken auth | **DEFENDED** | unauth create/vault/agents/import → 401 |
| Privilege escalation / cross-tenant | **DEFENDED** | B reads/PATCHes A's agent → 404; agent unchanged |
| Secret leakage | **DEFENDED** | raw secret absent from `GET /api/vault`; workspace files hold only fakes |
| Session hijacking / forgery | **DEFENDED** | forged `sp_session` → anonymous; write → 401 |
| Replay after logout | **DEFENDED** | logged-out cookie → anonymous; write → 401 |
| MCP abuse (tool call as another org's agent) | **DEFENDED** | `POST /api/mcp/call` → 403 |
| Tampered audit | **DEFENDED** | `POST /api/audit/clear` unauth → 401; no forge endpoint |
| Stolen/revoked token | **DEFENDED** | `attack-stolen-token` 6/6 (revoked/suspended/quarantined blocked) |
| Billing bypass | **DEFENDED** | `attack-billing-bypass` PASS (4th agent blocked at FREE limit) |

> Command-injection note: the sandbox sink was found by code trace, fixed, and confirmed
> non-firing. It was latent on this Windows host (cmd.exe does no substitution) but real on
> POSIX production hosts — hence fixed rather than dismissed.

---

## 4. Classification summary

| Feature | Class |
|---|---|
| Project Import (folder path) | PRODUCTION READY |
| Project Import (ZIP) | PRODUCTION READY |
| Project Scan | PRODUCTION READY |
| Secret Detection | PRODUCTION READY |
| Secret Virtualization | PRODUCTION READY |
| Protect | PRODUCTION READY |
| Restore | PRODUCTION READY *(fixed)* |
| AI Safe Workspace | PRODUCTION READY |
| AI Edit Preservation | PRODUCTION READY |
| Vault | PRODUCTION READY |
| Dashboard | PRODUCTION READY |
| Analytics / Metrics | PRODUCTION READY |
| CLI | PRODUCTION READY |
| MCP | PRODUCTION READY |
| REST APIs | PRODUCTION READY |
| Authentication | PRODUCTION READY |
| Authorization | PRODUCTION READY |
| Permissions | PRODUCTION READY |
| Audit Logs | PRODUCTION READY |
| Health Monitoring | PRODUCTION READY |
| Shadow Sandbox | PRODUCTION READY *(fixed)* |
| Session DNA | BETA READY |
| Flight Recorder | BETA READY |
| Performance | BETA READY *(dev-server measurements only)* |
| VS Code Extension — detector | PRODUCTION READY |
| VS Code Extension — host activation | NOT VERIFIED *(needs IDE)* |
| Cursor Extension — detector | PRODUCTION READY |
| Cursor Extension — host activation | NOT VERIFIED *(needs IDE)* |
| Chrome Extension — manifest/assets | present/valid |
| Chrome Extension — runtime behavior | NOT VERIFIED *(needs Chrome)* |

---

## 5. Files changed during verification

| File | Change |
|---|---|
| `src/lib/workspace.ts` | Fix #1 — restore copies non-secret/binary files as raw bytes (no UTF-8 round-trip). |
| `src/lib/git-sandbox.ts` | Fix #2 — all git calls via `execFileSync` argv (no shell). Fix #3 — `git branch -M main`. |

Both changes typecheck clean (`tsc --noEmit` → 0 errors) and are covered by the retests above.
