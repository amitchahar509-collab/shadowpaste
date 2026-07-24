# ShadowPaste — 24/7 Cloud Deployment Guide

This guide takes ShadowPaste off `localhost` onto always-on cloud infrastructure.
It is written to be honest about what runs where — no feature is claimed to work on
a host that cannot support it.

---

## 0. Read this first — architecture reality

ShadowPaste is **one full-stack Next.js app**, and it is **filesystem-stateful**:

| Feature | Needs |
|---|---|
| AI-Safe Workspace: import → protect → **write `.workspaces/`** → restore | a real, persistent filesystem |
| Git-clone import (`git clone` via `execFileSync`) | a container with the `git` binary + writable disk |
| Vault master key auto-persist | a writable FS **or** the key set as an env var |
| Everything else (auth, vault CRUD, scans, MCP gateway, dashboards) | just the app + Postgres |

**Consequence:**
- **Render / Railway (Docker container) = recommended primary home.** The whole
  product runs intact. Use `render.yaml` (in this repo) or Railway + the `Dockerfile`.
- **Vercel (serverless) = works for the *stateless subset* only.** Its filesystem is
  read-only except an ephemeral `/tmp`, and functions don't persist between calls, so
  **workspace import/protect/restore and git-clone will not work reliably there.** The
  vault master key **must** be set as an env var on Vercel (it cannot self-persist).

**Database:** the Prisma provider is now **`postgresql`**. Every free host below needs
a managed Postgres; `DATABASE_URL` is the only DB setting.

---

## 1. What changed in the codebase (localhost removal)

| File | Change |
|---|---|
| `prisma/schema.prisma` | provider `sqlite` → **`postgresql`** (URL still `env("DATABASE_URL")`) |
| `src/lib/app-url.ts` (new) | `getAppUrl(req)` resolves the public URL from `NEXT_PUBLIC_APP_URL` → forwarded proto/host → origin → localhost. `corsHeaders(req)` for opt-in cross-origin. |
| `src/app/api/billing/checkout/route.ts` | Stripe redirect origin now `getAppUrl(req)`, not hardcoded `http://localhost:3000` |
| `src/app/api/mcp-config/route.ts` | base URL via `getAppUrl(req)` (honors `X-Forwarded-Proto`); tool count now derived from the registry (was hardcoded `25`, now correctly 28) |
| `src/app/api/mcp/route.ts` | added `OPTIONS` + dynamic CORS headers (opt-in via `ALLOWED_ORIGINS`) |
| `src/lib/tools/adapters.ts` | `db.schema.inspect` now queries Postgres `information_schema` (was SQLite `sqlite_master`) |
| `cli/index.ts` | `--server` default from `SHADOWPASTE_SERVER_URL`; dashboard URL no longer hardcoded |
| `package.json` | added `postinstall` (prisma generate), `vercel-build`, `release` (prisma db push) |
| `.env.example` | full cloud manifest (below) |
| `render.yaml`, `vercel.json` (new) | deployment blueprints |

`Dockerfile` was already cloud-ready: binds `HOSTNAME=0.0.0.0`, honors `PORT`, runs
as non-root, uses the Postgres `DATABASE_URL`, has a healthcheck. No change needed.

**Verified:** `tsc --noEmit` passes (0 errors) and `prisma generate` succeeds against
the Postgres schema.

---

## 2. Environment variable manifest

Paste these into your host's dashboard (Render → Environment; Vercel → Settings →
Environment Variables). **Never commit real values.**

### Required everywhere
| Key | Value / how to get it | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres URI from Render PG / Supabase / Neon | only DB setting |
| `AUTH_PEPPER` | `openssl rand -hex 32` | auth refuses to start in prod without it |
| `SHADOWPASTE_MASTER_KEY` | `openssl rand -base64 32` | **losing it = all vault secrets unrecoverable** |
| `SHADOWPASTE_VAULT_SALT` | `openssl rand -base64 16` | pair with the master key |
| `NEXT_PUBLIC_APP_URL` | your public URL (e.g. `https://shadowpaste.onrender.com`) | used for redirects + MCP config |
| `NODE_ENV` | `production` | |

### Networking / behavior
| Key | Value | Notes |
|---|---|---|
| `PORT` | `3000` | Render/Railway inject their own; keep for Docker |
| `HOSTNAME` | `0.0.0.0` | standalone bind |
| `TRUST_PROXY` | `true` | you're behind Render/Vercel/Railway's proxy |
| `ALLOWED_ORIGINS` | blank, or `https://ext-host,https://dash.example.com`, or `*` | cross-origin browser callers only |
| `SHADOWPASTE_PROJECT_ROOTS` | `/tmp` (or `/data` on a paid Render disk) | server-path import confinement |

### Optional integrations
| Key | Value | Notes |
|---|---|---|
| `GITHUB_TOKEN` | a PAT | default token for repo scans |
| `STRIPE_SECRET_KEY` | Stripe key | unset ⇒ billing runs in mock mode |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret | with the above |

> On **Render**, `render.yaml` already sets `NODE_ENV/PORT/HOSTNAME/TRUST_PROXY`,
> wires `DATABASE_URL` from the managed DB, and **auto-generates + persists**
> `AUTH_PEPPER`, `SHADOWPASTE_MASTER_KEY`, `SHADOWPASTE_VAULT_SALT`. You only paste
> `NEXT_PUBLIC_APP_URL` (after the first deploy tells you the URL) and any optional keys.

---

## 3. Step-by-step — push to GitHub

```bash
# from the repo root
git checkout -b deploy/cloud-ready        # or stay on main if you prefer
git add prisma/schema.prisma src/lib/app-url.ts \
        src/app/api/billing/checkout/route.ts \
        src/app/api/mcp-config/route.ts src/app/api/mcp/route.ts \
        src/lib/tools/adapters.ts cli/index.ts package.json \
        .env.example render.yaml vercel.json DEPLOYMENT.md
git commit -m "deploy: make app cloud-portable (Postgres, env-driven URLs, CORS, render/vercel artifacts)"
git push origin HEAD
```

(If you branched, open a PR and merge to `main`; the auto-deploy hooks below watch
`main`.)

---

## 4A. Deploy on Render (recommended — full product, 24/7)

1. Push the repo to GitHub (§3).
2. Render Dashboard → **New → Blueprint** → select your repo. Render reads
   `render.yaml`, creating the **web service** + a **free PostgreSQL** database.
3. Click **Apply**. Render provisions the DB, injects `DATABASE_URL`, generates the
   secret env vars, builds the Docker image, runs `prisma db push` (preDeploy), and
   starts the container.
4. When it's live, copy the service URL (e.g. `https://shadowpaste.onrender.com`),
   set it as **`NEXT_PUBLIC_APP_URL`** in the service's Environment tab, and save
   (triggers a redeploy).
5. Verify: open `https://<your-url>/api/health` → `{"status":"healthy"}`.
6. **Auto-deploy is on**: every push to the connected branch redeploys automatically.

**Free-tier caveats (honest):** the free web service **spins down after ~15 min idle**
and cold-starts on the next hit, and its filesystem is **ephemeral** (in-progress
`.workspaces/` are lost on restart; Postgres data persists). For true always-on +
durable workspaces, upgrade to the **Starter** plan and uncomment the `disk:` block
in `render.yaml` (then set `SHADOWPASTE_PROJECT_ROOTS=/data`).

### Railway alternative
Railway → **New Project → Deploy from GitHub** → it detects the `Dockerfile`. Add a
**PostgreSQL** plugin (sets `DATABASE_URL`), then add the other env vars from §2.
Railway containers are persistent (no idle spin-down on paid; the trial has usage
limits). Auto-deploys on every push.

---

## 4B. Deploy on Vercel (stateless subset only)

> Use this if you want a fast global web UI + API and you **don't** need the
> disk-writing workspace/git-clone features on this host. Pair it with an external
> Postgres (Supabase/Neon) and, ideally, a Render/Railway instance for the full flow.

1. Create a Postgres DB on **Supabase** or **Neon**; copy its connection URI.
2. Push the repo to GitHub (§3).
3. Vercel → **Add New → Project** → import the repo. It detects Next.js and uses
   `vercel.json` (build: `prisma generate && next build`).
4. Add **all env vars from §2** in Project Settings (especially `DATABASE_URL`,
   `AUTH_PEPPER`, `SHADOWPASTE_MASTER_KEY`, `SHADOWPASTE_VAULT_SALT`,
   `NEXT_PUBLIC_APP_URL` = your `*.vercel.app` URL, `TRUST_PROXY=true`).
5. **One-time schema push** (Vercel's build doesn't do it): from your machine, with
   `DATABASE_URL` pointed at the cloud DB:
   ```bash
   DATABASE_URL="postgres://…cloud…" bun run release   # prisma db push
   ```
6. Deploy. Verify `https://<your-app>.vercel.app/api/health`.
7. **Auto-deploy is on**: every push to `main` triggers a new deployment.

**Known non-working on Vercel:** `POST /api/workspace/{create,upload,import,clone}`
and `restore` (they write to disk / shell out to git). The dashboard, auth, vault,
scans, public scanner, and MCP gateway do work.

---

## 5. Connect MCP clients to the deployed instance

After deploy, `GET https://<your-url>/api/mcp-config` returns ready-to-paste configs.
Or manually, in Claude Desktop / Cursor:
```json
{ "mcpServers": { "shadowpaste": {
  "url": "https://<your-url>/api/mcp",
  "headers": { "Authorization": "Bearer <your-agent-api-key>" } } } }
```
(For the Chrome extension against a public host, add your host to the extension's
`host_permissions` and set `ALLOWED_ORIGINS` on the server.)

---

## 6. Post-deploy verification checklist

```bash
BASE=https://<your-url>
curl -s $BASE/api/health                       # {"status":"healthy", ... "28 tools"}
curl -s -X POST $BASE/api/mcp -H 'content-type: application/json' \
     -H 'authorization: Bearer local-dev' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name"' | wc -l   # 28
curl -s -X POST $BASE/api/auth/signup -H 'content-type: application/json' \
     -d '{"email":"you@example.com","password":"a-strong-pass","name":"You"}'
```

---

## 7. Local development after the Postgres switch

Local dev now uses Postgres too (the SQLite era is over, per the goal):
```bash
docker compose up -d db          # starts Postgres from docker-compose.yml
# set DATABASE_URL=postgresql://shadow:shadow@localhost:5432/shadowpaste in .env
bun run db:push                  # apply schema
bun run dev                      # http://localhost:3000
```
Or point `DATABASE_URL` straight at your cloud Supabase/Neon DB for dev-against-cloud.
