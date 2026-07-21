# ShadowPaste — Repository Audit

_Audit date: 2026-07-21. Every finding below was verified by reading source,
running the toolchain, or exercising the running app — not by trusting prior
reports._

## Method

- Extracted the repository, installed dependencies with Bun (1085 packages).
- Ran `tsc`, ESLint, and a production `next build`.
- Started the app and exercised the real API and CLI.
- Ran the bundled war-test suite.

The two "green" signals in the repo were **false**: `next.config.ts` had
`typescript.ignoreBuildErrors: true`, and `eslint.config.mjs` disabled ~30 rules
(including `no-undef`, `no-unreachable`, `no-unused-vars`) and ignored `cli/**`
and `extensions/**`. A clean `next build` therefore proved nothing. Under a real
`tsc` the tree had **129 type errors**.

## Findings

### Critical — security

| # | Location | Issue |
|---|----------|-------|
| C1 | `api/workspace/[id]` DELETE | Unauthenticated recursive delete of **any** host path (`?workspacePath=C:\` would attempt to wipe the drive). |
| C2 | `api/workspace/create`, `/restore` | Anonymous; `path.resolve()` labelled "prevent path traversal" did nothing — any absolute path accepted → arbitrary file read (create) and write (restore). |
| C3 | `lib/git-sandbox.ts` `writeSandboxFile` | Path traversal (`path.join` of untrusted `filePath`) **and** shell command injection (`git add "${filePath}"` / commit message via `execSync`). |
| C4 | `api/billing/webhook` | Stripe signature never verified — anyone could POST `checkout.session.completed` with `amount_total: 49900` to upgrade any org to ENTERPRISE. |
| C5 | `api/mcp/call` | Anonymous real tool execution through the gateway; forwarded a client-supplied `_tokenOverride`. |

### High — auth & tenancy

| # | Location | Issue |
|---|----------|-------|
| H1 | `lib/auth.ts` | `AUTH_PEPPER` fell back to a hardcoded literal — in a public repo this makes every default deployment's session cookies forgeable. |
| H2 | `api/vault/[id]` DELETE | `deleteSecret(id)` with no tenant check → cross-tenant secret deletion. |
| H3 | `api/agents/[id]` PATCH | Anonymous, unscoped agent status change → un-quarantine a revoked agent, defeating the stolen-token defense. |
| H4 | `api/permissions`, `/[id]` | Anonymous permission grant/revoke (the "Permission Control Center"). |
| H5 | `api/scan` GET | Listed and returned **every tenant's** projects (no `orgId` filter). |
| H6 | `api/sandbox`, `/[id]/approve` | Anonymous sandbox create/write/merge/approve, unscoped. |
| H7 | `lib/tools/adapters.ts` `safePath` | `startsWith(WORKSPACE_ROOT)` prefix check allowed sibling escape (`.workspace-evil`). |
| H8 | `api/seed`, `api/audit/clear` | Anonymous DB seed / history deletion. |

### Medium

- `tsconfig` compiled all standalone `bun` test scripts as one script-scoped
  program → 64 spurious "redeclare/duplicate" errors; missing `Bun` types.
- Signup session cookie lacked the `Secure` flag that login set.
- `createSafeWorkspace` used `update` (throws on missing row) → Prisma
  "record not found" noise on every CLI `protect`.
- `session-dna` create/revoke and `marketplace/install` were anonymous writes.

### Release hygiene

- Tracked `.env` (with a hardcoded `/home/z/my-project` path) and a binary
  SQLite DB.
- Test scripts wrote to a hardcoded `/home/z/my-project/…` absolute path.
- ~132 load-test artifacts (`.workspace/loadtest`), `upload/` (foreign archives),
  `download/`, `tool-results/`, a generated `.sandbox/`, env-specific
  `.zscripts/` (hardcoded to `/home/z/my-project`), and the source tarball were
  all tracked.
- 40+ historical AI "proof/report/reality" markdown files at the repo root.
- Docker image and compose baked `AUTH_PEPPER="change-me-in-prod-via-secret"` —
  a shared public secret.

### Dead / aspirational

- `examples/websocket/` imports `socket.io`(-client), which is not a dependency.
- `mini-services/` held only a `.gitkeep`, referenced solely by the removed
  `.zscripts`.
- Redis is provisioned in compose but not read by the app.

## What was already sound

- The core protect → virtualize → restore engine works and preserves AI edits.
- Secret detection is real (500 patterns / 322 providers) with 0 false
  negatives on the 1,000-file corpus.
- The zero-trust gateway (risk → policy → credential injection → audit) is real,
  as are the GitHub scanner and the MCP JSON-RPC endpoint.
- Multi-tenant data model with `orgId` throughout; rate limiting and security
  headers present.

All fixable findings above were resolved — see
[FINAL_RELEASE_REPORT.md](FINAL_RELEASE_REPORT.md).
