# Known Limitations — ShadowPaste V11.1 RC (honest)

## Verified but bounded
- **Bulk paste of hundreds of secrets** is a few seconds, not instant. 1000 secrets in one paste ≈ 2.2s
  (down from 9.1s), the residual being DOM rendering of that many vault cards. Typical `.env` (5–50 keys) is instant.
- **Vault key is origin-bound, not passphrase-locked by default.** Anyone at the unlocked browser profile can
  *use* (not read) secrets. A PBKDF2 passphrase lock exists (`VaultStore.fromPassphrase`) but is opt-in via API,
  not wired into the web UI yet.
- **Decrypted plaintext can't be zeroed** — JS strings are immutable; it's dereferenced after use, GC-timed.

## Not executed in the shipping environment (needs Node/Docker/network)
- Fastify server, `node --test` suites, Docker build, and the **live provider call** are code-complete and
  runnable, but were verified only via the identical browser code path. Run them locally to confirm.

## Genuinely missing (do not assume present)
- **Live provider execution is unproven** until you run `tests/live-provider.mjs` with a real key.
- **Extension is not load-tested here** — selectors are heuristic and AI sites change their DOM; the send-interception
  and leak scanner may need selector updates over time. Static-audited, not run in a live browser this pass.
- **No enterprise layer:** no multi-user vault sync, RBAC, SSO/SCIM, org audit export, or server-side persistent
  encrypted store (the server vault is process-memory only and clears on restart).
- **CDN libraries are SRI-pinned but not self-hosted** — pins prevent tampering; a fully air-gapped build should
  vendor them locally.

## Security scope (what the model boundary does and doesn't cover)
- ShadowPaste keeps the raw secret out of the **AI/model context, logs, exports, and history**.
- It does **not** claim to defend a fully compromised same-origin page or a malicious browser extension running
  alongside it; CSP + SRI reduce, not eliminate, that surface.
