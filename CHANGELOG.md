# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- AI provider abstraction (`src/lib/ai/provider.ts`) — OpenAI / Anthropic / Gemini
  with credential resolution, timeout, retry, cancellation, provider fallback and
  token + cost accounting. Returns `PROVIDER_NOT_CONFIGURED` when no key is set;
  never fabricates a response.
- MCP adapters: `network.fetch`, `network.webhook` (SSRF-guarded, allowlist-only,
  with DNS-rebinding defence), `fs.delete`, `github.pr.merge`,
  `github.secret.access` (names only), `github.admin` (bounded read-only action
  allowlist), `db.write` (INSERT/UPDATE only), `stripe.refund`,
  `stripe.customer.delete` (both test-key enforced), and `shell.read`
  (strict binary+argument allowlist, argv exec — no shell interpretation).
- MCP protocol version negotiation for `2025-06-18` / `2025-03-26` / `2024-11-05`.
- OAuth 2.0 discovery + dynamic client registration endpoints (stubs — see Security).
- Deployment artifacts: `render.yaml`, `vercel.json`, cross-platform `postbuild.mjs`.

### Changed
- Database provider migrated from SQLite to PostgreSQL (`DATABASE_URL` only).
- `tools/list` now publishes a JSON Schema `required[]` array derived from the same
  source of truth the runtime validator uses, so schema and validation cannot drift.
- `/api/health` reports version `1.0.0`, matching `package.json` (was `20.0.0`).

### Fixed
- **CI was failing on every run** since the PostgreSQL migration: the workflow
  pinned a SQLite `file:` `DATABASE_URL` against a `postgresql` provider, so
  `prisma generate` aborted with P1012. Now uses a `postgresql://` URL plus a
  `postgres:16` service container for the test job.
- Tool metadata drift: `ai.generate` had a working dispatcher case but was absent
  from `IMPLEMENTED_TOOLS`, so `tools/list` advertised it as unimplemented.
- Risk-engine/registry drift: the three `shadowpaste.*` tools had no explicit risk
  entry and fell through to the generic default, contradicting their advertised score.
- Test harness: eight suites used a 2 s readiness probe against an endpoint that
  takes 4–6 s on a remote database, so they silently **skipped** while exiting 0.
  Replaced with a retried probe; all of them now execute.
- MCP tool `inputSchema` properties emitted bare type strings instead of JSON Schema
  objects, causing strict clients to drop every tool.
- Vault master key is derived from a persisted passphrase (PBKDF2) instead of being
  regenerated per process, which previously destroyed all vaulted secrets on restart.

### Security
- Verified live: prompt injection (50/50 payloads caught), tenant isolation (10/10),
  replay/stolen-token (6/6), rate limiting (6/6), billing enforcement (6/6),
  SSRF blocking, SQL validation, and shell-injection rejection.
- **Known limitation:** the `/oauth/*` endpoints are non-authenticating stubs —
  they complete the connector registration handshake but do not verify identity.
  Do not expose a public instance holding real secrets until real OAuth lands.

## [1.0.0] — 2026-07-21

First public release. Hardened for open-source distribution.

### Security
- Require authentication on all mutating and file-touching endpoints
  (workspace create/restore/list/delete, MCP call, scan, agents, permissions,
  vault delete, sandbox, session DNA, marketplace install, red-team run,
  audit clear).
- Confine caller-supplied filesystem paths to `SHADOWPASTE_PROJECT_ROOTS`
  (new `src/lib/security/paths.ts`); fix a workspace-delete path that could
  target any host directory.
- Fix path-prefix escape in the tool sandbox (`safePath`) and a path-traversal
  + shell command-injection in the git sandbox `writeSandboxFile`
  (`execFileSync` with argument arrays).
- Verify Stripe webhook signatures (HMAC-SHA256 + timestamp tolerance); reject
  unverified webhooks in production.
- Enforce tenant scoping on vault delete, agent update, permissions, sandbox,
  and the `/api/scan` project listing (previously cross-tenant).
- Require a unique, non-placeholder `AUTH_PEPPER` in production; reject known
  placeholder values. Remove baked-in default from the Docker image/compose.
- Gate `/api/seed` in production behind `SEED_TOKEN`.
- Set the `Secure` cookie flag on signup sessions (was login-only).

### Changed
- Enforce TypeScript checking in the production build
  (`ignoreBuildErrors: false`) and enable React strict mode.
- Add `bun run typecheck` and split type checking into `tsconfig.json` (app)
  and `tsconfig.node.json` (CLI/tests).
- CI: add an enforced typecheck job; make the build job enforce; update the
  smoke check to assert anonymous mutations are rejected.
- `createSafeWorkspace` uses `updateMany` so the CLI's ephemeral project ids no
  longer emit Prisma "record not found" noise.

### Fixed
- Resolve all app + CLI + test type errors (was 129).
- Make war-test scripts authenticate; harden the rate-limit test against the
  token-bucket refill trickle; rewrite hardcoded local output paths to relative.

### Removed
- Local development artifacts and generated data (`.workspace/` load-test files,
  `upload/`, `download/`, `tool-results/`, generated `.sandbox/`, `.zscripts/`,
  the source tarball) and 40+ historical AI "proof/report" markdown files.
- The tracked `.env` and local SQLite database (now gitignored;
  `.env.example` provided).

### Documentation
- New README plus `docs/` (Quick Start, Installation, Configuration,
  Architecture, Developer Guide, API Reference, Troubleshooting, Security),
  `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `ROADMAP.md`, `LICENSE`
  (MIT), and GitHub issue/PR templates.
