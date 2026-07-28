# 🛡️ ShadowPaste

**Let AI code your real repo without exposing secrets.**

ShadowPaste is an AI Agent Security Control Plane. It scans your project,
replaces real secrets with format-compatible fakes, creates an AI-safe
workspace copy, lets AI coding tools work inside it, and restores the real
secrets when you are ready to commit.

[![CI](https://github.com/amitchahar509-collab/shadowpaste/actions/workflows/ci.yml/badge.svg)](https://github.com/amitchahar509-collab/shadowpaste/actions/workflows/ci.yml)
&nbsp;License: MIT

---

## Quick Start (60 seconds)

```bash
# 1. Install dependencies (Bun ≥ 1.3, Node ≥ 20)
bun install

# 2. Set up the database (PostgreSQL is required — the Prisma provider is
#    "postgresql", so DATABASE_URL must be a postgresql:// URL)
cp .env.example .env
docker compose up -d db     # …or point DATABASE_URL at any Postgres
                            #    (Neon / Supabase / Render all work)
bun run db:push

# 3a. Use the CLI on any project
bun run cli/index.ts protect -p /path/to/your/project
#    → creates .workspaces/<project>-<id>/ with fakes in place of secrets
#    open that folder in Cursor / Claude Code, let AI edit, then:
bun run cli/index.ts restore

# 3b. …or run the dashboard
bun run dev          # http://localhost:3000
```

📖 **New here? Read the [Usage Guide](USAGE_GUIDE.md)** — every feature, CLI and
dashboard walkthroughs, MCP setup for Claude Code / Cursor, and troubleshooting.

See also **[docs/QUICKSTART.md](docs/QUICKSTART.md)** for a full walkthrough and
**[docs/INSTALLATION.md](docs/INSTALLATION.md)** for production deployment.

**Prerequisites:** Bun ≥ 1.3 (or Node ≥ 20), and `git` on PATH if you want to
import projects by clone URL.

---

## Core Features

| Feature | What it does |
|---------|--------------|
| **Secret Virtualization** | Finds real credentials and swaps them for format-compatible fakes, so AI tools see a valid-looking but dead credential. 500 patterns across 322 providers, plus entropy detection. |
| **Byte-Level Restore Engine** | Restores real secrets and copies AI edits back. Files without a secret mapping are copied byte-for-byte, so images, fonts, archives and other binaries survive the round trip unchanged. |
| **MCP Security** | Zero-trust MCP gateway: every agent tool call is risk-scored, policy-gated, credential-injected, executed, and audited with secrets redacted. |
| **Flight Recorder** | Black-box timeline of every agent action, backed by an immutable, org-scoped audit trail with CSV export. |
| **Project Intelligence** | On import, automatically detects framework, language, runtime, package manager, build tool, database, ORM, cloud, containers, IaC, CI/CD, monorepo tooling and AI-agent configs — then scores health, security, risk, AI-readiness, complexity and dependencies, with insights and per-stage recommendations. |

## Import a Project

Bring a project in whichever way suits you — the Import Hub in the dashboard
(**AI-Safe Workspace**) exposes all of them, and analysis runs automatically:

| Method | How |
|--------|-----|
| Drag & drop a folder | drop it on the dropzone (directories are read recursively) |
| Select a folder | **Select folder** button |
| Archive | `.zip`, `.tar`, `.tar.gz`, `.tgz` — drop it or use **Select archive** |
| Local path | paste an absolute path (local or network drive) inside an allowed root |
| Git clone | public **HTTPS** URL — GitHub, GitLab, Bitbucket, Azure DevOps, Codeberg, Gitea |
| Recent projects | one-click reopen of a previously protected workspace |

> SSH URLs and private repositories are intentionally **not** supported in the
> web app (it never handles your credentials). Clone locally, then use the
> local-path method or `shadowpaste protect`.

---

## How It Works

```
Your Project (.env, config files)
    │  shadowpaste protect
    ▼  scans files, finds secrets, vaults them (AES-GCM-256),
       replaces each with a format-compatible fake
AI-Safe Workspace (.workspaces/your-project/)
    │  AI sees: sk-proj-shadow-xxx…  (fake, valid shape, dead credential)
    │  AI edits code — code still runs, tests still pass
    ▼  shadowpaste restore
Your Project (real secrets restored, AI edits preserved, ready to commit)
```

## Format-Compatible Fake Secrets

| Real Secret | AI Sees | Why It Works |
|-------------|---------|--------------|
| `sk-proj-abc123…` | `sk-proj-shadow-xxx…` | Same OpenAI shape, dead credential |
| `ghp_aBcDeFg…` | `ghp_shadow…` | Same GitHub prefix, invalid |
| `AKIAIOSFODNN7EXAMPLE` | `AKIASHADOWFAKEKEY00` | Same AWS shape, fails checksum |
| `sk_live_51H8xK2…` | `sk_test_shadow…` | Stripe test-mode shape |
| `postgresql://admin:pass@host` | `postgresql://shadow:shadow@shadow-db` | Valid URL, unreachable host |

The code still runs, tests don't break, the AI understands the format, and the
real secret never leaves the vault.

## CLI Commands

| Command | Description |
|---------|-------------|
| `shadowpaste init` | Initialize ShadowPaste, scan for secrets |
| `shadowpaste protect` | Create AI-safe workspace with fake secrets |
| `shadowpaste restore` | Restore real secrets back to the source project |
| `shadowpaste status` | Show protection status |
| `shadowpaste open` | Open the workspace in Cursor / Claude / VS Code |
| `shadowpaste daemon start` | Start the background file watcher |

## Dashboard

`bun run dev`, then open http://localhost:3000 — 13 modules including the MCP
Zero-Trust Gateway, Agent Identity system, Permission Control Center, encrypted
Secret Vault, AI Flight Recorder, Shadow Sandbox, AI-Safe GitHub scanner, Trust
Score, MCP Marketplace, Public Scanner, and Red-Team Lab.

## MCP Integration

Claude Desktop / Cursor connect to the gateway over MCP:

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

Every tool call is risk-scored, policy-gated, credential-injected, executed,
and audited (with secrets redacted). See **[docs/API.md](docs/API.md)**.

## Secret Detection

500 patterns across 322 providers (cloud, AI/ML, payments, databases, CI/CD),
plus entropy-based detection for unknown secrets. Benchmarked at zero false
negatives on the bundled 1,000-file corpus (`bun run test:unit`).

## Security Highlights

- AES-GCM-256 encrypted vault (WebCrypto, no external crypto deps)
- HMAC-SHA256 single-use, time-limited capability tokens
- Multi-tenant isolation — every query is org-scoped
- Authentication required on all mutating and file-touching endpoints
- Filesystem confinement for all caller-supplied paths
- Rate limiting (MCP / auth / scan / vault)
- Security headers (CSP / HSTS / X-Frame-Options)
- Immutable audit trail with CSV export

Full details and the deployment checklist: **[docs/SECURITY.md](docs/SECURITY.md)**.
Reporting a vulnerability: **[SECURITY.md](SECURITY.md)**.

## OAuth 2.1 (MCP authorization)

ShadowPaste ships a real OAuth 2.1 authorization server backed by its own user
accounts — no external identity provider needed. MCP clients that speak OAuth
(Claude connectors, and any RFC-compliant client) can register and authorize
against it directly:

| Endpoint | Spec |
|---|---|
| `/.well-known/oauth-authorization-server` | RFC 8414 metadata discovery |
| `/oauth/register` | RFC 7591 dynamic client registration |
| `/oauth/authorize` | authorization-code grant, **PKCE S256 required** |
| `/oauth/token` | code exchange + **rotating** refresh tokens |
| `/oauth/revoke` | RFC 7009 revocation |

Enforced: exact-match `redirect_uri` (no open redirect), single-use short-lived
codes, refresh-token rotation with **family revocation on replay**, SHA-256-hashed
client secrets and tokens at rest. The implicit and password grants are not
offered. Set **`REQUIRE_OAUTH=true`** to require a valid token on `/api/mcp`
(recommended for any public deployment).

## Configuration

All configuration is via environment variables — see **[.env.example](.env.example)**
for the annotated list. The ones that matter most:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string (the only DB setting) |
| `AUTH_PEPPER` | **yes in production** | Keys password hashes + session HMAC. Auth refuses to start in production without a unique value. |
| `SHADOWPASTE_MASTER_KEY` / `_VAULT_SALT` | **yes in production** | Derive the AES-GCM-256 vault key. Losing them makes vaulted secrets unrecoverable. |
| `NEXT_PUBLIC_APP_URL` | recommended | Public URL, used for redirects and the MCP config handed to clients |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | optional | Enables the `ai.generate` MCP tool |
| `NETWORK_ALLOWED_HOSTS` | optional | Extra hosts the network tools may reach (allowlist-only) |

## Deployment

Container-first: the repo ships a multi-stage **[Dockerfile](Dockerfile)**,
**[render.yaml](render.yaml)** blueprint, **[vercel.json](vercel.json)** and a
**[docker-compose.yml](docker-compose.yml)**. Step-by-step instructions, the full
environment manifest, and the honest per-host caveats are in
**[DEPLOYMENT.md](DEPLOYMENT.md)**.

> Note: the AI-Safe Workspace features write to disk and shell out to `git`, so they
> need a persistent container (Render/Railway/Fly), not a serverless runtime.

## Tech Stack

- Next.js 16 + React 19 + TypeScript 5
- Prisma ORM (SQLite for dev, PostgreSQL for production)
- Bun runtime
- Three.js (3D command center), Tailwind CSS 4, shadcn/ui
- WebCrypto + Node crypto

## Documentation

| Guide | |
|-------|--|
| **[Usage Guide](USAGE_GUIDE.md)** | **Start here** — full feature matrix, CLI + dashboard walkthroughs, MCP setup, troubleshooting |
| [Quick Start](docs/QUICKSTART.md) | Protect → edit → restore, end to end |
| [Installation](docs/INSTALLATION.md) | Local, Docker, and production setup |
| [Configuration](docs/CONFIGURATION.md) | Every environment variable |
| [Architecture](docs/ARCHITECTURE.md) | How the pieces fit together |
| [Developer Guide](docs/DEVELOPMENT.md) | Build, test, project layout |
| [API Reference](docs/API.md) | Every HTTP endpoint |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common problems |
| [Security](docs/SECURITY.md) | Threat model + hardening |
| [Contributing](CONTRIBUTING.md) | How to contribute |
| [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) | History and plans |

## License

[MIT](LICENSE).
