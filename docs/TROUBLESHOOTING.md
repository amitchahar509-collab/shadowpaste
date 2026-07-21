# Troubleshooting

### `AUTH_PEPPER must be set…` on a production server
The app refuses auth in production without a unique, non-placeholder
`AUTH_PEPPER`. Set one: `export AUTH_PEPPER=$(openssl rand -hex 32)`. Placeholder
values (`change-me-in-prod-via-secret`, `changeme`, …) are rejected on purpose.

### `sourcePath is outside the allowed project roots`
The HTTP workspace API confines paths to `SHADOWPASTE_PROJECT_ROOTS` (default:
the server's working directory). Add the location:
`SHADOWPASTE_PROJECT_ROOTS=/path/one:/path/two` (use `;` on Windows). The CLI is
not affected — it works on whatever local path you pass it.

### `401 authentication required`
Mutating and file-touching endpoints require a session. Sign up / log in first,
then send the `sp_session` cookie or a `Authorization: Bearer <token>` header.

### `/api/seed` returns "seeding is disabled in production"
Seeding is gated in production. Set `SEED_TOKEN` and pass `?token=` or the
`X-Seed-Token` header, or run in a non-production environment.

### `next start` warns about `output: standalone`
Expected. For the standalone build, run `bun .next/standalone/server.js` (or the
`start` script) rather than `next start`.

### Health check shows `github-api: false` / status `degraded`
The health endpoint probes `api.github.com`; a slow or blocked network makes
that check time out. Database, vault, and MCP being `ok` means the app itself is
healthy.

### Prisma "record not found" noise from the CLI
Fixed — `createSafeWorkspace` uses `updateMany` so the CLI's ephemeral project
ids are a silent no-op. If you see it, you are on an older build; rebuild.

### Database errors after pulling changes
Re-apply the schema: `bun run db:push` (SQLite) or `bunx prisma migrate deploy`
(PostgreSQL), and regenerate the client with `bun run db:generate`.

### Port 3000 already in use
Another server instance is running. Stop it, or start on another port with
`PORT=3001 bun run dev`.

### Docker: `AUTH_PEPPER` variable is not set
`docker-compose.yml` requires it. `export AUTH_PEPPER=$(openssl rand -hex 32)`
before `docker compose up`.
