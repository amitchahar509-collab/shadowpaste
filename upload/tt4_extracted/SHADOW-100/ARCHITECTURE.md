# ShadowPaste V11 — Architecture Map (Agent 1)

## Runtime flow
```
┌──────────────────────┐   ┌──────────────────────┐
│  Browser Extension   │   │   Web App (index.html)│
│  content.js          │   │   glassmorphism UI     │
│  Secret Interceptor  │   │   IndexedDB vault      │
└──────────┬───────────┘   └───────────┬───────────┘
           │ virtualize                │ virtualize / execute
           ▼                           ▼
        ┌───────────────────────────────────────┐
        │  packages/runtime  (createRuntime)     │  ← single façade
        └───────────────────┬───────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │  packages/security  (Firewall V2)      │  WHO/WHAT/WHY/RISK
        │  prompt-injection shield · classifier  │  LOW→CRITICAL
        └───────────────────┬───────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │  packages/capability (CapabilityEngine)│  HMAC-signed, session-bound,
        │  mint · verify · one-time nonce        │  scoped, expiring
        └───────────────────┬───────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │  packages/gateway (Gateway + VaultStore)│  decrypt-in-scope → cleanup
        │  packages/crypto  (AES-GCM · PBKDF2)    │  ciphertext-only at rest
        └───────────────────┬───────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │  packages/providers (adapters)          │  OpenAI · Anthropic · Gemini
        └───────────────────┬───────────────────┘
                            ▼
                     ┌──────────────┐
                     │   AI APIs    │  (key injected in-memory only)
                     └──────────────┘

server/server.mjs exposes the same pipeline over HTTP:
  /policy/check → /vault/request → /capability/create|verify → /runtime/execute → /audit/event
```

## Boundaries (clean separation)
- **crypto** knows nothing about vaults or HTTP — pure primitives.
- **capability** depends only on crypto.
- **security** is pure functions (no I/O, no keys).
- **gateway** composes vault + capability + firewall + providers; the *only* place plaintext appears (inside `#executeAction`).
- **runtime** is the single composition façade for both browser and Node.
- **server** is a thin Fastify wrapper over `runtime`/`gateway`; **extension** is standalone with the same detection contracts.

## Known duplication (honest)
`index.html` still embeds an inline copy of the detection/crypto/gateway logic rather than importing `packages/`.
This is intentional for now (keeps the zero-build single-file app and the SW scope working). The module APIs are
aligned so a future pass can replace the inline `<script>` with `import`s from `packages/` with no behavior change.
