# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/), and this project adheres to
[Semantic Versioning](https://semver.org/).

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
