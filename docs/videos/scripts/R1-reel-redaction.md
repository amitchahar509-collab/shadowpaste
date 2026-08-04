# R1 — Reel: the secret your agent never sees

**Length** 30s vertical (9:16) · **Playlist** Social
**Goal** One idea, one proof. Autoplays muted, so captions carry it.

Facts used: FACTS.md → Detection, response-side sanitization.

## Narration (captions carry this; VO optional)

> A tool result comes back from GitHub.
> It has credentials in it.
> ShadowPaste re-scans results on the way back — not just on the way in.
> Every secret is replaced before the agent's context ever sees it.
> The agent gets a marker and a notice. Not the key.
> Vaulted, encrypted, still yours.

~55 words → ~22s.

## Screen recording

| Time | Screen | Action |
|---|---|---|
| 0:00–0:03 | Cold open | Terminal, tool call already typed |
| 0:03–0:10 | Terminal | Response lands, a credential visible in the raw body (use a fixture key, never a real one) |
| 0:10–0:20 | Terminal | Same call through the gateway — the value is now `{{SHADOW_REDACTED:...}}`, with the `notice` field visible |
| 0:20–0:27 | Card | "Scanned on the way OUT, not just in." |
| 0:27–0:30 | End card | Repo URL |

**Crop** 9:16, JSON scaled so the marker is legible on a phone. Burned captions mandatory.

**Camera** Locked. **Transitions** Cut.

## Reproduce

Use a fixture credential from `src/lib/security/demo-fixtures.ts`. Never record a
real key, even briefly, even blurred.

## CTA

Text card: `github.com/amitchahar509-collab/shadowpaste`
