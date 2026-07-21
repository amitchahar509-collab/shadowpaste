# Architecture

ShadowPaste is a single Next.js 16 application (App Router) plus a Bun CLI that
shares the same core libraries. It ships three surfaces over one codebase:

1. **Web dashboard** — React 19 UI, 13 modules (`src/components/shadowpaste/`).
2. **HTTP/JSON API** — route handlers under `src/app/api/`.
3. **CLI** — `cli/index.ts`, importing the same `src/lib` engine directly.

## Core engine (`src/lib`)

| Module | Responsibility |
|--------|----------------|
| `workspace.ts` | Scan a project, virtualize secrets into a workspace copy, restore real secrets back (preserving AI edits). |
| `security/detector.ts` + `security/secret-patterns.ts` | Secret detection — 500 patterns / 322 providers + entropy. |
| `security/fake-secrets.ts` | Generate format-compatible fakes per provider. |
| `security/vault.ts` | AES-GCM-256 vault, capability-token minting, secret redaction. |
| `security/crypto.ts` | WebCrypto primitives (AES-GCM, HMAC, PBKDF2, SHA-256). |
| `security/paths.ts` | Filesystem confinement for caller-supplied paths. |
| `security/session-dna.ts`, `session-capsule.ts` | Per-session signing identities + tamper-evident capsules. |
| `gateway.ts` | The zero-trust tool-execution pipeline. |
| `tools/adapters.ts` | Real side-effecting tool adapters (fs, GitHub, db, …). |
| `auth.ts` | Session auth, password hashing, org resolution, RBAC. |
| `rate-limit.ts`, `risk.ts`, `policy.ts`, `rbac.ts` | Cross-cutting controls. |
| `github-scanner.ts` | Real GitHub REST scanning. |
| `billing.ts` | Plan limits and usage enforcement. |

## The zero-trust gateway

Every AI tool call goes through one pipeline (`src/lib/gateway.ts`):

```
Agent → MCP endpoint → resolve identity → Risk scoring → Policy decision
      → Credential injection (capability token, never the raw secret)
      → Tool adapter (real side effect) → Audit (secrets redacted)
```

A tool never executes without identity, a policy allow, and an audit record.
Destructive database operations (DROP/TRUNCATE/unscoped DELETE) are hard-denied,
and filesystem adapters are confined to the sandbox root.

## The protect / restore flow

```
createSafeWorkspace(sourcePath)          restoreSecrets(workspacePath, sourcePath)
  walk source tree                          walk workspace tree
  scanForSecrets(file)                       for files with secrets:
  virtualizeWithFakes(file) ─┐                 swap fake → real
  storeSecret(real) → vault  │                 write back to source
  write fake to workspace ◄──┘               for other files:
                                               copy back verbatim (AI edits kept)
```

The HTTP endpoints require authentication and confine paths to
`SHADOWPASTE_PROJECT_ROOTS`; the CLI operates directly on local paths.

## Multi-tenancy

Every persistent record is scoped to an `Organization`. Request handlers resolve
an org from the session (`getContext`) and filter every query by `orgId`. Agents,
vault entries, permissions, sandbox changes, and projects all enforce
`resource.orgId === ctx.orgId`.

## Data model

Prisma schema in `prisma/schema.prisma`: `User`, `Organization`, `Membership`,
`Agent`, `Session`, `Permission`, `ToolCall`, `VaultEntry`, `Project`, `Scan`,
`SandboxChange`, `AuditLog`, `AttackTest`, `McpPackage`, `PublicScan`, and more.
SQLite in development; PostgreSQL in production.

## Request security layers

1. `src/middleware.ts` — security headers (CSP/HSTS/X-Frame/…) on every response.
2. Rate limiting per endpoint class (`rate-limit.ts`).
3. Authentication + tenant scoping in each mutating handler.
4. Path confinement + input validation in the engine.
5. Audit logging of security-relevant actions.
