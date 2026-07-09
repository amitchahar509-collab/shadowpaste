# Session DNA — Architecture Audit

> Phase 0 — inspect existing systems before adding the trust layer.

## What Exists (reusable)

### Vault (`src/lib/security/vault.ts`)
- AES-GCM-256 encrypted secret storage
- HMAC-SHA256 capability tokens (single-use, session-bound, time-limited)
- `storeSecret()`, `retrieveSecret()`, `injectCredential()`, `consumeCredential()`
- **Reusable**: vault key management, encryption, redaction

### Capability Engine (`src/lib/security/capability.ts`)
- `CapabilityEngine` class with HMAC-signed tokens
- Tokens are session-bound, scoped, time-limited, single-use (nonce)
- `mint()`, `verify()`, `consume()`
- **Reusable**: token verification logic, nonce tracking

### Crypto (`src/lib/security/crypto.ts`)
- AES-GCM-256, HMAC-SHA256, PBKDF2, SHA-256
- `randomBytes()`, `randomId()`, `bufToB64()`, `b64ToBuf()`
- **Reusable**: all primitives
- **Missing**: Ed25519 key generation/signing (verified available in Node 20+ WebCrypto)

### MCP Gateway (`src/lib/gateway.ts`)
- Zero-trust pipeline: agent → risk → policy → execute → audit
- Agent identity check (revoked/suspended blocked)
- **Reusable**: gateway pipeline, agent status enforcement

### Audit Trail (`AuditLog` model + `/api/audit-logs`)
- Every action recorded: vault.store, agent.create, tool.invoke, scan.run
- CSV export, org-scoped
- **Reusable**: audit log storage, query
- **Missing**: hash chain + signatures (no tamper detection)

### Flight Recorder (`ToolCall` model)
- Records every tool call with decision, risk, input/output (redacted)
- **Reusable**: tool call recording
- **Missing**: cryptographic signing

## What Must Change

| Gap | Fix | Phase |
|-----|-----|-------|
| No Ed25519 session identity | Add `SessionDNA` with keypair + fingerprint | P1 |
| Secrets not session-bound | Encrypt fake secret mapping with session key | P3 |
| Audit logs not tamper-proof | Add hash chain + Ed25519 signatures | P4 |
| No instant session revoke | Add kill switch with session status check | P6 |
| No session verification in MCP | Bind MCP calls to Session DNA | P9 |
| No visual session trust | Add Agent Session View to dashboard | P10 |

## Design Principles
1. **No rewrite** — add on top of existing vault/capability/gateway
2. **Real cryptography** — Ed25519 (verified available), no fake crypto
3. **Hardware key storage** — design for Keychain/TPM, fallback to encrypted local
4. **Test every claim** — red team war test (7 attacks)
5. **Minimal change** — reuse existing crypto primitives where possible
