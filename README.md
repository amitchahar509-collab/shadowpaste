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

# 2. Set up the local database
cp .env.example .env
bun run db:push

# 3a. Use the CLI on any project
bun run cli/index.ts protect -p /path/to/your/project
#    → creates .workspaces/<project>-<id>/ with fakes in place of secrets
#    open that folder in Cursor / Claude Code, let AI edit, then:
bun run cli/index.ts restore

# 3b. …or run the dashboard
bun run dev          # http://localhost:3000
```

See **[docs/QUICKSTART.md](docs/QUICKSTART.md)** for a full walkthrough and
**[docs/INSTALLATION.md](docs/INSTALLATION.md)** for production deployment.

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

## Tech Stack

- Next.js 16 + React 19 + TypeScript 5
- Prisma ORM (SQLite for dev, PostgreSQL for production)
- Bun runtime
- Three.js (3D command center), Tailwind CSS 4, shadcn/ui
- WebCrypto + Node crypto

## Documentation

| Guide | |
|-------|--|
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
