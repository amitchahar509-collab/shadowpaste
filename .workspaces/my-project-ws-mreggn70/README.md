# 🛡️ ShadowPaste

**Let AI code your real repo without exposing secrets.**

ShadowPaste is the AI Agent Security Control Plane. It scans your project, replaces real secrets with format-compatible fakes, creates an AI-safe workspace copy, and restores real secrets when you're ready to commit.

## Quick Start (60 seconds)

```bash
# 1. Install
bun add shadowpaste

# 2. Initialize in your project
npx shadowpaste init

# 3. Protect — creates AI-safe workspace
npx shadowpaste protect

# 4. Open in Cursor or Claude Code
npx shadowpaste open          # opens in Cursor
# or: cursor .workspaces/your-project-<id>/

# 5. AI edits files freely (secrets are fake but format-compatible)

# 6. Restore real secrets when done
npx shadowpaste restore
```

## How It Works

```
Your Project (.env, config files)
    ↓ shadowpaste protect
    ↓ scans 1000+ files, finds secrets
    ↓ vaults secrets (AES-GCM-256)
    ↓ replaces with format-compatible fakes
AI-Safe Workspace (.workspaces/your-project/)
    ↓ AI sees: sk-proj-shadow-5f7H8Ngtuq5pqlf9H1zibU1AHKsWvFrt9qkguWO7... (fake but valid format)
    ↓ AI edits code — code still runs, tests pass
    ↓
    ↓ shadowpaste restore
    ↓ replaces fakes with real secrets from vault
Your Project (real secrets restored, ready to commit)
```

## Format-Compatible Fake Secrets

| Real Secret | AI Sees | Why It Works |
|-------------|---------|--------------|
| `sk-proj-shadow-duPYKefZG7XdcDH6NkaA3tV2D7Bb7ivjGKJlNA18...` | `sk-proj-shadow-S6jtYt2pub3gx3EardkmSFosADa9JGSUJmlLK99J...` | Same OpenAI format, invalid for API |
| `ghp_aBcDeFg...` | `ghp_shadow...` | Same GitHub prefix, invalid |
| `AKIA8H5NZSPQTSJQKIUH` | `AKIA36GP6BJYJ2BSQZH7` | Same AWS shape, fails checksum |
| `sk_live_51H8xK2...` | `sk_test_shadow...` | Stripe test mode, same shape |
| `shadow-8ygvJWtSlpw1aj67DrjlkN | `shadow-fYqNfSwe1wFIeQMcjAmsbEdTi6tDXn | Valid URL, unreachable host |

**Code still runs. Tests don't break. AI understands format. Real secret never leaves vault.**

## CLI Commands

| Command | Description |
|---------|-------------|
| `shadowpaste init` | Initialize ShadowPaste, scan for secrets |
| `shadowpaste protect` | Create AI-safe workspace with fake secrets |
| `shadowpaste restore` | Restore real secrets back to source |
| `shadowpaste status` | Show protection status + server health |
| `shadowpaste open` | Open workspace in Cursor/Claude/VS Code |
| `shadowpaste daemon start` | Start background file watcher |

## Dashboard

Start the dashboard:
```bash
bun run dev
```
Open http://localhost:3000 — 13 modules including:
- AI Security Command Center (3D neural background)
- MCP Gateway (Claude/Cursor connect here)
- Secret Vault (encrypted storage)
- Flight Recorder (audit timeline)
- Audit Trail (compliance export)

## MCP Integration

Claude Desktop / Cursor connect via MCP:
```json
{
  "mcpServers": {
    "shadowpaste": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWpsm6XuQdBXLno4UVyNAYu9f8rGvZW9xfS_3yv6G6xLVciBLV0cE7yWfT1USy" }
    }
  }
}
```

Tools available: `shadowpaste.scan`, `shadowpaste.protect`, `shadowpaste.audit`, `fs.read/write`, `github.read/commit/pr`, `db.read`, `stripe.read`

## Secret Detection

500 patterns across 322 providers:
- Cloud: AWS, GCP, Azure, DigitalOcean, Alibaba, Tencent
- AI/ML: OpenAI, Anthropic, HuggingFace, Replicate, Groq, Mistral
- Payments: Stripe, PayPal, Square, Razorpay
- Databases: MongoDB, PostgreSQL, Redis, Supabase, Firebase
- CI/CD: Docker, Kubernetes, HashiCorp Vault, Terraform
- Plus entropy-based detection for unknown secrets

## Security

- AES-GCM-256 encrypted vault (WebCrypto)
- HMAC-SHA256 capability tokens (single-use, time-limited)
- Multi-tenant isolation (org-scoped)
- Rate limiting (MCP/auth/scan/vault)
- Security headers (CSP/HSTS/X-Frame)
- Audit trail (immutable, CSV export)

## Dogfood Tested

ShadowPaste runs on itself:
- 1276 files scanned
- 999 secrets virtualized with format-compatible fakes
- Restore verified — 999 secrets restored to source

## Tech Stack

- Next.js 16 + TypeScript 5
- Prisma ORM (SQLite dev, Postgres production)
- Three.js (3D command center)
- Tailwind CSS 4 + shadcn/ui
- WebCrypto (no external crypto deps)

## License

Private beta.
