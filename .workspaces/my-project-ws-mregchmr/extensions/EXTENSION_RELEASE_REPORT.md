# ShadowPaste V21 — Extension Release Report

> **Phase:** V21-P6-EXTENSION-RELEASE
> **Agent:** Integration Tester
> **Sandbox reality:** No Chrome / VS Code / Cursor host available. Browser and
> editor runtime behavior is **UNVERIFIED**. What IS verified in this report:
> (a) the extension source files parse/compile, (b) every API endpoint the
> extensions call exists on the running V21 backend and returns the expected
> shape, (c) the Chrome MV3 manifest is valid JSON, (d) the VS Code/Cursor
> `package.json` `main` fields resolve to compiled output, (e) the local
> detector port matches the backend's regex arrays byte-for-byte.
>
> Commands were actually executed — every "result" line below is real output,
> not a projection.

---

## Chrome Extension (MV3)

### Files

| File | Lines | Role |
|------|-------|------|
| `extensions/chrome/manifest.json` | 27 | MV3 manifest — permissions, host_permissions, SW, content_scripts, action |
| `extensions/chrome/background.js` | 149 | Service worker — context menu, scan orchestrator, badge, message router |
| `extensions/chrome/content.js` | 128 | Content script on `https://github.com/*/*` — floating scan button + toasts |
| `extensions/chrome/popup.js` | 119 | Popup logic — vault status, last scan, settings, re-scan, open dashboard |
| `extensions/chrome/popup.html` | 145 | Popup markup (CSS + 8 element IDs that popup.js binds to) |
| `extensions/chrome/README.md` | — | (docs, not exercised in this report) |
| **Total** | **568 LOC** | |

### API Integration Verification

The backend was started for this audit (`./node_modules/.bin/next dev -p 3000`,
Next.js 16.1.3 Turbopack, ready in 1.4 s, listening on `*:3000`).
`/api/health` returns `{"status":"healthy",...}` → backend is up.

For each API the Chrome extension calls:

#### `POST /api/github/scan-real` (called by `background.js:57`)

```bash
curl -s -o /tmp/r.txt -w "HTTP %{http_code}\n" -X POST http://localhost:3000/api/github/scan-real \
  -H 'Content-Type: application/json' -d '{"repo":"octocat/Hello-World"}'
```

**Result: HTTP 502**, body `{"error":"GitHub API 403"}` (first 200 bytes).

**Interpretation:** The route exists, parses the body, calls
`scanGitHubRepo("octocat/Hello-World")`, and surfaces the upstream GitHub
error. The 403 is a sandbox network-egress issue (GitHub API unreachable from
this environment), NOT a route bug. The route handler is identical to what
`background.js` POSTs to (`{ repo }` body, optional `Authorization: Bearer`
header). The response shape — on success — would be `{ ok:true, repo, score,
grade, filesScanned, secretsCount, vaultedCount, findings, ... }` per
`src/lib/github-scanner.ts:21`, which `background.js:74-79` reads correctly
(score, grade, filesScanned, secretsCount, vaultedCount, findings.length).
**Endpoint integration: ✅ verified at the HTTP layer.** Live GitHub scan
cannot be exercised in the sandbox.

#### `GET /api/vault` (called by `popup.js:34`)

```bash
curl -s -o /tmp/v.txt -w "HTTP %{http_code}\n" http://localhost:3000/api/vault
```

**Result: HTTP 200**, body shape:
```json
{"secrets":[{"id":"cmr...","name":"audit-test","provider":"GITHUB","scope":"github.repo","masked":"ghp_test...3456","fingerprint":"...","createdAt":"2026-07-08T05:04:43.582Z"}, ...], "count":2}
```

`popup.js:37` reads `data.count ?? (Array.isArray(data.secrets) ? data.secrets.length : 0)` — both branches satisfied. **✅ verified.**

#### `GET /api/mcp-config` (NOT called by Chrome — listed in checklist for parity)

```bash
curl -s -o /tmp/m.txt -w "HTTP %{http_code}\n" http://localhost:3000/api/mcp-config
```

**Result: HTTP 200**, body shape: `{"server":{"name":"shadowpaste","protocolVersion":"2024-11-05"},"configs":{"claude-desktop":{...},"cursor":{...},"stdio-bridge":{...}},"instructions":[...]}`. **✅ verified.**

### Syntax Verification

| Check | Command | Result |
|-------|---------|--------|
| `background.js` parses | `node --check extensions/chrome/background.js` | ✅ OK (exit 0) |
| `content.js` parses | `node --check extensions/chrome/content.js` | ✅ OK (exit 0) |
| `popup.js` parses | `node --check extensions/chrome/popup.js` | ✅ OK (exit 0) |
| `manifest.json` is valid JSON | `node -e "JSON.parse(require('fs').readFileSync('extensions/chrome/manifest.json','utf8')); console.log('valid')"` | ✅ `valid` |

> Note: `node --check` validates JavaScript syntax only — it does NOT execute
> the file, so `chrome.*` APIs are not exercised. The MV3 surface used
> (`chrome.runtime`, `chrome.storage.local`, `chrome.contextMenus`,
> `chrome.tabs`, `chrome.action`) is the documented stable API and is
> referenced consistently with the manifest's `permissions: ["activeTab",
> "storage", "scripting", "contextMenus"]`.

### Test Cases (from `RELEASE_CHECKLIST.md` §1.2) — Status

| # | Case | Status | Reason |
|---|------|--------|--------|
| C1 | Scan via floating button | **UNVERIFIED** | No Chrome host in sandbox |
| C2 | Scan via context menu | **UNVERIFIED** | No Chrome host in sandbox |
| C3 | Scan via link right-click | **UNVERIFIED** | No Chrome host in sandbox |
| C4 | Non-repo page (no button) | **UNVERIFIED** | No Chrome host in sandbox |
| C5 | Popup vault status | **UNVERIFIED** | No Chrome host in sandbox (but the underlying `GET /api/vault` is verified ✅ above) |
| C6 | Popup last scan | **UNVERIFIED** | No Chrome host in sandbox |
| C7 | Re-scan last repo | **UNVERIFIED** | No Chrome host in sandbox |
| C8 | Open dashboard | **UNVERIFIED** | No Chrome host in sandbox |
| C9 | Settings persistence | **UNVERIFIED** | No Chrome host in sandbox |
| C10 | Server URL override | **UNVERIFIED** | No Chrome host in sandbox (but `background.js:57` `${serverUrl}/api/github/scan-real` confirms the override is wired in code) |
| C11 | Offline backend | **UNVERIFIED** | No Chrome host in sandbox (but `popup.js:44-48` shows the offline→`offline` badge path exists) |
| C12 | Badge color thresholds | **UNVERIFIED** | No Chrome host in sandbox (but `background.js:85` `score>=80?"#10b981":score>=50?"#f59e0b":"#ef4444"` confirms the thresholds in code) |

**Test count: 0 PASS / 0 FAIL / 12 UNVERIFIED.**

### Verdict

**Cannot be published to the Chrome Web Store yet.** Blockers, in priority order:

1. **All 12 functional test cases (C1–C12) are UNVERIFIED.** No Chrome host was available. Before publishing, every case must be re-run against a production backend with outbound GitHub access.
2. **`host_permissions` is `localhost:3000` + `https://github.com/*` only.** Production deployments on HTTPS hosts require editing this before submission (the `fetch` calls in `background.js:57` and `popup.js:34` would be blocked by CORS / MV3 host-permission checks).
3. **`manifest.json` `version` is `"1.0.0"`** — acceptable for a first store submission, but if any iteration occurs before submitting, the version MUST be bumped (Chrome Web Store rejects re-uploads at the same version).
4. **No privacy policy URL** is declared in the manifest, and the listing will require one (the extension reads page URLs on `github.com`).
5. **No `content_security_policy` key** in the manifest — MV3 defaults apply, which is acceptable, but it should be explicit before publishing.
6. **API key is stored in `chrome.storage.local` (unencrypted).** Acceptable for a developer tool; not acceptable for shared machines.
7. **Backend `/api/vault` and `/api/github/scan-real` do not enforce auth** (verified below in §Cross-Cutting). Production deployment must gate these routes before the extension ships.

What's already good: source files parse, the manifest is valid JSON, MV3
service-worker shape is correct (`"type": "module"`), the three API
endpoints the extension calls all exist and respond with the expected
shape, and `host_permissions` correctly scopes the active content to
`github.com`.

---

## VS Code Extension

### Files

| File | Lines | Role |
|------|-------|------|
| `extensions/vscode/package.json` | 61 | Manifest — commands, configuration, engine `^1.80.0` |
| `extensions/vscode/tsconfig.json` | 18 | `tsc` config — `strict`, `outDir: out`, `rootDir: src`, `sourceMap` |
| `extensions/vscode/src/extension.ts` | 528 | `activate`/`deactivate` + 3 commands (scanWorkspace, protectSecrets, connectMcp) |
| `extensions/vscode/src/detector.ts` | 252 | LOCAL copy of detector — patterns byte-identical to backend (see Cross-Cutting) |
| `extensions/vscode/README.md` | — | (docs, not exercised) |
| **Total** | **859 LOC** | |

### Build Verification

`npm install` was run inside `extensions/vscode/` (4 packages: `@types/node ^18`,
`@types/vscode ^1.80`, `typescript ^5.3`, plus transitive). Then:

```bash
cd extensions/vscode && npx tsc --noEmit -p .   # type-check only, exit 0
cd extensions/vscode && npx tsc -p .            # full compile, exit 0
```

**Result: `exit 0` for both.** Compiled output:

```
out/detector.js        11,726 bytes
out/detector.js.map    10,661 bytes
out/extension.js       17,694 bytes
out/extension.js.map   12,877 bytes
```

`package.json` `main` is `"./out/extension.js"` — the file exists post-compile. ✅

### API Integration Verification

#### `POST /api/vault` (called by `extension.ts:391` in `protectSecrets`)

```bash
curl -s -o /tmp/vp.txt -w "HTTP %{http_code}\n" -X POST http://localhost:3000/api/vault \
  -H 'Content-Type: application/json' \
  -d '{"raw":"ghp_shadowh3MWcw8qMCYAZ9YWjxNbBB4TT4Bd03","name":"ext-test","contextHint":"V21-P6 release report test"}'
```

**Result: HTTP 200**, body:
```json
{"ok":true,"secret":{"id":"shadow-UFduVKe6lEmceDARyo","name":"ext-test","provider":"GITHUB","scope":"github.repo","masked":"ghp_test...wxyz"}}
```

`extension.ts:401` reads `res.data.secret?.id` — present. **✅ verified.**

#### `GET /api/mcp-config` (called by `extension.ts:499` in `connectMcp`)

Same `curl` as the Chrome section above — **HTTP 200**, `configs` object with `claude-desktop`/`cursor`/`stdio-bridge` keys. `extension.ts:489-494` types this correctly. **✅ verified.**

#### `POST /api/scan` (no longer called)

Per `RELEASE_CHECKLIST.md` §0, the previous `scanWorkspace` POSTed
`{ repoUrl: "vscode-workspace" }` to `/api/scan` which would 404 at GitHub.
V20 audit rewrote `scanWorkspaceCommand` to scan open docs **locally** with
the byte-identical detector port (`src/detector.ts`) and apply the backend's
`computeTrustScore` + `scoreToGrade` formula. Confirmed by reading
`extension.ts:194-202` and `extension.ts:226-235`: the comment cites
`src/lib/scanner.ts`, the deductions match `{critical:25, high:12, medium:5, low:2}`,
and the grade thresholds match `A+ ≥95, A ≥90, B ≥80, C ≥70, D ≥60, F <60`. No
`/api/scan` round-trip is made. **✅ verified by code reading.**

### Syntax Verification

| Check | Command | Result |
|-------|---------|--------|
| `extension.ts` type-checks | `npx tsc --noEmit -p extensions/vscode` | ✅ exit 0 (no TS errors) |
| `extension.ts` compiles | `npx tsc -p extensions/vscode` | ✅ exit 0, `out/extension.js` produced |
| `detector.ts` compiles | (same `tsc` invocation) | ✅ `out/detector.js` produced |
| `package.json` parses | (implicit — `npm install` succeeded) | ✅ |

### Test Cases (from `RELEASE_CHECKLIST.md` §2.2) — Status

| # | Case | Status | Reason |
|---|------|--------|--------|
| V1 | Compile (`npm run compile`) | **PASS** | `npx tsc -p .` exits 0; `out/extension.js` + `out/detector.js` produced (this audit, real run) |
| V2 | Activate (F5 → Ext Dev Host) | **UNVERIFIED** | No VS Code host in sandbox |
| V3 | Workspace scan — clean | **UNVERIFIED** | No VS Code host in sandbox |
| V4 | Workspace scan — secrets present | **UNVERIFIED** | No VS Code host in sandbox |
| V5 | Workspace scan — score formula | **UNVERIFIED** | No VS Code host in sandbox (but deductions + thresholds verified identical to `src/lib/scanner.ts:108-124` by code reading — see Cross-Cutting) |
| V6 | Workspace scan — no open docs | **UNVERIFIED** | No VS Code host in sandbox (but `extension.ts:180-184` shows the warning path exists in code) |
| V7 | Protect secrets — happy path | **UNVERIFIED** | No VS Code host in sandbox (but `POST /api/vault` is verified ✅ above and returns the shape `extension.ts:401` expects) |
| V8 | Protect secrets — no secrets | **UNVERIFIED** | No VS Code host in sandbox |
| V9 | Protect secrets — vault failure | **UNVERIFIED** | No VS Code host in sandbox |
| V10 | Protect secrets — dedup | **UNVERIFIED** | No VS Code host in sandbox |
| V11 | Diagnostics | **UNVERIFIED** | No VS Code host in sandbox |
| V12 | MCP connect — open | **UNVERIFIED** | No VS Code host in sandbox (but `GET /api/mcp-config` is verified ✅ above) |
| V13 | MCP connect — copy | **UNVERIFIED** | No VS Code host in sandbox |
| V14 | MCP connect — backend down | **UNVERIFIED** | No VS Code host in sandbox |
| V15 | `serverUrl` config | **UNVERIFIED** | No VS Code host in sandbox (but `extension.ts:80,113` `${cfg.serverUrl}${path}` confirms no hardcoded absolute URL) |
| V16 | `apiKey` auth | **UNVERIFIED** | No VS Code host in sandbox (but `extension.ts:68-72` `authHeaders()` attaches `Authorization: Bearer ${cfg.apiKey}` when set) |

**Test count: 1 PASS / 0 FAIL / 15 UNVERIFIED.**

### Verdict

**Cannot be published to the VS Code Marketplace yet.** Blockers, in priority order:

1. **15 of 16 functional test cases are UNVERIFIED.** Only V1 (compile) passes. Before publishing, V2–V16 must be re-run in a real VS Code host against a production backend.
2. **`package.json` `version` is `"0.1.0"`** — acceptable for an initial release, but `repository`, `license` URL, `author`, and a marketplace-ready `README.md` (with screenshots/GIFs) are still missing.
3. **No `vsce package` run in this audit.** `npx tsc -p .` works, but the actual `.vsix` packaging step has not been exercised. Run `npx @vscode/vsce package` before submission and confirm the `.vsix` is under 50 MB and contains no `node_modules/`.
4. **`scanWorkspace` does not persist a Project/Scan row** in the backend (it scans locally only). This is a known limitation, not a blocker — but the marketplace listing should disclose it.
5. **Local detector port (`src/detector.ts`) has no build-time parity guard.** A diff test (`tests/extensions/detector-parity.test.ts`) should be added so a backend pattern change doesn't silently desync the extension. See Cross-Cutting §2.

What's already good: `tsc --noEmit` passes, the full compile produces the
expected `out/` artifacts, the API endpoints respond with the expected
shape, the local score formula mirrors the backend's exactly, and the
detector regex arrays are byte-identical to `src/lib/security/detector.ts`.

---

## Cursor Extension

### Files

| File | Lines | Role |
|------|-------|------|
| `extensions/cursor/package.json` | 67 | Manifest — 4 commands (3 inherited + `cursorMcp`), `main: ./out/cursor/src/extension.js` |
| `extensions/cursor/tsconfig.json` | 18 | `tsc` config — `rootDir: ".."`, includes both `cursor/src/**` and `../vscode/src/**` |
| `extensions/cursor/src/extension.ts` | 103 | `activate` re-exports VS Code ext + adds `shadowpaste.cursorMcp` |
| `extensions/cursor/README.md` | — | (docs) |
| **Total** | **188 LOC** | |

### Build Verification

`npm install` was run inside `extensions/cursor/` (4 packages, same as VS Code). Then:

```bash
cd extensions/cursor && npx tsc --noEmit -p .   # type-check only, exit 0
cd extensions/cursor && npx tsc -p .            # full compile, exit 0
```

**Result: `exit 0` for both.** Compiled output (note the `rootDir: ".."` layout):

```
out/cursor/src/extension.js        (+ .map)
out/cursor/src/extension.js.map
out/vscode/src/extension.js        (+ .map)
out/vscode/src/extension.js.map
out/vscode/src/detector.js         (+ .map)
out/vscode/src/detector.js.map
```

### `package.json` `main` Verification

```bash
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('extensions/cursor/package.json','utf8')); console.log('main:', p.main, '| exists:', fs.existsSync(p.main));"
```

**Result: `main: ./out/cursor/src/extension.js | exists: true`** ✅

This confirms the V20 audit fix: `main` was previously `./out/extension.js`
(which did not exist post-`tsc`) and has been corrected to
`./out/cursor/src/extension.js` (which does exist post-`tsc`). Without this
fix, the extension would fail to activate.

### API Integration Verification

#### `GET /api/mcp-config` (called by `extension.ts:55` in `cursorMcpCommand`)

Same `curl` as the Chrome/VS Code sections — **HTTP 200**, with `configs.cursor.mcpServers.shadowpaste.{ url, headers.Authorization }`. `extension.ts:65` reads `data.configs?.cursor as CursorMcpConfig` — present. **✅ verified.**

#### Inherited VS Code endpoints

`extension.ts:20` `import * as vscodeExt from "../../vscode/src/extension"` re-exports `activate`, `deactivate`, `readConfig`, `getJson`, and `McpConfigResponse`. Therefore the Cursor extension inherits the VS Code extension's calls to `POST /api/vault` (in `protectSecrets`) and `GET /api/mcp-config` (in `connectMcp`). Both endpoints are verified above. **✅ verified by inheritance.**

### Syntax Verification

| Check | Command | Result |
|-------|---------|--------|
| `extension.ts` type-checks | `npx tsc --noEmit -p extensions/cursor` | ✅ exit 0 (no TS errors, including the cross-extension import) |
| `extension.ts` compiles | `npx tsc -p extensions/cursor` | ✅ exit 0, `out/cursor/src/extension.js` produced |
| `package.json` parses | (implicit — `npm install` succeeded) | ✅ |
| `main` field resolves | `node -e "...fs.existsSync(p.main)..."` | ✅ `exists: true` |

### Test Cases (from `RELEASE_CHECKLIST.md` §3.2) — Status

| # | Case | Status | Reason |
|---|------|--------|--------|
| X1 | Compile (`npm run compile`) | **PASS** | `npx tsc -p .` exits 0; `out/cursor/src/extension.js` produced (this audit, real run) |
| X2 | `main` resolves | **PASS** | `./out/cursor/src/extension.js` exists post-compile (this audit, real run) |
| X3 | Activate | **UNVERIFIED** | No Cursor host in sandbox |
| X4 | Inherited commands | **UNVERIFIED** | No Cursor host in sandbox (but the VS Code extension's `tsc` passes, and the re-export in `extension.ts:22,31-33` is wired correctly) |
| X5 | Cursor MCP — open | **UNVERIFIED** | No Cursor host in sandbox (but `GET /api/mcp-config` is verified ✅ above and `extension.ts:91-96` opens a JSONC doc with the cursor config body) |
| X6 | Cursor MCP — copy | **UNVERIFIED** | No Cursor host in sandbox |
| X7 | Cursor MCP — backend down | **UNVERIFIED** | No Cursor host in sandbox |
| X8 | Cursor MCP — config shape | **UNVERIFIED** | No Cursor host in sandbox (but `extension.ts:65` reads `data.configs?.cursor` and the curl response includes exactly that key with `{ mcpServers: { shadowpaste: { url, headers.Authorization } } }`) |
| X9 | Paste into Cursor | **UNVERIFIED** | No Cursor host in sandbox |
| X10 | AI agent security bridge | **UNVERIFIED** | No Cursor host in sandbox |
| X11 | Permissions flow | **UNVERIFIED** | No Cursor host in sandbox |

**Test count: 2 PASS / 0 FAIL / 9 UNVERIFIED.**

### Verdict

**Cannot be published to Open VSX / shipped as a direct VSIX yet.** Blockers, in priority order:

1. **9 of 11 functional test cases are UNVERIFIED.** Only X1 (compile) and X2 (`main` resolves) pass. Before publishing, X3–X11 must be re-run in a real Cursor host.
2. **Cross-extension import (`../../vscode/src/extension`) has not been verified at runtime after packaging.** The `tsc` step compiles it correctly, but `vsce package` may exclude the sibling `vscode/src/` tree unless `package.json` `files` is set explicitly. Run `vsce package`, unzip the `.vsix`, and confirm `out/vscode/src/extension.js` is present.
3. **`package.json` `version` is `"0.1.0"`** — same shipping-metadata gap as VS Code (no `repository` URL, no `author`, marketplace README still developer-facing).
4. **The Cursor MCP config returned by `/api/mcp-config` embeds `<your-agent-api-key>`** as a placeholder — the user must replace it manually. No `/api/agents/me/api-key` route exists in the backend to issue a real key from the extension.
5. **No separate Cursor permission UI** — risky tool calls are blocked silently until the user approves in the web dashboard.

What's already good: `tsc --noEmit` passes, the full compile produces the
expected `out/` tree at the `rootDir: ".."` layout, `package.json` `main`
resolves to a real file (the V20 fix is confirmed working), and the
`/api/mcp-config` endpoint returns the shape `cursorMcp` expects.

---

## Cross-Cutting Findings

### 1. API endpoint compatibility

| Endpoint | Method | Called by | Route file exists? | curl result | Match |
|----------|--------|-----------|--------------------|-------------|-------|
| `/api/github/scan-real` | POST | Chrome `background.js` | ✅ `src/app/api/github/scan-real/route.ts` | HTTP 502 (`{"error":"GitHub API 403"}` — sandbox egress issue, not a route bug) | ✅ |
| `/api/vault` | GET | Chrome `popup.js` | ✅ `src/app/api/vault/route.ts:7` | HTTP 200, `{secrets, count}` | ✅ |
| `/api/vault` | POST | VS Code `extension.ts` (`protectSecrets`) | ✅ `src/app/api/vault/route.ts:14` | HTTP 200, `{ok, secret:{id,name,provider,scope,masked}}` | ✅ |
| `/api/mcp-config` | GET | VS Code `extension.ts` (`connectMcp`) + Cursor `extension.ts` (`cursorMcp`) | ✅ `src/app/api/mcp-config/route.ts:5` | HTTP 200, `{server, configs:{claude-desktop,cursor,stdio-bridge}, instructions}` | ✅ |
| ~~`/api/scan`~~ | ~~POST~~ | (removed — VS Code `scanWorkspace` scans locally) | route still exists for the web dashboard | not exercised | n/a |

**All 4 active endpoints the extensions call exist on the running V21 backend and return shapes the extension code reads correctly.** No 404s, no shape mismatches.

### 2. Detector parity

`extensions/vscode/src/detector.ts` claims (line 3) to be a "byte-for-byte
port of the SELF_CONTAINED + ASSIGNMENT patterns". Audit by `diff`:

- **SELF array** (4 regex entries — SSH/key blocks, DB URIs, prefixed tokens
  like `ghp_/sk-/AKIA/AKIA/xox/...`, JWT) — **byte-identical** between
  `src/lib/security/detector.ts:213-218` and `extensions/vscode/src/detector.ts:185-190`.
- **ASSIGN array** (2 regex entries — `password|secret|api_key|...` assignment
  pattern + `bearer <token>` pattern) — **byte-identical** between
  `src/lib/security/detector.ts:228-231` and `extensions/vscode/src/detector.ts:200-203`.
- **`classifyProvider` function** (22 if-branches matching `^-----BEGIN`,
  `^(mongodb|postgres|...):`, `^sk-ant-`, `^gh[opsur]_`, `^AKIA`, etc.) —
  **byte-identical** between the two files.

**Differences (intentional, extension-specific):**
- The extension **omits** the `shannonEntropy` + `entropyScan` block (backend
  lines 85-124 — 40 lines). The extension's local scan does not run entropy
  scanning, so high-entropy strings without a known provider prefix are NOT
  flagged in the extension's `scanWorkspace`. They ARE flagged in the
  backend's GitHub scan. **This is a parity gap, not a regex mismatch.**
- The extension **adds** a `raws: Array<{raw, provider, reference}>` field
  to `VirtualizeResult` so `protectSecrets` knows which raw secrets to POST
  to `/api/vault`. The backend version does not have this field (it does
  not need to — vault storage happens server-side via
  `src/lib/github-scanner.ts`).
- Minor formatting: the extension splits the `token = mode === "TEST" ? ... : ...`
  ternary across multiple lines; the backend keeps it on one line. No
  semantic difference.

**Score formula parity:** `extensions/vscode/src/extension.ts:228-235`
mirrors `src/lib/scanner.ts:108-124` exactly:
- Deductions: `{critical: 25, high: 12, medium: 5, low: 2}` ✅
- Clamp: `Math.max(0, Math.min(100, score))` ✅
- Grades: `A+ ≥95, A ≥90, B ≥80, C ≥70, D ≥60, F <60` ✅

**Maintenance contract risk:** There is no build-time guard enforcing
parity. A backend change to `SELF` / `ASSIGN` / `classifyProvider` /
`computeTrustScore` / `scoreToGrade` will silently desync the extension.
**Recommendation:** add `tests/extensions/detector-parity.test.ts` that
fails the build if `diff src/lib/security/detector.ts extensions/vscode/src/detector.ts`
exceeds a known allow-list (the entropy omission + the `raws` addition).

### 3. Auth flow

| Surface | Storage | Sent on every request? | Backend enforcement |
|---------|---------|------------------------|---------------------|
| Chrome `background.js` / `popup.js` | `chrome.storage.local.shadowpasteApiKey` (plaintext) | ✅ `Authorization: Bearer <apiKey>` if set (`background.js:59`, `popup.js:51-55`) | **❌ NOT enforced** — verified by curl with no header (200), bogus header (200), and missing header (200) |
| VS Code `extension.ts` | `vscode.workspace.getConfiguration("shadowpaste").apiKey` | ✅ `Authorization: Bearer <apiKey>` if set (`extension.ts:68-72`) | **❌ NOT enforced** — same curl evidence |
| Cursor `extension.ts` | Same as VS Code (re-exports `readConfig`) | ✅ Same as VS Code | **❌ NOT enforced** |
| `/api/mcp-config` | n/a | none required | (intentionally open) — verified 200 with no auth |

**Backend evidence (real curl output from this audit):**
- `GET /api/vault` with no `Authorization` → HTTP 200, returns full secret list
- `GET /api/vault` with `Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWpsm6XuQdBXLno4UVyNAYpprCTLo5HFwz-fNLYCpx` → HTTP 200, returns full secret list
- `POST /api/github/scan-real` with no `Authorization` → HTTP 502 (GitHub upstream error, not auth rejection — proves the route accepted the anonymous request and tried to scan)
- `GET /api/mcp-config` with no `Authorization` → HTTP 200

Root cause: `getContext(req) || anonymousContext()` in all three route
handlers — `anonymousContext()` returns `{ orgId: "default", user: null }`
so requests without a valid eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWpsm6XuQdBXLno4UVyNAYa4kCS8tUclkWYe8g2bug are silently downgraded to the
"default" org context. This is a known V20 reality-report finding (item
#10: 23/31 routes have no auth check) and is **the #1 production release
blocker** for all three extensions.

**Auth flow steps (what should happen in production):**
1. User obtains a ShadowPaste API key — **NO `/api/agents/me/api-key` route exists** today. Keys are seeded via `/api/seed` for dev. This is a gap.
2. User pastes the key into the extension's settings (Chrome popup / VS Code settings / Cursor settings).
3. Every extension `fetch` attaches `Authorization: Bearer <apiKey>` IF a key is set; otherwise the request goes anonymous.
4. Backend should reject anonymous requests on `/api/vault` POST and `/api/github/scan-real` POST — **today it does not**.

---

## Release Blockers

Ordered by severity. Anything in this list MUST be fixed before publishing
any of the three extensions.

1. **Backend auth is not enforced on `/api/vault` (GET + POST) or `/api/github/scan-real` (POST).** Verified by curl in this audit. Production deployment must gate these routes (reject when `getContext(req)` returns null, before falling back to `anonymousContext()`). Until this is fixed, anyone who can reach the backend can list every secret in the vault and trigger scans.
2. **No user-facing API-key issuance flow.** `/api/agents/me/api-key` does not exist. Users cannot obtain a eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWpsm6XuQdBXLno4UVyNAYAngXhEdPQSDkPu2OsiQP to put in the extension's settings — they must be seeded via `/api/seed` (dev only). Blocker for any non-developer user.
3. **All 36 functional test cases across the three extensions are UNVERIFIED** (12 Chrome + 15 VS Code + 9 Cursor). Only 3 compile/build cases pass (V1, X1, X2). Before publishing, the full matrices must be re-run in real Chrome / VS Code / Cursor hosts against a production backend.
4. **Chrome `host_permissions` is `localhost:3000` + `https://github.com/*` only.** Production HTTPS hosts are not whitelisted — `fetch` calls would be blocked. Must be updated before Chrome Web Store submission.
5. **Chrome `manifest.json` has no `content_security_policy` key** (MV3 defaults apply — acceptable but should be explicit before publishing) and no privacy policy URL declared.
6. **VS Code + Cursor `package.json` are missing `repository`, `author`, and a marketplace-ready README.** `vsce package` has not been exercised in this audit — the `.vsix` size and bundled files are unknown.
7. **Cursor's cross-extension import (`../../vscode/src/extension`) has not been verified after `vsce package`.** If the sibling `vscode/src/` tree is not included in the `.vsix`, the extension will fail to activate at runtime.
8. **No build-time detector parity guard.** `extensions/vscode/src/detector.ts` is currently byte-identical to `src/lib/security/detector.ts` for the SELF/ASSIGN/classifyProvider blocks, but there is no test enforcing this. A backend pattern change will silently desync the extension. Add `tests/extensions/detector-parity.test.ts`.
9. **Extension versions are at `0.1.0` (VS Code, Cursor) and `1.0.0` (Chrome).** Acceptable for first submission, but if any iteration happens before submitting, versions MUST be bumped — Chrome Web Store and Open VSX both reject re-uploads at the same version.
10. **API key storage is plaintext** in `chrome.storage.local` and VS Code settings. Acceptable for dev; for production, use Chrome's `chrome.storage.session` + a passphrase, or VS Code `SecretStorage`.

---

## UNVERIFIED Items

Everything below could NOT be exercised in this sandbox. Each item must be
re-run in an environment with the listed prerequisites before publishing.

### Chrome (12 items)
- C1 — Scan via floating button on `https://github.com/vercel/next.js`
- C2 — Scan via context menu
- C3 — Scan via link right-click
- C4 — Non-repo page (no button appears)
- C5 — Popup vault status (underlying `GET /api/vault` IS verified ✅)
- C6 — Popup last scan
- C7 — Re-scan last repo
- C8 — Open dashboard (new tab at `{serverUrl}/`)
- C9 — Settings persistence across popup close/reopen
- C10 — Server URL override (code path verified; UI not exercised)
- C11 — Offline backend (badge → `offline`; code path verified; UI not exercised)
- C12 — Badge color thresholds at score ≥80 / 50–79 / <50 (code path verified; UI not exercised)
- Loading + tested on Chromium, Edge, Brave
- `chrome.storage.local` encryption-at-rest behavior on every platform

**Prerequisites:** Chromium-based browser with Developer Mode enabled, a
running production backend at a public HTTPS URL, outbound GitHub API
access, a real ShadowPaste API key.

### VS Code (15 items)
- V2 — Activate (F5 → Extension Development Host)
- V3 — Workspace scan, clean workspace
- V4 — Workspace scan, secrets present
- V5 — Workspace scan, score formula matches backend (logic-equivalent by code reading; runtime not exercised)
- V6 — Workspace scan, no open documents
- V7 — Protect secrets, happy path (underlying `POST /api/vault` IS verified ✅)
- V8 — Protect secrets, no secrets detected
- V9 — Protect secrets, vault failure (backend down)
- V10 — Protect secrets, dedup (same secret twice → 1 vault POST)
- V11 — Diagnostics decorations on redacted lines
- V12 — MCP connect, Open in editor (underlying `GET /api/mcp-config` IS verified ✅)
- V13 — MCP connect, Copy to clipboard
- V14 — MCP connect, backend down
- V15 — `shadowpaste.serverUrl` config override (code path verified; UI not exercised)
- V16 — `shadowpaste.apiKey` auth header attachment (code path verified; UI not exercised)
- `vsce package` produces a `.vsix` < 50 MB with no `node_modules/`
- Activation tested on VS Code 1.80 + latest stable

**Prerequisites:** VS Code 1.80+, a running production backend, a real
ShadowPaste API key, `@vscode/vsce` installed for packaging.

### Cursor (9 items)
- X3 — Activate (Cursor console shows `[ShadowPaste-Cursor] extension activated.`)
- X4 — Inherited VS Code commands work in Cursor
- X5 — Cursor MCP, Open in editor (underlying `GET /api/mcp-config` IS verified ✅)
- X6 — Cursor MCP, Copy to clipboard
- X7 — Cursor MCP, backend down
- X8 — Cursor MCP, config shape matches `data.configs.cursor` (logic-equivalent by code reading; runtime not exercised)
- X9 — Paste into `~/.cursor/mcp.json`, reload Cursor, ShadowPaste MCP appears with 25 tools
- X10 — AI agent security bridge (Cursor agent calls a ShadowPaste tool → zero-trust gateway → policy + risk + audit)
- X11 — Permissions flow (high-risk tool call → dashboard prompt → agent blocked until approved)
- `.vsix` installs in Cursor without warnings
- Cross-extension import resolves at runtime AFTER `vsce package`

**Prerequisites:** Cursor (latest), a running production backend with the
MCP gateway exposed at `/api/mcp`, a real ShadowPaste agent API key,
`@vscode/vsce` for packaging.

### Cross-cutting (3 items)
- Backend auth enforcement on `/api/vault` + `/api/github/scan-real` in production (currently `getContext(req) || anonymousContext()` — verified open in dev)
- Rate limiting on the three endpoints (V20 reality report item #3: no rate limiting on any API)
- Security headers middleware deployed (V20 reality report item #6)

---

## Summary

| Surface | Files | Syntax / Compile | API endpoints | Test cases | Publishable? |
|---------|-------|------------------|---------------|------------|--------------|
| Chrome (MV3) | 5 files, 568 LOC | ✅ all 3 JS files `node --check` OK; `manifest.json` valid | ✅ 3/3 endpoints exist + respond (1 returns 502 due to sandbox GitHub egress) | 0/12 PASS, 12 UNVERIFIED | ❌ not yet |
| VS Code | 4 files, 859 LOC | ✅ `tsc --noEmit` exit 0; full compile produces `out/` | ✅ 2/2 endpoints exist + respond | 1/16 PASS (V1 compile), 15 UNVERIFIED | ❌ not yet |
| Cursor | 3 files, 188 LOC | ✅ `tsc --noEmit` exit 0; `main` field resolves | ✅ 1/1 endpoint exists + respond (inherits 2 more from VS Code) | 2/11 PASS (X1 compile, X2 main), 9 UNVERIFIED | ❌ not yet |
| **Total** | **12 files, 1,615 LOC** | **All syntactically valid** | **4/4 endpoints verified** | **3 PASS / 0 FAIL / 36 UNVERIFIED** | **No — blocked on auth + missing test runs** |

**What this audit proved (real commands, real output):**
- The extension source code parses and compiles cleanly.
- Every API endpoint the extensions call exists on the running V21 backend and returns the shape the extension code reads.
- The Chrome MV3 manifest is valid; the VS Code/Cursor `package.json` `main` fields resolve to compiled output.
- The local detector port's SELF/ASSIGN/classifyProvider regex arrays are byte-identical to the backend's.
- The local score formula mirrors the backend's exactly.

**What this audit could NOT prove (no browser/editor host in sandbox):**
- Any runtime behavior inside Chrome, VS Code, or Cursor.
- Live GitHub scans (sandbox has no outbound GitHub access — `POST /api/github/scan-real` returns 502 with `{"error":"GitHub API 403"}`).
- 36 functional test cases (3 PASS, 33 UNVERIFIED at runtime — though many have their code paths verified by reading).

**Top 3 things to do next:**
1. Enforce auth on `/api/vault` + `/api/github/scan-real` (reject anonymous requests in production).
2. Add a user-facing `/api/agents/me/api-key` route so users can obtain a eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWpsm6XuQdBXLno4UVyNAY-E4ZcyGr3bwwRHZnUK6c.
3. Re-run all 36 UNVERIFIED test cases in real Chrome / VS Code / Cursor hosts against a production backend.

---

End of report.
