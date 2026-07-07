# ShadowPaste — Security Model (V15)

> **SOC2-ready architecture. NOT SOC2 certified.** No audit has been performed. This document
> describes controls the design supports; it is not an attestation.

## Trust boundary
- **Plaintext secrets exist only on the client**, briefly, during detection/encryption/restore.
- The **vault stores ciphertext** (AES-GCM-256). The vault key is non-extractable (browser) or
  passphrase-derived via PBKDF2 (`packages/sync`) for cross-device use.
- The **server (when deployed) never receives plaintext**: sync uploads client-encrypted bundles
  (`packages/sync`), and the Prisma `SecretVault` model has only `iv` + `cipher` columns — no plaintext field.
  Proven by test: `sync — server bundle never contains plaintext`.

## Controls
| Control | Mechanism | Status |
|---|---|---|
| Encryption at rest | AES-GCM-256, per-secret IV | REAL, tested |
| Key derivation | PBKDF2-SHA256 210k (passphrase) | REAL, tested |
| Password storage | PBKDF2-SHA256 210k + salt | REAL, tested (`packages/auth`) |
| Session tokens | HMAC-signed access/refresh, TTL, rotation, revoke | REAL, tested |
| Brute-force protection | per-identifier lockout | REAL, tested |
| Capability tokens | session-bound, scoped, one-time, HMAC | REAL, tested |
| RBAC | role→permission matrix + enforce | REAL (policy), tested |
| Prompt-injection defense | firewall + shield, CRITICAL auto-deny | REAL, tested |
| Audit logging | `AuditLog` model + activity trail | Schema REAL; server wiring UNVERIFIED |
| Encryption rotation | `rotate()` re-encrypts under fresh IV/reference | REAL (vault), tested |
| SSO / OAuth | `OAuthAccount` model + provider abstraction | Schema REAL; flow UNVERIFIED (no server run) |
| Org policies | RBAC + org plan gating | Partial |
| CSRF / secure cookies | documented for server | UNVERIFIED (no server run) |
| Supply chain | CSP + SRI pins on all CDN libs | REAL, verified |

## Incident response (foundation)
- Revoke a secret (`vault.revoke`) → gateway refuses all future use immediately (tested).
- Rotate a secret → old reference dies, new one issued (tested).
- Purge vault → all ciphertext destroyed (tested).
- Audit trail records every gateway request and firewall decision (never contains secrets — tested).

## Data handling
- No telemetry. No third-party analytics. No secret ever leaves the device unencrypted.
- Exports (TXT/JSON/MD) and history are verified secret-free.

## Honest gaps (must close before any compliance claim)
- Server-side auth/session/audit **not executed** in this environment (no Node/Postgres).
- No penetration test, no formal key-management (HSM/KMS), no data-retention automation.
- CSRF/cookie/OAuth/WebAuthn flows are designed, not run.
