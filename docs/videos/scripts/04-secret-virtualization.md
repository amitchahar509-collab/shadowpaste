# 04 — Secret virtualization: how fakes keep code running

**Length** 3m · **Audience** developers · **Playlists** Beginner, Advanced
**Goal** The viewer understands why a *format-compatible* fake is the whole idea,
and trusts that their project will still build inside the workspace.

Facts used: FACTS.md → Detection, Crypto (vault), Product surface (CLI).

---

## Narration

> Redacting a secret breaks your code. Replace `sk_live_…` with `REDACTED` and the
> Stripe client throws on startup, the AI sees a stack trace instead of your
> application, and you have made the problem worse.
>
> So ShadowPaste does not redact. It substitutes.
>
> Here is a project with four real credentials — Stripe, AWS, GitHub, and a
> Postgres URL with an inline password.
>
> Run protect.
>
> Six findings. The four you can see, plus the password inside the connection
> string, plus one the entropy detector caught on its own.
>
> Each one is encrypted into a local vault — AES-GCM-256, key derived with PBKDF2
> at two hundred and ten thousand iterations — and replaced with a fake that has
> the same shape.
>
> The Stripe key becomes a Stripe test-mode key. The AWS key keeps the AKIA prefix
> and fails the checksum. The Postgres URL still parses as a URL; it just points
> at a host that does not exist.
>
> Which means this still runs.
>
> Same test suite, inside the workspace, against the fakes. It passes, because
> nothing about the *shape* changed — only the value, and the value was never
> what the code needed to parse.
>
> Detection is not just a pattern list, though the list matters — 501 patterns
> across 322 providers. There are three other layers underneath.
>
> Entropy, for credentials no pattern knows about. Base64 pre-decoding, for
> secrets hidden one encoding deep. And a canonicalization ladder — percent
> decoding, Unicode normalization, invisible-character removal — because a key
> split by a zero-width joiner matches nothing at all otherwise.
>
> On a corpus of a thousand files and a hundred thousand secrets: zero false
> negatives.
>
> One thing that is not automatic. Files with no secret in them are copied
> byte-for-byte, not rewritten — so images, binaries, and files with a byte-order
> mark come through the workspace unchanged. That is deliberate. A workspace that
> quietly re-encodes your files is not a safe copy.

**Word count** ~360 → ~2m 20s, leaving room for held terminal output.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:03 | Intro | |
| 0:03–0:18 | Editor | A `.env` with the four credentials. Then a "naive" version with `REDACTED` and a terminal showing the app crashing on boot. |
| 0:18–0:35 | Terminal | `bun run cli/index.ts protect -p ./demo-project`. Real output. Hold on the `Protected secrets:` list. |
| 0:35–0:55 | Split editor | Original left, workspace right, scrolled in sync. Four highlight pairs, one at a time. |
| 0:55–1:15 | Card | Real → fake table: `sk_live_…`→`sk_test_shadow…`, `AKIA…`→`AKIASHADOW…`, `postgresql://admin:pass@host`→`postgresql://shadow:shadow@shadow-db` |
| 1:15–1:35 | Terminal | `cd` into the workspace, run the project's own test suite. Let it pass on camera, unedited. |
| 1:35–2:05 | Diagram | Four detection layers stacked: patterns → entropy → base64 → canonicalization. Build one at a time. |
| 2:05–2:20 | Terminal | `bun tests/load-secret-detector.ts` — hold on `False negatives: 0` |
| 2:20–2:45 | Editor + terminal | A binary and a BOM'd file; `cmp` between source and workspace copy showing they are identical |
| 2:45–3:00 | Outro | |

**Camera** Static on terminal. The split-editor section may scroll, slowly, once.

**Transitions** Cut. The only exception is the four-layer diagram, which builds
with a 200ms fade per layer.

---

## Reproduce this take

```bash
bun run cli/index.ts protect -p ./demo-project
```

```bash
bun tests/load-secret-detector.ts
```

Expected: `False negatives | 0` and `Zero-FN constraint | PASS`.

```bash
cmp ./demo-project/logo.png ./.workspaces/<org>/<ws>/logo.png && echo "byte-identical"
```

---

## CTA

> Run protect on a project you know well and read the workspace diff. If it finds
> something you did not know was in there, that is the point.
> `github.com/amitchahar509-collab/shadowpaste`
