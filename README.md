<div align="center">

# 🛡️ ShadowPaste

**Let AI code your real repo without exposing secrets.**

An AI-agent security control plane: it finds your real credentials, swaps them for
format-compatible fakes, hands the AI a safe copy, and gates every agent tool call
through a risk → policy → audit pipeline.

[![CI](https://github.com/amitchahar509-collab/shadowpaste/actions/workflows/ci.yml/badge.svg)](https://github.com/amitchahar509-collab/shadowpaste/actions/workflows/ci.yml)
[![Release](https://github.com/amitchahar509-collab/shadowpaste/actions/workflows/release.yml/badge.svg)](https://github.com/amitchahar509-collab/shadowpaste/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![MCP](https://img.shields.io/badge/MCP-2025--06--18-6E56CF)](https://modelcontextprotocol.io)

[Quick Start](#quick-start) · [MCP Setup](#mcp-client-setup) · [Security Model](#security-model) · [Deployment](#deployment) · [FAQ](#faq)

</div>

---

## Overview

You want Claude Code or Cursor to work on your actual project. Your actual project
has a `.env` full of live credentials. Pasting it into an agent's context means those
credentials end up in a model provider's logs, a tool call's arguments, and your
audit trail.

ShadowPaste solves this from two directions:

1. **Secret virtualization** — scan the project, encrypt every real secret into a
   local vault, and write a *format-compatible fake* in its place. The code still
   parses, tests still run, the AI still understands the shape — but the credential
   is dead. When you're done, restore the real values byte-for-byte.

2. **A zero-trust MCP gateway** — when an agent calls a tool, the call is risk-scored,
   evaluated against a policy engine, given a single-use credential, executed, and
   audited with secrets redacted from both the result and the log.

Everything runs on your own infrastructure. There is no ShadowPaste cloud.

## Key Capabilities

| Capability | What it actually does |
|---|---|
| **Secret virtualization** | 501 detection patterns across 322 providers, plus Shannon-entropy detection for unknown secrets, base64 pre-decoding, and a canonicalization ladder (percent-decode → NFKC → invisible-character removal) that catches obfuscated credentials. |
| **Byte-level restore** | Restores real secrets and copies AI edits back. Files with no secret mapping are copied byte-for-byte, so images, fonts and archives survive the round trip unchanged. |
| **Zero-trust MCP gateway** | 28 tools, each risk-scored 0–100 and policy-gated before execution. Credentials are injected at call time as single-use HMAC capability tokens. |
| **Response-side sanitization** | Tool output is re-scanned on the way back; any secret found is replaced before it reaches the agent's context *or* the audit trail. Fails closed on unparseable output. |
| **Tamper-evident audit trail** | Every action is chained: `H(n) = sha256(H(n-1) ‖ canonical(row_n))`. `GET /api/v1/audit/verify` recomputes the chain and returns 409 if it diverges. |
| **OAuth 2.1 authorization server** | PKCE S256-only, exact-match redirect URIs, single-use codes, rotating refresh tokens with family revocation on replay. No external IdP required. |
| **Alerting** | 8 rules bound to signals the system actually emits, with deduplication, cooldowns and thresholds so a tight attack loop produces one page, not 5,000. |
| **Project intelligence** | On import, detects framework, language, runtime, package manager, build tool, database, ORM, containers, IaC, CI/CD and monorepo tooling, then scores health, security, complexity and AI-readiness. |

---

## Architecture

```mermaid
flowchart LR
    subgraph Client["AI client"]
        A[Claude Code / Cursor / VS Code]
    end
    subgraph Gateway["ShadowPaste gateway"]
        direction TB
        ID[Identity<br/>OAuth 2.1 / API key] --> RISK[Risk engine<br/>score 0-100]
        RISK --> POL[Policy engine<br/>allow / ask / deny]
        POL --> CRED[Credential injection<br/>single-use capability token]
        CRED --> EXEC[Adapter execution]
        EXEC --> SAN[Output sanitization<br/>secrets redacted]
        SAN --> AUD[(Audit chain<br/>tamper-evident)]
    end
    subgraph Ext["Real systems"]
        GH[GitHub]
        DB[(PostgreSQL)]
        ST[Stripe]
        NET[Allow-listed HTTP]
    end
    A -- MCP JSON-RPC 2.0 --> ID
    EXEC --> GH & DB & ST & NET
    SAN -- redacted result --> A
```

The secret-virtualization flow is separate from the gateway and can be used on its own:

```mermaid
flowchart TD
    P[Your project<br/>.env, config files] -->|shadowpaste protect| SCAN[Scan: 501 patterns<br/>+ entropy + canonicalization]
    SCAN --> VAULT[(AES-GCM-256 vault<br/>real secrets encrypted)]
    SCAN --> WS[AI-safe workspace<br/>format-compatible fakes]
    WS --> AI[AI edits code<br/>code runs, tests pass]
    AI -->|shadowpaste restore| OUT[Your project<br/>real secrets + AI edits]
    VAULT --> OUT
```

---

## Installation

**Prerequisites**

- Bun ≥ 1.3 (or Node ≥ 20)
- PostgreSQL — the Prisma provider is `postgresql`, so `DATABASE_URL` must be a
  `postgresql://` URL. Docker Compose ships one; Neon, Supabase, Render and Railway
  all work.

```bash
git clone https://github.com/amitchahar509-collab/shadowpaste.git
cd shadowpaste
bun install
cp .env.example .env
docker compose up -d db      # or point DATABASE_URL at any Postgres
bun run db:push
```

> `git` on `PATH` is optional. Clone-import uses it when present and falls back to
> the host's HTTPS tarball endpoint when it isn't (GitHub, GitLab, Codeberg, Gitea).

## Quick Start

**Protect a project, let AI work on it, restore:**

```bash
bun run cli/index.ts protect -p /path/to/your/project
```

This creates `.workspaces/<orgId>/<project>-<id>/` with fakes in place of real
secrets. Open that folder in Cursor or Claude Code, let the AI edit, then:

```bash
bun run cli/index.ts restore
```

**Or run the dashboard:**

```bash
bun run dev      # http://localhost:3000
```

### CLI commands

| Command | Description |
|---|---|
| `shadowpaste init` | Initialize ShadowPaste and scan for secrets |
| `shadowpaste protect` | Create an AI-safe workspace with fake secrets |
| `shadowpaste restore` | Restore real secrets to the source project |
| `shadowpaste status` | Show protection status |
| `shadowpaste open` | Open the workspace in Cursor / Claude / VS Code |
| `shadowpaste daemon start` | Start the background file watcher |

### Importing a project into the dashboard

| Method | How |
|---|---|
| Drag & drop a folder | Drop it on the dropzone (directories are read recursively) |
| Select a folder | **Select folder** button |
| Archive | `.zip`, `.tar`, `.tar.gz`, `.tgz` — dropped archives are extracted and scanned |
| Local path | An absolute path inside an allowed root (`SHADOWPASTE_PROJECT_ROOTS`) |
| Git clone | Public **HTTPS** URL — GitHub, GitLab, Bitbucket, Azure DevOps, Codeberg, Gitea |

> SSH URLs and private repositories are intentionally **not** supported in the web
> app — it never handles your git credentials. Clone locally, then use the local-path
> method or `shadowpaste protect`.

---

## MCP Client Setup

ShadowPaste implements MCP over Streamable HTTP and the older HTTP+SSE transport,
negotiating protocol versions `2025-06-18`, `2025-03-26` and `2024-11-05`.

### Claude Code

```bash
claude mcp add --transport http shadowpaste http://localhost:3000/api/mcp \
  --header "Authorization: Bearer <agent-api-key>"
```

### Cursor

`~/.cursor/mcp.json` (or **Settings → MCP → Add Server**):

```json
{
  "mcpServers": {
    "shadowpaste": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer <agent-api-key>" }
    }
  }
}
```

### VS Code

`.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "shadowpaste": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer ${input:shadowpaste_token}" }
    }
  },
  "inputs": [
    {
      "id": "shadowpaste_token",
      "type": "promptString",
      "description": "ShadowPaste agent API key",
      "password": true
    }
  ]
}
```

### ChatGPT

ChatGPT connectors require a **publicly reachable HTTPS** MCP endpoint with OAuth.
ShadowPaste provides both — deploy it (see [Deployment](#deployment)), set
`REQUIRE_OAUTH=true`, and point the connector at `https://<your-host>/api/mcp`.
Discovery is served from:

- `/.well-known/oauth-protected-resource` (RFC 9728)
- `/.well-known/oauth-authorization-server` (RFC 8414)
- `/oauth/register` (RFC 7591 dynamic client registration)

> We test the OAuth and MCP endpoints against the specs and against Claude Code and
> generic MCP clients. We have not certified any specific ChatGPT connector build —
> treat this configuration as spec-compliant rather than vendor-verified.

### Verify the connection

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## API Examples

Full reference: **[docs/API.md](docs/API.md)**.

**Health, including dependency status:**

```bash
curl -s http://localhost:3000/api/health
```

**Call a tool through the gateway** (returns the policy decision, not just the result):

```bash
curl -s -X POST http://localhost:3000/api/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc": "2.0", "id": 1, "method": "tools/call",
    "params": { "name": "fs.read", "arguments": { "path": "package.json" } }
  }'
```

**Verify the audit chain** (409 if the trail was altered):

```bash
curl -s "http://localhost:3000/api/v1/audit/verify" \
  -H "Authorization: Bearer <token>"
```

**Recent alerts and traces:**

```bash
curl -s http://localhost:3000/api/v1/alerts -H "Authorization: Bearer <token>"
curl -s http://localhost:3000/api/v1/traces -H "Authorization: Bearer <token>"
```

---

## Security Model

Every tool call passes through the same pipeline. There is no path that skips it.

```mermaid
sequenceDiagram
    participant A as Agent
    participant G as Gateway
    participant V as Vault
    participant T as Target system
    participant L as Audit chain
    A->>G: tools/call
    G->>G: Identity (OAuth 2.1 / API key)
    G->>G: Risk score 0-100
    G->>G: Policy: allow / ask / deny
    alt denied or hard-denied
        G-->>A: blocked + reason
        G->>L: append (decision, risk)
    else allowed
        G->>V: mint single-use capability token
        V-->>G: credential (TTL, usage limit 1)
        G->>T: execute
        T-->>G: raw result
        G->>G: sanitize (redact secrets)
        G->>L: append (sanitized only)
        G-->>A: sanitized result
    end
```

### Risk engine

Each tool has a base score, adjusted by call context. Scores map to levels at fixed
thresholds (`src/lib/risk.ts`):

| Score | Level |
|---|---|
| 80–100 | `critical` |
| 50–79 | `high` |
| 25–49 | `medium` |
| 0–24 | `low` |

### Policy engine

Decisions are `allow_once`, `allow_always`, `ask`, `deny`, or `blocked`
(`src/lib/policy.ts`). Evaluation order:

1. **Hard deny** — six tools are permanently denied regardless of trust score,
   approval or configuration.
2. **Trust-gated auto-allow** — low-risk reads for agents above the trust threshold.
3. **Approval queue** — high-risk calls require explicit human approval.
4. **Default deny** — anything unmatched.

Hard-denied tools: `github.repo.delete`, `db.schema.drop`, `fs.execute`,
`db.export`, `stripe.charge`, `stripe.customer.delete`.

### Supported tools

28 tools across 8 adapters (`fs`, `github`, `db`, `shell`, `network`, `stripe`,
`ai`, `shadowpaste`), by risk level:

| Level | Count | Examples |
|---|---|---|
| `low` | 9 | `fs.read`, `github.read`, `db.read`, `shadowpaste.scan` |
| `medium` | 3 | `fs.write`, `network.fetch` |
| `high` | 7 | `db.write`, `github.pr.merge`, `stripe.refund` |
| `critical` | 9 | `fs.execute`, `db.schema.drop`, `github.repo.delete`, `shell.exec` |

Live list with schemas and risk metadata: `POST /api/mcp` → `tools/list`.

### ⚠️ High-risk tool disclaimer

Several registered tools can cause **irreversible damage** if a policy is
misconfigured: repository deletion, schema destruction, database export, payment
charges, customer deletion, and arbitrary shell or filesystem execution.

- Six of them are **hard-denied** and cannot be enabled through configuration —
  editing `HARD_DENY` in source is the only way, and you should not.
- The remaining high-risk tools route to an **approval queue**. That queue is a
  policy decision, **not** container isolation. A tool you approve runs with the
  credentials you gave it, on the real system.
- Run against **test credentials and non-production data** until you have reviewed
  the policy configuration for your own environment. Stripe tools reject live keys
  unless `STRIPE_ALLOW_LIVE=true`.

### Other controls

- AES-GCM-256 vault (WebCrypto), PBKDF2-SHA256 key derivation
- HMAC-SHA256 single-use, time-limited capability tokens
- Multi-tenant isolation — queries are org-scoped and workspaces are namespaced per
  organization on disk
- SSRF defense — protocol/host allowlist plus private, loopback and cloud-metadata
  address blocking, including decimal, octal, hex and IPv4-mapped-IPv6 encodings
- Filesystem confinement with symlink resolution for every caller-supplied path
- Archive extraction bounded to 5,000 files / 100 MB, rejected from the ZIP central
  directory before anything is written
- Rate limiting on every `/api/` route with per-route presets
- Security headers (CSP / HSTS / X-Frame-Options)

### Known limitations (read before deploying)

- **Rate limits are per-instance unless Redis is configured.** The default limiter
  lives in process memory, so each serverless instance keeps its own counters. Set
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for global limits.
  `GET /api/health` reports which mode is live and probes the backend with a real
  `PING`.
- **The "sandbox" is a policy decision, not an isolated runtime.** Critical-risk
  calls route to an approval queue; they do not run under container isolation.
  `shell.exec` therefore refuses outright rather than pretending.
- **`db.migrate` and `ai.train` are registered but not implemented** — they return a
  structured `NOT_IMPLEMENTED` error.
- **Workspaces need a persistent filesystem.** On serverless hosts they are written
  to the instance's temp directory, which is per-instance and ephemeral, so a
  workspace may not survive to the next request. Set `SHADOWPASTE_WORKSPACE_ROOT` to
  a mounted volume for durable workspaces.
- **Alerts are recorded but not delivered unless a webhook is configured.** Set
  `ALERT_WEBHOOK_URL` (or the Slack/Teams variants); `GET /api/health` says plainly
  when nothing is configured.
- **No SOC 2, no SLA.** This is pre-1.0 open source, not a certified service.

Threat model and hardening checklist: **[docs/SECURITY.md](docs/SECURITY.md)**.
Reporting a vulnerability: **[SECURITY.md](SECURITY.md)**.

---

## Deployment

The repo ships a multi-stage **[Dockerfile](Dockerfile)**, a
**[render.yaml](render.yaml)** blueprint, **[vercel.json](vercel.json)** and a
**[docker-compose.yml](docker-compose.yml)**. Step-by-step instructions and per-host
caveats: **[DEPLOYMENT.md](DEPLOYMENT.md)**.

| Host | Gateway, MCP, OAuth, audit | Workspaces |
|---|---|---|
| Docker / Render / Railway / Fly | ✅ | ✅ with a mounted volume |
| Vercel / serverless | ✅ | ⚠️ ephemeral — see limitations above |

Set `REQUIRE_OAUTH=true` on any publicly reachable deployment.

### Environment variables

Annotated list: **[.env.example](.env.example)**. The ones that matter most:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `AUTH_PEPPER` | **yes in production** | Keys password hashes and session HMAC. Auth refuses to start in production without a unique value. |
| `SHADOWPASTE_MASTER_KEY` | **yes in production** | Derives the AES-GCM-256 vault key. Losing it makes vaulted secrets unrecoverable. |
| `SHADOWPASTE_VAULT_SALT` | **yes in production** | Vault key salt. Same warning. |
| `REQUIRE_OAUTH` | recommended | `true` requires a valid OAuth token on `/api/mcp` |
| `NEXT_PUBLIC_APP_URL` | recommended | Public URL for redirects and the MCP config handed to clients |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | recommended | Global (not per-instance) rate limiting |
| `TRUST_PROXY` | recommended behind a proxy | Trust `X-Forwarded-For` for rate-limit keying |
| `SHADOWPASTE_WORKSPACE_ROOT` | recommended on serverless | Durable workspace directory |
| `ALERT_WEBHOOK_URL` | recommended | Where security alerts are delivered |
| `SHADOWPASTE_PROJECT_ROOTS` | optional | Roots the local-path import may read from |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | optional | Enables the `ai.generate` tool |
| `GITHUB_TOKEN` / `STRIPE_SECRET_KEY` | optional | Credentials for the GitHub and Stripe read tools |
| `NETWORK_ALLOWED_HOSTS` | optional | Extra hosts the network tools may reach |

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Environment variable not found: DATABASE_URL` | `.env` missing or not a `postgresql://` URL. `cp .env.example .env`, then `bun run db:push`. |
| `AUTH_PEPPER` startup refusal in production | Deliberate. Set a unique value; without it sessions would be forgeable. |
| `/api/mcp` returns 401 | `REQUIRE_OAUTH=true` and no valid token. Check `WWW-Authenticate` in the response for the discovery URL. |
| Rate limits behave inconsistently | Per-instance memory limiter. Configure Upstash Redis; `GET /api/health` shows the active mode. |
| `invalid workspacePath` after an upload | The workspace directory no longer exists — usually an ephemeral serverless temp dir. Set `SHADOWPASTE_WORKSPACE_ROOT` to a mounted volume. |
| Clone fails with `git ENOENT` | No `git` on `PATH`. Clone-import falls back to HTTPS tarballs for GitHub, GitLab, Codeberg and Gitea; other hosts return 501. |
| `npm run build` fails with `EPERM` on Windows | A running dev server holds the Prisma query engine open. Stop it, then rebuild. |
| Alerts fire but nobody is notified | No delivery adapter. Set `ALERT_WEBHOOK_URL`. |

More: **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**.

---

## FAQ

**Does my code or my secrets go to ShadowPaste's servers?**
No. There is no ShadowPaste service. You run it; secrets are encrypted into a vault
on infrastructure you control.

**What happens if I lose `SHADOWPASTE_MASTER_KEY`?**
Vaulted secrets become unrecoverable. Both the key and the salt must be backed up
before you protect anything you care about.

**Is this a replacement for a secret manager?**
No. It keeps real credentials out of an AI's context during development, and gates
agent tool calls. Vault, AWS Secrets Manager and friends solve a different problem.

**Can the AI tell the fakes are fake?**
It can — they are labelled. The point isn't deception, it's that the code keeps the
right *shape* so it parses and runs while the credential is dead.

**Does it work with any MCP client?**
Any client speaking MCP over Streamable HTTP or HTTP+SSE. Claude Code and generic
MCP clients are tested directly; see the [ChatGPT](#chatgpt) caveat.

**Is it production-ready?**
The security controls are tested and the test suite runs in CI. It is pre-1.0 open
source with no SOC 2 and no SLA — read [Known limitations](#known-limitations-read-before-deploying)
and decide for your own risk tolerance.

---

## Screenshots

> Not yet captured. These are the shots that would help most — contributions welcome
> (PNG or GIF, light and dark, 1440×900):
>
> 1. **Dashboard / command center** — the landing view with live metrics
> 2. **Import Hub** — drag-and-drop folder import with the analysis result
> 3. **Secret scan result** — findings list with providers and severity
> 4. **AI-safe workspace diff** — real secret beside its format-compatible fake
> 5. **MCP gateway decision** — a blocked critical-risk call with its reason and score
> 6. **Flight recorder** — the audit timeline
> 7. **Approval queue** — a high-risk call awaiting human approval
> 8. **CLI protect → restore** — an animated GIF of the round trip

---

## Tech Stack

- Next.js 16 · React 19 · TypeScript 5 (strict)
- Prisma ORM → PostgreSQL
- Bun runtime (Node ≥ 20 also supported)
- Tailwind CSS 4 · shadcn/ui · Three.js
- WebCrypto + Node `crypto` — no external crypto dependencies

## Documentation

| Guide | |
|---|---|
| **[Usage Guide](USAGE_GUIDE.md)** | **Start here** — full feature matrix, CLI + dashboard walkthroughs, MCP setup |
| [Quick Start](docs/QUICKSTART.md) | Protect → edit → restore, end to end |
| [Installation](docs/INSTALLATION.md) | Local, Docker, and production setup |
| [Configuration](docs/CONFIGURATION.md) | Every environment variable |
| [Architecture](docs/ARCHITECTURE.md) | How the pieces fit together |
| [API Reference](docs/API.md) | Every HTTP endpoint |
| [Security](docs/SECURITY.md) | Threat model and hardening |
| [Runbook](docs/RUNBOOK.md) | Operating it: health, alerting, incidents |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common problems |
| [Developer Guide](docs/DEVELOPMENT.md) | Build, test, project layout |
| [Deployment](DEPLOYMENT.md) | Per-host deployment guides |
| [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) | History and plans |

## Contributing

Contributions are welcome. Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** first.

```bash
bun install
bun run db:push
bun run typecheck && bun run lint && bun run test:unit
bun run build
```

Security-relevant changes need a regression test that fails without the fix. Please
do not open a public issue for a vulnerability — see **[SECURITY.md](SECURITY.md)**.

## License

[MIT](LICENSE) © ShadowPaste contributors.
