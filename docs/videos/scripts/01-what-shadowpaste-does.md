# 01 — What ShadowPaste actually does

**Length** 60s · **Audience** everyone · **Playlists** Beginner, Launch
**Goal** A developer understands the two problems it solves and can decide in one
minute whether it is for them.

Facts used: FACTS.md → Detection (501/322), MCP gateway (28 tools, 6 hard-denied),
live blocked-attack results.

---

## Narration

> You want Claude Code working on your actual repository. Your actual repository
> has a dot-env file full of live credentials.
>
> Paste that in, and those credentials end up in a model provider's logs, in tool
> call arguments, and in your own audit trail.
>
> ShadowPaste solves that from two directions.
>
> First, it finds the real secrets — 501 patterns across 322 providers, plus
> entropy detection — encrypts them into a local vault, and writes a
> format-compatible fake in their place. The code still parses. Tests still run.
> The AI still sees the right shape. The credential is dead.
>
> Second, when an agent calls a tool, the call goes through a gateway: risk score,
> policy decision, single-use credential, execute, audit — with secrets stripped
> from the result before the agent ever sees it.
>
> Six tools are permanently denied. Not configurable. Repository deletion, schema
> drops, database export, direct charges.
>
> It runs on your own infrastructure. There is no ShadowPaste cloud.

**Word count** ~150 → ~58 s at 155 wpm.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:02 | Intro card | Shield draws, wordmark, tagline |
| 0:02–0:10 | Editor, split | Left: real `.env` with `sk_live_…`, `ghp_…`. Cursor blinks. |
| 0:10–0:16 | Same, annotated | Red arrows from the `.env` to three labels: "model provider logs", "tool arguments", "your audit trail" |
| 0:16–0:30 | Terminal | Run `bun run cli/index.ts protect -p ./demo-project`. Let the real output land. Highlight the `Protected secrets:` block. |
| 0:30–0:36 | Editor, split | Right pane: the same file in the workspace, `sk_test_shadow…` in place of the live key. Cut to a passing `npm test`. |
| 0:36–0:48 | Terminal | MCP `tools/call` for `fs.read package.json` → `allow_once`, risk 5. Then `github.repo.delete` → **`deny`**, risk 95. Hold on the deny. |
| 0:48–0:55 | Card | The six hard-denied tool names, monospace, red left border |
| 0:55–1:00 | Outro | Repo URL, MIT, CTA |

**Camera** No zooms during terminal output — the output is the evidence, let it
be legible. One slow push-in (5%) on the `deny` line only.

**Transitions** Hard cuts. No wipes, no motion blur. A security demo that looks
over-produced reads as a cover-up.

---

## Reproduce this take

```bash
bun run cli/index.ts protect -p ./demo-project
```

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"github.repo.delete","arguments":{"repo":"example/does-not-exist"}}}'
```

Expected: `"decision":"deny"`, `"riskScore":95`, `"executed":false`.

Use a repository name that does not exist. If the control ever failed, the take
must not be able to destroy anything.

---

## CTA

> Clone it, run it against a project you actually care about, and check the
> workspace yourself.
> `github.com/amitchahar509-collab/shadowpaste` — MIT.
