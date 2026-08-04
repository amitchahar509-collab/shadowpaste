# R3 — Reel: 501 patterns, zero misses

**Length** 30s vertical (9:16) · **Playlist** Social
**Goal** Show that detection is layered, not just a regex list.

Facts used: FACTS.md → Detection (all rows).

## Narration

> 501 patterns across 322 providers.
> But a pattern list alone misses anything obfuscated.
> So there are three more layers.
> Entropy, for credentials no pattern knows.
> Base64 pre-decoding, for secrets one encoding deep.
> And canonicalization — percent-decoding, Unicode normalization, invisible-character removal.
> A key split by a zero-width joiner matches nothing otherwise.
> One thousand files. One hundred thousand secrets. Zero misses.

~70 words → ~27s.

## Screen recording

| Time | Screen | Action |
|---|---|---|
| 0:00–0:04 | Card | "501 patterns · 322 providers" |
| 0:04–0:10 | Editor | A key with a zero-width joiner in it — show the invisible character revealed by the editor |
| 0:10–0:20 | Diagram | Four layers stacking: patterns → entropy → base64 → canonicalization |
| 0:20–0:27 | Terminal | `bun tests/load-secret-detector.ts` → hold on `False negatives: 0` |
| 0:27–0:30 | End card | Repo URL |

**Crop** 9:16. Burned captions.

## Reproduce

```
bun tests/load-secret-detector.ts
```

Expected: `False negatives | 0`, `Zero-FN constraint | PASS`.

## CTA

Text card only.
