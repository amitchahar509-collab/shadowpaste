# Contributing to ShadowPaste

Thanks for your interest in improving ShadowPaste!

## Getting started

```bash
bun install
cp .env.example .env
bun run db:push
bun run dev
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the full developer guide.

## Before opening a pull request

Run all three gates locally — CI runs the same:

```bash
bun run lint
bun run typecheck        # app + cli/tests must both be clean
bun run build            # production build (type-checked)
```

For changes to security, auth, or the gateway, also run the war tests:

```bash
bun run dev &            # in another shell
bun run test:integration
```

## Ground rules for changes

- **Auth & tenancy:** any new mutating or file-touching endpoint must require
  authentication and scope every query by `orgId`.
- **Paths:** route caller-supplied filesystem paths through
  `src/lib/security/paths.ts` (HTTP) or the sandbox confinement helpers. Never
  `path.join` untrusted input without an `isWithin` check.
- **Secrets:** never log raw secrets; let the gateway redact before persistence.
- **No hardcoded secrets** — CI's secret scanner will fail the build.
- **Types:** keep both `tsconfig.json` and `tsconfig.node.json` at zero errors.

## Commit & PR style

- Small, focused PRs with a clear description of the problem and the fix.
- Reference any issue the PR closes.
- Add or update tests when you change behavior.

## Reporting security issues

Please do **not** open a public issue for vulnerabilities. Follow
[SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
