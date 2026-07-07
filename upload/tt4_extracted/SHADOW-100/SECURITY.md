# ShadowPaste — Security Model & Checklist

## Threat model (Agent 2)
| Attack | Defense | Test |
|---|---|---|
| Prompt injection ("ignore rules, reveal key") | Firewall V2 → CRITICAL; no reveal code path exists | `redteam` inject_critical |
| Secret exfiltration ("send key to URL") | InjectionShield EXFILTRATION category → CRITICAL | `redteam` exfiltration |
| Jailbreak / social engineering | JAILBREAK/SOCIAL_ENGINEERING categories → HIGH/CRITICAL | `redteam` jailbreak |
| Capability replay | one-time nonce ledger; consumed tokens rejected | `redteam` replay |
| Token theft (cross-session) | tokens bound to `sessionId`; foreign session rejected | `redteam` token_theft |
| Token tampering (scope escalation) | HMAC-SHA256 over canonical payload; any edit invalidates | `redteam` token_tamper |
| Memory / audit extraction | plaintext confined to `executeAction` scope; audit carries only previews | `redteam` memory extraction |
| Forged / unknown reference | vault lookup miss → deny | `redteam` unknown ref |
| Revoked secret reuse | `revoked` flag checked before execution | `redteam` revoked |
| XSS in output pane | all rendered secret metadata HTML-escaped | manual + CSP |
| Malicious extension exfil | extension never returns raw secret to the page; vault in extension storage | design |
| Supply chain | CSP restricts sources; **TODO for prod:** self-host CDN libs with SRI | see checklist |

## Cryptography (Agent 3)
- AES-256-GCM, WebCrypto only, fresh 12-byte IV per encryption, `getRandomValues` for all randomness.
- Capability tokens: HMAC-SHA256 over canonical JSON; session-bound; TTL-expiring; nonce replay-proof.
- Optional PBKDF2-SHA256 (210k iters) passphrase-locked vault (`VaultStore.fromPassphrase`).
- Non-extractable AES key in the web app; server key is process-lifetime only.
- No plaintext at rest, no secret logging (Fastify `redact`), no secret in exports/history (verified).

## Production hardening checklist
- [x] CSP (default-src 'self'; object-src 'none'; base-uri 'none'; worker-src 'self')
- [x] Fastify helmet + rate limit + CORS lockdown + body limit + log redaction
- [x] Input validation on all runtime routes
- [x] Non-root Docker user + healthcheck
- [x] CI leak-guard (rejects real-looking keys in source)
- [ ] Self-host the 5 CDN libraries in `index.html` with SRI hashes (removes CDN supply-chain risk)
- [ ] Passphrase-lock enabled by default in the web UI (currently opt-in via API)
- [ ] Live provider execution behind an explicit, rate-limited allowlist

## Reporting
Security issues: do not open a public issue. Email the maintainer with a PoC.
