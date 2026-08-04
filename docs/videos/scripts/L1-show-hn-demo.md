# L1 — Show HN demo

**Length** 90s · **Audience** Hacker News · **Playlist** Launch
**Goal** Survive HN. That audience forgives a disclosed weakness and destroys a
discovered one, so the limitations are in the video, not in a reply thread.

Facts used: FACTS.md → all, especially the "must NOT claim" list.

---

## Narration

> ShadowPaste is an AI-agent security control plane. Self-hosted, MIT.
>
> Two things.
>
> One: it finds real credentials in your project, encrypts them into a local
> vault, and writes format-compatible fakes in their place — so the code still
> parses and the tests still pass while the AI works on a copy where every
> credential is dead. 501 patterns across 322 providers, plus entropy,
> base64 pre-decoding, and a canonicalization pass for obfuscated keys. Zero
> misses on a hundred-thousand-secret corpus.
>
> Two: it puts a gateway between the agent and your real systems. Risk score,
> policy decision, single-use credential, execute, sanitize, audit.
>
> Here is an agent asking for cloud metadata. Blocked, ninety-five. Path
> traversal, blocked. A query for password hashes, blocked. Repository deletion is
> permanently denied — six tools are, and no configuration raises them.
>
> The audit trail is hash-chained, so it can be verified after the fact rather
> than trusted.
>
> Now the parts that will get asked about, so they may as well come from me.
>
> The sandbox is a policy decision, not container isolation. Docker's MCP gateway
> has real isolation and this does not. What this has instead is OAuth 2.1
> identity binding, per-tool risk policy, and a verifiable audit chain in one
> self-hostable box.
>
> Two registered tools are not implemented. Rate limits are per-instance unless
> you configure Redis. Workspaces are ephemeral on serverless. No SOC 2, no SLA,
> pre-1.0.
>
> It runs on your infrastructure. There is no hosted service and no account.

**Word count** ~245 → ~1m 35s. Trim the detection-layer clause if over 90s.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:04 | Intro | Shield, wordmark, tagline |
| 0:04–0:14 | Editor | Real `.env`, then the workspace copy beside it with fakes |
| 0:14–0:26 | Terminal | `protect` output, then the project's own tests passing inside the workspace |
| 0:26–0:34 | Terminal | `load-secret-detector` → `False negatives: 0` |
| 0:34–0:42 | Diagram | Six-stage gateway pipeline |
| 0:42–1:02 | Terminal | Four attacks back to back, each held ~4s on the decision line |
| 1:02–1:10 | Terminal | `audit/verify` → ok, then tampered → 409 |
| 1:10–1:28 | Card sequence, amber | Limitations, one per card, ~4s each. Same typeface as everything else — do not visually downplay them. |
| 1:28–1:32 | Terminal | `docker compose up -d db && bun run dev` |
| 1:32–1:36 | Outro | Repo, MIT, "no hosted service" |

**Camera** Locked off. **Transitions** Cut only.

---

## Reproduce this take

Every command is in scripts 04, 06, 07 and 10. Nothing in this video is a
composite — each terminal moment is a single unedited take.

---

## The question you will be asked, and the answer

> *"How is this different from Docker's MCP gateway?"*

Answer honestly and first: Docker has container isolation and `--block-secrets`;
this does not have container isolation. This has OAuth 2.1 identity binding,
per-tool risk scoring with hard denials, and a tamper-evident audit chain in one
self-hostable service. Different trade-off, stated plainly. Do not claim parity.

---

## CTA

> `github.com/amitchahar509-collab/shadowpaste` — MIT, self-hosted, no account.
> The Known limitations section of the README is the honest version of this video.
