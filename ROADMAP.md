# Roadmap

Directional, not a commitment. Community input welcome via issues.

## Near term
- **PostgreSQL as the default** — provide a committed migration set and CI job
  that runs the suite against Postgres, not just SQLite.
- **Redis-backed rate limiting & sessions** — the in-memory limiter resets per
  process; wire the provisioned Redis for multi-instance deployments.
- **Persisted MCP agent API keys** — first-class key management for the MCP
  gateway (issue, rotate, scope, revoke).

## Mid term
- **OAuth & passkey/WebAuthn sign-in** — scaffolding exists; needs client IDs
  and an HTTPS environment to verify.
- **Vault key rotation runbook** — scripted re-encryption of vault entries.
- **Editor extensions GA** — finish and publish the VS Code / Cursor extensions
  under `extensions/`.
- **Scale validation** — exercise the gateway at 100K+ requests and publish
  numbers.

## Longer term
- **Policy authoring UI** — richer, per-scope policy rules beyond allow/ask/deny.
- **SSO / SAML** for enterprise tenants.
- **Self-hosted secret backends** (HashiCorp Vault, cloud KMS) behind the vault
  interface.
- **On-prem / air-gapped deployment** guide.

See [CHANGELOG.md](CHANGELOG.md) for what has shipped.
