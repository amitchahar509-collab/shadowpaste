# ShadowPaste — Feature & Usage Guide

> Every command, path, limit, and capability in this guide was verified against the
> source in this repository. Where a capability does **not** exist, it is called out
> explicitly rather than implied.

---

## Section 1 — Product Overview & Core Value Proposition

**ShadowPaste is the safe runtime bridge between your real codebase and AI coding agents.**

AI tools (Claude Code, Cursor, Copilot, Windsurf…) need to read your actual repository
to be useful — which means your `.env`, your cloud keys, and your database URLs land in
a model's context window. ShadowPaste removes that trade-off.

### The core loop

1. **Import a project** — folder, archive, local path, or a public Git URL. ShadowPaste
   analyses it automatically (framework, runtime, dependencies, AI-tool configs) before
   you do anything else.
2. **Detect & virtualize secrets** — 500 patterns across 322 providers plus entropy
   analysis find real credentials; each one is replaced with a *format-compatible fake*
   (same shape, dead value) and the real value is encrypted into a local vault.
3. **Let the AI work** — you open the generated **AI-safe workspace** in your AI tool.
   Code still runs and tests still pass because the fakes keep the right format, but the
   real credential never enters the model's context.
4. **Restore, byte-for-byte** — when you're done, ShadowPaste copies the AI's edits back
   into your real project and swaps the fakes for the real secrets. Files with no secret
   mapping (images, fonts, archives, compiled binaries) are copied **byte-for-byte**, so
   nothing is corrupted in the round trip.

---

## Section 2 — Complete Feature Matrix

### 2.1 Project Ingestion Engine

Six import paths, all of which end in the same protected-workspace pipeline.

| Method | Entry point | Notes |
|---|---|---|
| **Folder drag-and-drop** | Import Hub dropzone | Directory entries read recursively in the browser |
| **Folder picker** | *Select folder* button | `<input webkitdirectory>` |
| **Archive** | *Select archive* / drop | `.zip`, `.tar`, `.tar.gz`, `.tgz` |
| **Local / network path** | *Local path* tab | Absolute path inside an allowed root |
| **Git clone** | *Git repo* tab | **Public HTTPS only** |
| **Recent projects** | Recents strip | One-click reopen of an existing workspace |

**Implementation facts**

- Archive extraction is **dependency-free** (`src/lib/archive.ts`): a ZIP reader plus a
  ustar/GNU **tar** parser and gzip via Node's built-in `zlib`.
- **Zip-slip protection**: every entry path is resolved against the destination and
  rejected if it escapes. Absolute paths, `../`, and backslash traversal are all blocked.
- **Symlink entries in tar archives are not materialised** (only regular files extract).
- Caps: archive upload **200 MB**; folder upload **20,000 files / 200 MB**;
  extraction limits **20,000 files / 500 MB expanded**.
- A single wrapping folder (`repo-main/`) is auto-detected and stripped.
- `node_modules`, `.git`, `.next`, `dist`, `build`, `.workspaces` are skipped on ingest.
- Git clone is `--depth 1 --single-branch --no-tags`, host allow-listed to GitHub, GitLab,
  Bitbucket, Azure DevOps, Codeberg and Gitea, executed via `execFileSync` with an argv
  array (no shell) so a URL can never be read as a git option, and with
  `GIT_TERMINAL_PROMPT=0` so private repos fail fast instead of hanging.

**Automatic project intelligence** runs on every import (`src/lib/project-intelligence.ts`)
and returns, without any configuration: language, framework, runtime, package manager,
build tool, database, ORM, cloud provider, containerisation, IaC, CI/CD, monorepo tooling,
detected AI-agent configs, file/folder counts, size, largest files, config/lock/env files,
language distribution, TODO/FIXME counts, duplicate-file groups, and six scores
(health, security, risk, AI-readiness, complexity, dependency) plus insights and
per-stage recommendations.

> **Honest limitation:** build, type-check, lint, unused-dependency and circular-dependency
> analysis are **not run** during import — they require installing dependencies. The API
> reports `buildStatus: { status: "not_run", reason: … }` rather than faking a result.

### 2.2 Secret Detection Engine

- **500 patterns across 322 providers** (`src/lib/security/secret-patterns.ts`), covering
  cloud (AWS/GCP/Azure), AI/ML (OpenAI, Anthropic, HuggingFace…), payments (Stripe,
  PayPal, Square…), databases, CI/CD, communication, crypto/web3 and SaaS.
- **Entropy + contextual detection** for unknown/rotating secrets, plus assignment-style
  matches (`API_KEY=…`, `password: …`).
- **Structured credential types**: PEM blocks (RSA / EC / OpenSSH / DSA / PGP),
  certificates, JWTs and bearer tokens, database connection URIs
  (`postgres://`, `mysql://`, `mongodb+srv://`, `redis://`, `amqp://`, `ftp://`),
  OAuth tokens, webhook secrets, SSH public keys.
- Every finding carries `provider`, `scope`, `severity`, `detector`, `line`, and a
  **masked** rendering for display — the raw value is never used for UI output.

### 2.3 Secret Virtualization & Vault

- **Format-compatible fakes** (`src/lib/security/fake-secrets.ts`): the replacement keeps
  the provider's shape so parsers, SDK clients and tests still work.

  | Real | AI sees | Why it works |
  |---|---|---|
  | `sk-proj-abc123…` | `sk-proj-shadow-…` | Same OpenAI shape, dead credential |
  | `ghp_aBcDeFg…` | `ghp_shadow…` | Same GitHub prefix, invalid |
  | `AKIAIOSFODNN7EXAMPLE` | `AKIASHADOWFAKEKEY00` | Same AWS shape, fails checksum |
  | `postgresql://admin:pass@host` | `postgresql://shadow:shadow@shadow-db` | Valid URL, unreachable host |

- **Vault** (`src/lib/security/vault.ts`): **AES-GCM-256** encryption at rest via WebCrypto,
  with **HMAC-SHA256** capability tokens and **PBKDF2** passphrase wrapping
  (`src/lib/security/crypto.ts`). No third-party crypto dependency.
- The API returns **masked** values only — the raw secret is never serialised to a client.
  `GET /api/vault` requires an authenticated session and is scoped to your org.

### 2.4 AI-Safe Workspace

`createSafeWorkspace()` walks your project and writes a parallel copy to
`.workspaces/<project>-<id>/`:

- Text files in scannable formats are read, scanned, and written out with fakes substituted.
- Files with no findings and all non-scannable/binary files are **copied as-is**.
- `node_modules`, `.git`, `.next`, `dist`, `build` are skipped.
- Files over 500 KB are copied without scanning (performance guard).
- A `.shadowpaste-meta.json` is written **inside the workspace** holding the real↔fake
  mapping so `restore` needs nothing but the workspace path.

> ⚠️ `.shadowpaste-meta.json` contains the **real** secret values — that is how restore
> works. `.workspaces/` is gitignored by default. **Never commit it.**

### 2.5 Byte-Level Restore Engine

`restoreSecrets()` walks the workspace and writes back into the source project:

- A file **with** a secret mapping → decoded as text, each fake swapped back to the real
  value, written out. AI edits elsewhere in that file are preserved.
- A file **without** a mapping → **copied byte-for-byte** (`fs.copyFile`). This is what
  keeps PNGs, fonts, `.zip`s, compiled artifacts and any AI-added binary intact.
- Files the AI created are copied through; `.shadowpaste*` metadata is never restored.

### 2.6 Session DNA & Flight Recorder

- **Audit trail** — every mutating action writes an `AuditLog` row (org-scoped, with actor,
  action, target and metadata). Endpoints: `GET /api/audit`, `GET /api/audit-logs`;
  clearing requires authentication.
- **Flight Recorder** — timeline/replay view over recorded agent tool calls
  (`GET /api/audit/replay`).
- **Session DNA** — per-agent session fingerprints and capsules:
  `POST /api/session-dna/create`, `GET /api/session-dna/list`,
  `POST /api/session-dna/capsule`, `/verify`, `/war-test`.
- Secrets are **redacted** from recorded tool output before it is persisted.

### 2.7 MCP (Model Context Protocol) Security

ShadowPaste exposes an MCP endpoint at **`POST /api/mcp`** (JSON-RPC 2.0, protocol
`2024-11-05`) implementing `initialize`, `tools/list` and `tools/call`.

Every call runs the zero-trust gateway (`src/lib/gateway.ts`):

1. **Agent identity** — the `Authorization: Bearer <token>` header is SHA-256 hashed and
   mapped to an Agent record (auto-created on first use).
2. **Agent status gate** — a `revoked`, `suspended` or `quarantined` agent is denied
   before policy is even evaluated.
3. **Risk scoring** — each tool carries a risk level/score; the call is scored.
4. **Policy decision** — `allow_always`, `allow_once`, `ask` (held pending) or `deny`.
5. **Credential injection** — approved calls get a single-use, time-limited capability
   token; the raw secret is injected only for the duration of execution.
6. **Audit** — the decision, risk score and **redacted** output are written to the trail,
   and the agent's allowed/denied counters are updated.

### 2.8 Shadow Sandbox *(distinct from the AI-Safe Workspace)*

A real **git**-backed review lane: `initSandbox()` creates a repo under `.sandbox/`,
commits a baseline, normalises the base branch to `main`, and cuts an `ai/sandbox-<id>`
branch. AI changes are written to that branch, diffed (`getSandboxDiff`), risk-analysed,
then **merged on approval** (`mergeSandbox`) or discarded (`rejectSandbox`). All git
invocations use `execFileSync` with argv arrays — no shell, no command injection.

### 2.9 CLI & Web Dashboard

**CLI** (`cli/index.ts`) — actual commands:

| Command | Options | Purpose |
|---|---|---|
| `init` | `--server <url>` | Register the project with a running server |
| `protect` | `-p, --path <dir>` | Scan + create the AI-safe workspace |
| `restore` | `-w, --workspace <path>` | Restore real secrets + AI edits |
| `status` | `--server <url>` | Active workspaces + server health |
| `open` | `-e, --editor <cursor\|claude\|code>` | Open the workspace in an editor |
| `daemon <action>` | `start` \| `status` | Background file watcher |

> ❗ **There is no `shadowpaste scan` command.** Scanning happens as the first phase of
> `protect` (and on every dashboard import). Use `protect` to see what would be found.

**Web dashboard** — 14 modules: Command Center, AI-Safe Workspace, MCP Gateway,
Agent Identities, Permission Center, Secret Vault, Flight Recorder, Audit Trail,
Shadow Sandbox, AI Safe GitHub, Trust Scores, MCP Marketplace, Public Scanner,
Red Team Lab.

---

## Section 3 — Step-by-Step Usage Guide

### 3.1 Prerequisites & Setup

**Requirements:** Bun ≥ 1.3 (or Node ≥ 20), and `git` on `PATH` if you want clone-based
imports.

```bash
# 1. Install dependencies
bun install

# 2. Create your env file from the template
cp .env.example .env

# 3. Create the local database schema
bun run db:push
```

Minimum `.env` for local use:

```bash
DATABASE_URL=file:./db/custom.db
# Required in production (the server refuses auth operations without it):
#   openssl rand -hex 32
AUTH_PEPPER=
# Optional: widen where the workspace engine may read/write.
# Defaults to your home directory.
# SHADOWPASTE_PROJECT_ROOTS=/home/you/projects
```

**Start the server:**

```bash
bun run dev
```

If `bun run dev` fails on Windows (the script pipes through `tee`), use the portable form:

```bash
npx next dev -p 3000
```

Then open **http://localhost:3000**.

### 3.2 CLI Workflow — command by command

**Step 1 — protect (this is also your scan).**

```bash
bun run cli/index.ts protect -p /path/to/your/project
```

Output tells you files scanned, secrets replaced, and the workspace path:

```
  ✓ 3 files scanned
  ✓ 1 secrets protected with format-compatible fakes
  ✓ Workspace: .../.workspaces/your-project-ws-abc123
```

**Step 2 — open the *workspace* in your AI tool.** Point the agent at the workspace path,
never at your original project.

```bash
# either use the helper…
bun run cli/index.ts open -e cursor      # cursor | claude | code

# …or open it directly
claude ".../.workspaces/your-project-ws-abc123"
cursor ".../.workspaces/your-project-ws-abc123"
code   ".../.workspaces/your-project-ws-abc123"
```

Let the agent read, refactor, and run tests. It sees `sk-proj-shadow-…` where your real
key used to be.

**Step 3 — restore.**

```bash
# auto-detects the workspace…
bun run cli/index.ts restore

# …or target one explicitly
bun run cli/index.ts restore -w ".../.workspaces/your-project-ws-abc123"
```

```
  ✓ 1 secrets restored to source project
  ✅ Restore complete! Source project has real secrets back.
```

**Step 4 — review before committing.**

```bash
git diff        # AI edits are here; secrets should look untouched
git add -p
```

**Anytime — check state:**

```bash
bun run cli/index.ts status
```

> If ShadowPaste is installed globally as a binary, `shadowpaste <command>` is equivalent
> to `bun run cli/index.ts <command>`.

### 3.3 Web Dashboard Workflow

1. **Sign in.** Click **Sign in** (top-right) → *Create account & sign in*. Importing
   writes to disk and vaults secrets under your account, so it requires a session.
2. **Open *AI-Safe Workspace*** in the left sidebar (under **Protect**).
3. **Import a project** using any tab of the Import Hub:
   - **Upload / Drop** — drag a folder or an archive onto the dropzone, or use
     *Select folder* / *Select archive*.
   - **Local path** — paste an absolute path (must sit inside an allowed root).
   - **Git repo** — paste a **public HTTPS** clone URL.

   A progress banner shows the current phase with a **Cancel** button.
4. **Read the Project Health Report** — it appears automatically: health / AI-readiness /
   security rings, security-risk-complexity-dependency meters, detected technologies,
   file & folder counts, language distribution, smart insights, and recommendations
   tabbed by stage (Protect / Scan / Restore / AI Editing / Production).
5. **Review detected secrets** — the *Workspace ready* card lists every replacement as
   `path:line → fake`, with the provider and a `vaulted` badge.
6. **Copy the workspace path** and open it in Claude Code / Cursor / VS Code using the
   prepared commands in the card.
7. **Inspect the Vault** — *Secret Vault* module shows each stored credential masked, with
   provider and fingerprint. Raw values are never displayed or returned.
8. **Check the audit trail** — *Flight Recorder* for the agent-action timeline and
   *Audit Trail* for the immutable compliance log (CSV export available).
9. **Restore** — back in *AI-Safe Workspace*, press **Restore secrets**. The confirmation
   states how many secrets were restored and that AI edits were preserved.

### 3.4 MCP Server Integration (Claude Code / Cursor)

Register ShadowPaste as an MCP server so your agent's tool calls are risk-scored,
policy-gated and audited.

**Claude Desktop** — `claude_desktop_config.json`;
**Cursor** — `.cursor/mcp.json`; **Claude Code** — `.mcp.json` in the project root:

```json
{
  "mcpServers": {
    "shadowpaste": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer local-dev" }
    }
  }
}
```

- The bearer token is hashed (SHA-256) into a stable **agent identity**. Give each client
  its own token so the dashboard can score and govern them separately; `local-dev` is the
  built-in default identity.
- Verify the connection:

```bash
curl -s http://localhost:3000/api/mcp \
  -H "content-type: application/json" \
  -H "Authorization: Bearer local-dev" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

- Govern the agent in the dashboard: **Agent Identities** (trust score, or
  suspend/quarantine/revoke) and **Permission Center** (`allow_once` / `allow_always` /
  `ask` / `deny` per tool). A revoked agent is blocked before policy evaluation.

---

## Section 4 — Troubleshooting & FAQs

### Binary files — are images and archives safe?

Yes, and this is enforced in both directions. On protect, non-scannable files are copied
as-is; on restore, any file **without** a secret mapping is copied **byte-for-byte**.
Verify it yourself:

```bash
cmp original/assets/logo.png restored/assets/logo.png && echo "byte-identical"
```

### False positives — why is `normalizeWhitespace` flagged as a secret?

Low-confidence generic patterns (bare 24/32-character alphanumerics used by providers
like Vercel or MessageBird) will match ordinary identifiers and hashes. Findings carry a
`provider`, `severity` and confidence — treat low-confidence hits as hints. A false
positive is **safe**: the fake is still format-compatible, and restore puts the original
string back byte-for-byte, so nothing breaks.

### `sourcePath not found` / `outside the allowed project roots`

The workspace engine is confined to allowed roots. The default root is your **home
directory**. To import from elsewhere:

```bash
# .env
SHADOWPASTE_PROJECT_ROOTS=/home/you/projects:/mnt/work
```

(Use `;` as the separator on Windows.)

### Git conflicts during restore

Restore writes files directly into your working tree — it does **not** commit or merge.
Best practice: start from a clean tree so the AI's changes appear as an ordinary diff.

```bash
git status                      # ensure clean before you protect
# …protect → AI edits → restore…
git diff                        # review everything the AI changed
git checkout -- path/to/file    # discard anything you don't want
```

If you restored onto uncommitted local changes, recover with `git stash list` /
`git checkout --` on the affected paths.

### The repo cloned but nothing imported / "repository is private"

Only **public HTTPS** URLs are supported in the web app — ShadowPaste deliberately never
handles your git credentials. For SSH or private repositories, clone locally first, then
use the **Local path** tab or:

```bash
git clone git@github.com:you/private-repo.git
bun run cli/index.ts protect -p ./private-repo
```

### All API routes suddenly return 404

Almost always a **full disk** — Next.js compiles routes on demand and cannot write them.
Free space and restart:

```bash
rm -rf .next && bun run dev
```

### How do I verify a raw secret never reached the AI's context?

Four independent checks:

```bash
# 1. Grep the workspace the AI actually sees for your real secret.
#    Exclude the metadata file — that legitimately holds the mapping.
grep -r --exclude='.shadowpaste-meta.json' 'YOUR_REAL_SECRET' .workspaces/your-project-ws-abc123/
#    → expect NO matches

# 2. Confirm the fake is what's in place.
grep -r 'shadow' .workspaces/your-project-ws-abc123/.env
```

3. **Vault check** — the *Secret Vault* module and `GET /api/vault` return only masked
   values plus a fingerprint. Raw values are never serialised to any client.
4. **Audit check** — recorded tool output is redacted before persistence; review it in
   *Flight Recorder* / *Audit Trail*.

> The one file that intentionally holds real values is `.shadowpaste-meta.json` inside the
> workspace, because restore depends on it. `.workspaces/` is gitignored — keep it that
> way, and never hand that specific file to an agent.

### Rate limits during heavy use

Per-IP token buckets: **scan/import 5/min**, **auth 10/15min**, **vault 20/min**,
**MCP 60/min**. A `429` with `Retry-After` means the limiter is working — wait and retry.

---

## Quick Reference

```bash
bun install                                   # setup
cp .env.example .env && bun run db:push       # configure + migrate
bun run dev                                   # dashboard → localhost:3000

bun run cli/index.ts protect -p <project>     # scan + virtualize
bun run cli/index.ts open -e cursor           # open workspace in AI tool
bun run cli/index.ts restore                  # restore secrets + keep AI edits
bun run cli/index.ts status                   # workspaces + health

bun run typecheck                             # tsc (both configs)
bun run test                                  # full war-test suite
```

**License:** [MIT](LICENSE) · **Security policy:** [SECURITY.md](SECURITY.md) ·
**API reference:** [docs/API.md](docs/API.md)
