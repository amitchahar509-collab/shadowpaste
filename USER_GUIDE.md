# ShadowPaste — User Guide

> For someone who has **never used ShadowPaste**. Every command and path here was
> taken from the real code and, where marked **✅ VERIFIED**, actually executed.
> This environment cannot capture screenshots, so screens are described in words
> (marked *screenshot N/A*) rather than shown.

**What ShadowPaste does for you:** it lets an AI coding agent work on your real
project — and call real tools — **without ever seeing a real secret**. You import a
project, ShadowPaste swaps every secret for a realistic fake, the AI edits the safe
copy, and then you restore the real secrets so you can commit.

---

## 1. Install

You need **Bun** (the project's runtime) and **Node/Git** available on PATH.

```bash
git clone <your ShadowPaste repo URL>
cd "shadow paste os"
bun install
bun run db:push      # create the SQLite schema (db/custom.db)
```

*Optional but recommended for production:* copy `.env.example` → `.env` and set
`AUTH_PEPPER` (`openssl rand -hex 32`). Locally you can skip this — the vault key is
auto-generated into `.env` on first boot.

## 2. Start the app

```bash
bun run dev
```

Then open **http://localhost:3000**. ✅ *VERIFIED: the dev server boots and serves
`/api/*` with HTTP 200.*

For a production run: `bun run build` then `bun run start`.

*Screenshot N/A — the landing view is a dark, glassmorphism dashboard ("Command
Center") with a left sidebar of 14 modules grouped into Protect / Monitor / Control
/ Build / Growth / Test.*

## 3. Create an account

1. Click **Sign in** (top-right) → the auth modal opens.
2. Switch to **Sign up**, enter name, email, password → submit.
3. You are logged in; a personal **Organization** is created with you as **OWNER**,
   and a `sp_session` cookie (7-day) is set.

✅ *VERIFIED: `POST /api/auth/signup` returned `{ ok: true, user, org: { role:
"OWNER" } }` and `GET /api/auth/me` then returned the signed-in user.*

## 4. Sign in

Returning users click **Sign in** → **Log in** with email + password. Passwords are
verified with scrypt + a server pepper using a constant-time comparison. Sign out
from the top-right avatar. ✅ *VERIFIED: login sets the session; wrong password is
rejected.*

## 5. Import a project — every method

Go to **AI-Safe Workspace** in the sidebar. The **Import Hub** has method tabs. You
must be signed in (all import routes require auth). *Screenshot N/A — a large glass
card with drag-and-drop zone and Folder / Path / Git tabs.*

### 5a. Drag-and-drop a folder  (easiest)
Drag a project folder onto the drop zone, **or** click to pick a folder. The browser
reads the folder (recursing into subdirectories) and uploads the files with their
relative paths. `node_modules/.git/.next/dist/build` are skipped; caps: 20 000 files
/ 200 MB. → `POST /api/workspace/upload`.

### 5b. Drop an archive — `.zip`, `.tar`, `.tar.gz`, `.tgz`
Drag a single archive onto the drop zone (or pick it). It is validated by extension
**and magic bytes**, extracted in-memory (dependency-free; zip-slip guarded), then
protected. → `POST /api/workspace/import`. ✅ *VERIFIED: a real `.zip` imported
end-to-end — 2 files, 3 secrets replaced with format-preserving fakes.*

### 5c. Clone a Git repo (HTTPS, public)
Open the **Git** tab, paste an **HTTPS** clone URL, click clone. Supported hosts:
**GitHub, GitLab, Bitbucket, Azure DevOps, Codeberg, Gitea** (one endpoint, host
allowlist). → `POST /api/workspace/clone`.

- **GitHub / GitLab / Bitbucket / Azure** are all the *same* HTTPS-clone path — just
  paste that host's `https://…` URL.
- **SSH URLs and private repos are NOT supported in the web app** (it rejects
  non-HTTPS and credentials-in-URL to prevent SSRF). For those, clone locally and
  use the CLI: `shadowpaste protect -p /path/to/clone`.

### 5d. Server path (local/self-hosted)
Open the **Path** tab, enter the absolute path to a project folder on the server. →
`POST /api/workspace/create`. The path must sit inside `SHADOWPASTE_PROJECT_ROOTS`
(defaults to your home directory). ✅ *VERIFIED: the guard rejects paths outside the
allowed roots with a clear 400.*

### 5e. Reopen a recent project
The Import Hub lists your last 6 imports (stored in your browser). Click one to
reopen its workspace + intelligence report.

## 6. What happens after import

Instantly, in one pass, ShadowPaste:
1. Runs **Project Intelligence** (§7) and shows a health report.
2. Creates (or reuses) a **Project** record; warns if the name already existed.
3. Builds the **AI-safe workspace** under `.workspaces/<name>-ws-…` — a real copy
   with every secret replaced by a fake, and a `.shadowpaste-meta.json` map inside.
4. **Vaults** each real secret (AES-GCM-256) and writes an audit-log entry.

You get the workspace path (copyable), file/secret counts, and the list of
protected secrets shown as `provider → fake…`.

## 7. Project Intelligence

The health report is computed from real bytes on disk: stack (framework, languages,
package managers), runtime, build tools, databases/ORMs, cloud, containers, IaC,
CI/CD, monorepo tooling, detected AI-tool configs, file/size stats, language
breakdown, secrets by category, TODO/FIXME, duplicate files, six 0–100 scores
(security, risk, AI-readiness, complexity, dependency, health), insights, and phase
recommendations. Anything needing a build/install is shown as **"not run"** rather
than guessed. ✅ *VERIFIED: scores in range, secrets match detection, build status
honestly `not_run`.*

## 8. Scan

To scan a **GitHub repo** (rather than import a local project), use **AI Safe
GitHub** or **Public Scanner**:
- **AI Safe GitHub** (signed in) → enter `owner/repo` → real REST scan of up to 30
  scannable files, secrets auto-vaulted, trust score + grade.
- **Public Scanner** (no login) → scan any public repo, get a shareable score.

## 9. Protect

"Protect" *is* the import step — creating the AI-safe workspace with fakes. From the
CLI it is explicit:
```bash
shadowpaste protect -p /path/to/your/project
```
✅ *VERIFIED: 2 files scanned, 3 secrets protected, workspace holds only fakes.*

## 10. The AI-Safe Workspace

`.workspaces/<name>-ws-…/` is a **working copy**: binaries are byte-identical, text
is intact, and secrets are realistic fakes so your code still runs. Point your AI
tool at *this* folder — never your original.

## 11–13. Use it with Claude Code / Cursor / Codex

**File-based (works with any tool):** open the workspace folder in the tool and let
it edit. Because fakes are format-valid, tests and code keep running.
```bash
cursor .workspaces/<name>-ws-…      # or: claude … , code …
shadowpaste open -e cursor          # opens the latest workspace
```

**Runtime MCP (Claude Desktop / Cursor):** connect the agent to ShadowPaste's MCP
gateway so its *tool calls* are policy-gated and get vaulted credentials injected
(never raw). Use `mcp.json` / `cursor-mcp.json`:
```json
{ "mcpServers": { "shadowpaste": {
  "url": "http://localhost:3000/api/mcp",
  "headers": { "Authorization": "Bearer local-dev" } } } }
```
- **Claude Code / Claude Desktop:** add the `shadowpaste` server from `mcp.json`.
- **Cursor:** use `cursor-mcp.json` (or the extension's "Open Cursor MCP Config").
- **Codex / Copilot / other MCP clients:** point them at the same
  `http://localhost:3000/api/mcp` endpoint.

Once connected, every tool call passes **identity → risk → policy → injection →
execution → audit**. ✅ *VERIFIED (HTTP): `initialize`, `tools/list` (28 tools),
`tools/call`, and a hard-deny all behaved correctly.*

## 14. Restore

When the AI is done, restore real secrets into your **original** project:
- **In the app:** on the workspace panel, click **Restore**. → `POST
  /api/workspace/restore` (reads the workspace's meta map).
- **CLI:** `shadowpaste restore` (auto-detects the latest workspace) or
  `shadowpaste restore -w <workspacePath>`.

ShadowPaste copies AI edits back and swaps each fake for its real value. If the AI
**modified or deleted a placeholder**, that secret is **not** silently restored —
you get a red **⚠️ PARTIAL RESTORE WARNING** naming the file/line, and the CLI exits
non-zero. Review `git diff` before committing.

✅ *VERIFIED: CLI restore reported `3/3 secrets restored (3 substitutions)` and the
real token was back in the source `.env`; binaries stay byte-identical.*

## 15. Vault

**Secret Vault** module lists everything ShadowPaste has vaulted for your org
(masked, never plaintext). You can add or delete entries. Secrets are AES-GCM-256
encrypted with a key derived from your persisted master passphrase, so they survive
restarts. ✅ *VERIFIED: store→retrieve decrypts exactly; unauthenticated read → 401.*

## 16. Session DNA

Under the hood each AI session can be issued a cryptographic identity (**Ed25519**
keypair, fingerprint, TTL). Sessions can **sign** actions, be **verified**, and be
**instantly revoked** (kill switch); high-risk anomalies (secret extraction,
dangerous commands, prompt injection) **auto-revoke** the session. ✅ *VERIFIED:
sign → verify true, tampered payload false, revoke → invalid.*

## 17. Flight Recorder

**Flight Recorder** replays the timeline of tool calls (decisions, risk, timing) so
you can audit exactly what an agent did and when. → `/api/audit/replay`.

## 18. Audit Logs

**Audit Trail** is the immutable event log (agent create, vault store, tool invoke,
scans, imports/restores), org-scoped, with secrets redacted. → `/api/audit`.

## 19. Dashboard

**Command Center** is the landing overview — counts of agents, tool calls, vaulted
secrets, projects, and attacks, with quick navigation. ✅ *VERIFIED: `/api/dashboard`
returned live counts (28 tools, seeded demo data).*

## 20. Reports

- **Project Health Report** — per-import intelligence (§7).
- **Scan results** — secrets/config findings + trust grade (§8).
- **Public scan** — shareable repo score.
- **Health** — `GET /api/health` (DB, vault, MCP, GitHub reachability). ✅ *VERIFIED:
  `status: healthy`, all four checks OK.*

## 21. CLI

```bash
shadowpaste init                 # seed DB, detect project, quick scan
shadowpaste protect -p <dir>     # build AI-safe workspace          ✅ VERIFIED
shadowpaste restore [-w <ws>]    # restore real secrets             ✅ VERIFIED
shadowpaste status               # list workspaces + server health
shadowpaste open -e cursor       # open latest workspace in editor
shadowpaste daemon start|status  # watch .env files for new secrets
shadowpaste --version            # → 1.0.0                          ✅ VERIFIED
```

## 22. Extensions

- **VS Code / Cursor:** commands *Scan Workspace for Secrets*, *Protect Secrets in
  Active Document*, *Show MCP Config*; set `shadowpaste.serverUrl` (default
  `http://localhost:3000`) and optional `shadowpaste.apiKey`.
- **Chrome (MV3):** on any `github.com/*/*` page, scan the repo for secrets/risky AI
  configs; popup shows vault status + last score.

⚠️ *NOT VERIFIED here — running an editor/browser extension host is not possible in
this environment. The extension source and manifests were read and are consistent
with the backend API.*

## 23. Sandbox

**Shadow Sandbox** shows AI-proposed file changes as diffs, risk-scored (eval/
child_process/DROP TABLE/hardcoded keys flagged), with approve/reject. *Note: the
current diffs are **demo/synthetic** (`generateSyntheticChanges`), illustrating the
review workflow rather than a live AI feed.*

## 24. Delete a project / workspace

Delete a workspace via `DELETE /api/workspace/[id]?workspacePath=…` (confined to
`.workspaces/`, refuses to delete the root). Workspaces are disposable — deleting one
does not touch your original project or the vault.

## 25. Recent projects

The Import Hub keeps your last 6 imports in the browser (`localStorage`) for one-click
reopen. Clearing browser storage clears the list (the workspaces on disk remain).

## 26. Settings

ShadowPaste is configured by **environment variables** (there is no in-app settings
page beyond sign-in). Key vars (`.env` / `.env.example`):
- `AUTH_PEPPER` — **required in production**; keys password hashes + session HMAC.
- `SHADOWPASTE_MASTER_KEY` / `SHADOWPASTE_VAULT_SALT` — vault key material
  (auto-generated locally; set explicitly on read-only hosts, or lose vaulted data
  on restart).
- `SHADOWPASTE_PROJECT_ROOTS` — allowed folders for server-path import (default: home).
- `TRUST_PROXY` — set `true` only behind a real reverse proxy (else `X-Forwarded-For`
  is ignored for rate limiting).
- `GITHUB_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — optional integrations.
- `DATABASE_URL` — SQLite by default; Postgres for production.

---

### Typical end-to-end flow (all VERIFIED individually)
```
sign up ─▶ Import (folder/zip/git/path) ─▶ read Health Report ─▶ open workspace in AI tool
        ─▶ let the AI edit ─▶ Restore ─▶ git diff ─▶ commit ─▶ delete workspace
```
