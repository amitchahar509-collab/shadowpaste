# Install & Run — ShadowPaste V11.1 RC

## Requirements
- **Web app:** any static server + a modern browser. Must be served over **https or localhost**
  (WebCrypto needs a secure context; over `file://` the vault disables and falls back to redaction).
- **Runtime server / tests:** Node ≥ 20.
- **Extension:** Chromium browser (MV3).

## 1. Web app (no build)
```bash
python -m http.server 8137      # or: npx serve .
# open http://localhost:8137/index.html
```

## 2. Runtime server
```bash
cp .env.example .env
# generate a signing secret:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # → SHADOWPASTE_HMAC_SECRET
cd server && npm install && npm start
curl localhost:8787/health
```

## 3. Tests
```bash
node --test tests               # unit + red-team suites
# optional live provider test (throwaway key):
OPENAI_API_KEY=sk-... node tests/live-provider.mjs openai
```

## 4. Browser extension
`chrome://extensions` → enable Developer mode → **Load unpacked** → select `apps/extension`.
Supported sites: ChatGPT, Claude, Gemini, Grok, Perplexity. Type a key + Enter → it is virtualized before send.

## 5. Docker
```bash
docker build -t shadowpaste-runtime .
docker run -p 8787:8787 --env-file .env shadowpaste-runtime
```

## Deploy
- **Web app:** static hosting (Vercel / Cloudflare Pages / any) over HTTPS.
- **Runtime:** container (Fly/Render/Cloudflare) with `SHADOWPASTE_HMAC_SECRET` and locked `CORS_ORIGINS`.
See `SECURITY.md` for the production checklist (self-hosting CDN libs is the last open item; SRI pins are already in place).
