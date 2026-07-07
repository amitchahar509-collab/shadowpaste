# ShadowPaste V8 — AI Credential Runtime & Agent Security Layer

Detect secrets → encrypt into a local vault → hand the AI a scoped capability
reference → let an agent *use* the secret through a firewalled runtime that
decrypts in-scope, injects into the provider call, and returns only the result.
**Raw secrets are never sent to the AI context, logs, errors, history, or exports.**

## Repository layout
```
apps/
  web/            → the browser app (canonical file is ../index.html)
  extension/      → MV3 extension (ChatGPT/Claude/Gemini/Grok) — Secret Interceptor
packages/
  crypto/         → AES-GCM, HMAC, PBKDF2 (isomorphic WebCrypto)   [verified]
  capability/     → session-bound, one-time, signed tokens          [verified]
  security/       → detectors, classifier, entropy, Firewall V2     [verified]
  providers/      → OpenAI / Anthropic / Gemini adapters            [verified vs mock]
  gateway/        → VaultStore + runtime execution core             [verified]
server/           → Fastify runtime server (5 routes)               [run with Node]
tests/            → node:test suite (7 mission tests)               [run with Node]
index.html        → single-file web app (glassmorphism UI, IndexedDB vault)
sw.js, manifest.webmanifest, Dockerfile, .env.example
REALITY_REPORT.md → honest per-feature status
```

## Run the web app (no build)
```bash
python -m http.server 8137        # or any static server, over https/localhost
# open http://localhost:8137/index.html
```
WebCrypto requires a secure context: `https://` or `localhost`. Over `file://`
the vault disables itself and falls back to destructive redaction.

## Run the runtime server (Node ≥20)
```bash
cp .env.example .env              # set SHADOWPASTE_HMAC_SECRET
cd server && npm install && npm start
curl localhost:8787/health
```
### Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/vault/request` | encrypt a secret, return a capability reference |
| POST | `/capability/create` | mint a session-bound token for a reference+action |
| POST | `/capability/verify` | validate a token (signature/expiry/scope/replay) |
| POST | `/runtime/execute` | firewall → decrypt-in-scope → provider call → result only |
| POST/GET | `/audit/event` | append / read the audit trail (never contains secrets) |

## Run tests (Node ≥20)
```bash
node --test tests
```
Covers the 7 mission tests using an in-process mock provider (no API key needed).

## Load the extension
`chrome://extensions` → Developer mode → Load unpacked → `apps/extension`.
On a supported AI site, typing a key and pressing Enter virtualizes it before send.

## Docker
```bash
docker build -t shadowpaste-runtime .
docker run -p 8787:8787 --env-file .env shadowpaste-runtime
```

See `REALITY_REPORT.md` for the honest, per-feature `[REAL]/[PARTIAL]/[SIMULATED]/[MISSING]` audit.
