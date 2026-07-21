# Installation

## Local development

```bash
git clone https://github.com/OWNER/shadowpaste.git
cd shadowpaste
bun install
cp .env.example .env
bun run db:push          # apply the Prisma schema to SQLite
bun run dev              # http://localhost:3000
```

Requirements: Bun ≥ 1.3, Node ≥ 20.

## Environment

At minimum, set `DATABASE_URL` (the default in `.env.example` targets a local
SQLite file). In production you must also set `AUTH_PEPPER` — see
[CONFIGURATION.md](CONFIGURATION.md). The server refuses auth operations in
production without a unique, non-placeholder `AUTH_PEPPER`.

## Production build

```bash
bun run build            # Next.js standalone output in .next/standalone/
AUTH_PEPPER=$(openssl rand -hex 32) \
DATABASE_URL="postgresql://…" \
NODE_ENV=production \
bun .next/standalone/server.js
```

## Docker Compose

The bundled `docker-compose.yml` brings up the app, PostgreSQL, Redis, and an
MCP stdio bridge.

```bash
export AUTH_PEPPER=$(openssl rand -hex 32)   # required — compose fails without it
docker compose up --build
```

Before deploying against PostgreSQL, switch the Prisma datasource:

1. In `prisma/schema.prisma`, change `provider = "sqlite"` to
   `provider = "postgresql"`.
2. Regenerate and migrate:
   ```bash
   bunx prisma generate
   bunx prisma migrate deploy
   ```

The `DATABASE_URL` in compose already points at the `db` service.

## Reverse proxy

A sample `Caddyfile` is included for TLS termination and reverse-proxying to
the app on port 3000. HTTPS is required in production so that `Secure` session
cookies and HSTS behave correctly.

## Verifying the install

```bash
curl -s http://localhost:3000/api/health
```

A healthy response reports `database`, `vault`, `mcp`, and `github-api` checks.
