# Developer Guide

## Prerequisites

- Bun ≥ 1.3, Node ≥ 20

## Setup

```bash
bun install
cp .env.example .env
bun run db:push
```

## Scripts

| Script | What it does |
|--------|--------------|
| `bun run dev` | Next.js dev server on :3000 |
| `bun run build` | Production standalone build (type-checked) |
| `bun run start` | Run the standalone build |
| `bun run lint` | ESLint over the app |
| `bun run typecheck` | `tsc` for the app **and** the CLI/test surfaces |
| `bun run test` | Full war-test suite (starts a dev server) |
| `bun run test:unit` | Secret-detector benchmark (no server) |
| `bun run test:integration` | MCP + attack integration tests |
| `bun run db:push` / `db:generate` / `db:migrate` / `db:reset` | Prisma helpers |

## Type checking

Two TypeScript projects:

- `tsconfig.json` — the Next.js app (`src/`), DOM libs, strict. Enforced by
  `next build` (`ignoreBuildErrors: false`).
- `tsconfig.node.json` — the Bun/Node surfaces (`cli/`, `tests/`) with Bun types
  and `moduleDetection: "force"`.

`bun run typecheck` runs both. Both must be clean.

## Project layout

```
src/
  app/              Next.js App Router (pages + api/ route handlers)
  components/       UI — shadcn/ui primitives + shadowpaste/ modules
  lib/              Core engine (see docs/ARCHITECTURE.md)
  middleware.ts     Security headers
cli/index.ts        The shadowpaste CLI
prisma/schema.prisma  Data model
tests/              War-test suite (bun scripts) + _auth.ts helper
extensions/         VS Code / Cursor extensions (own build)
```

## Tests

Integration tests need a running server. `tests/run-all.sh` starts a dev server,
seeds it, and runs the suite. Individual tests:

```bash
bun run dev &                          # in one shell
bun run tests/attack-tenant-isolation.ts
```

Tests that hit mutating endpoints authenticate via `tests/_auth.ts` (throwaway
signup → session cookie). If the server is unreachable they print `SKIP` and
exit 0.

## Conventions

- Every mutating / file-touching API route requires authentication and scopes
  its queries by `orgId`.
- Caller-supplied filesystem paths go through `src/lib/security/paths.ts` (HTTP)
  or the sandbox `safePath`/confinement helpers.
- Never log raw secrets; the gateway redacts before persistence.
