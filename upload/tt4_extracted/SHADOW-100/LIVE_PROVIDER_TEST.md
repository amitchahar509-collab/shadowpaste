# Live Provider Test (Phase 2)

**Status: NOT executed in this environment** (no Node, no API key here). Shipped as a real,
opt-in script you run locally with a throwaway key.

## What it proves
A real API call goes through the full path — vault-encrypt → capability mint/verify →
gateway decrypt-in-scope → provider adapter → response — and the raw key never appears in
the result, audit trail, or vault metadata. The script exits non-zero if any leak is found.

## Run
```bash
# use a throwaway / spend-limited key
OPENAI_API_KEY=sk-...     node tests/live-provider.mjs openai
ANTHROPIC_API_KEY=sk-ant-... node tests/live-provider.mjs anthropic
GEMINI_API_KEY=AIza...    node tests/live-provider.mjs gemini
```

## Expected output
```
provider=OPENAI ok=true
response: pong
raw key present in [result/audit/meta]: false
```
Exit 0 = live call succeeded AND no leak. Exit 1 = call failed or a leak was detected.

## Honest caveats
- Not run here; behavior is expected to match the mock-verified path but is **unverified live** until you run it.
- The adapter passes the key in the provider's required header/param; over the wire it reaches the provider
  (that is the point — the *model/agent context* never sees it, the transport does).
- Network egress and provider ToS apply. Revoke the throwaway key afterward.
