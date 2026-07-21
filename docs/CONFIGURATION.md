# Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`
for local development. **Never commit a real `.env`** — it is gitignored.

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | `file:./db/custom.db` | Prisma connection string. SQLite for dev, PostgreSQL for production. |
| `AUTH_PEPPER` | Prod only | — | Server-side secret keying password hashes and session-token HMAC. Generate with `openssl rand -hex 32`. |
| `SHADOWPASTE_PROJECT_ROOTS` | No | process CWD | OS-path-delimiter-separated list of directories the HTTP workspace API may read/write. Confines caller-supplied paths. |
| `SEED_TOKEN` | No | — | In production, `/api/seed` requires this token (`?token=` or `X-Seed-Token`). Seeding is disabled in production if unset. |
| `GITHUB_TOKEN` | No | — | Default GitHub token for repo scans when the caller supplies none. |
| `STRIPE_SECRET_KEY` | No | — | Enables real Stripe billing. Unset → billing runs in mock mode. |
| `STRIPE_WEBHOOK_SECRET` | No | — | Verifies Stripe webhook signatures. In production, unverified webhooks are rejected when unset. |
| `NODE_ENV` | No | `development` | `production` turns on `Secure` cookies, the `AUTH_PEPPER` guard, seed gating, and webhook enforcement. |
| `PORT` / `HOSTNAME` | No | `3000` / `0.0.0.0` | Standalone server bind address. |

## `AUTH_PEPPER`

This single secret protects every account. Because the source is public, the
app **rejects** well-known placeholder values (`change-me-in-prod-via-secret`,
`ci-build-pepper`, `changeme`, and the dev fallback) in production and refuses
to perform auth operations until a unique value is supplied.

Rotating `AUTH_PEPPER` invalidates all existing sessions and password hashes,
so it requires a password reset for all users. Set it once and keep it in a
secrets manager.

## `SHADOWPASTE_PROJECT_ROOTS`

The HTTP workspace endpoints (`/api/workspace/create`, `/api/workspace/restore`)
read and write real files. This variable whitelists the directories they may
touch; anything outside is rejected with HTTP 400. When unset it defaults to the
server's working directory. The CLI is not affected — it operates directly on
the local paths you pass it.

Example (Linux/macOS): `SHADOWPASTE_PROJECT_ROOTS=/home/me/projects:/srv/repos`
Example (Windows): `SHADOWPASTE_PROJECT_ROOTS=C:\Users\me\projects;D:\repos`
