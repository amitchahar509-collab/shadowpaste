# 07 — Watching an attack get blocked

**Length** 30s · **Audience** everyone · **Playlists** Security, Social
**Goal** One memorable, verifiable moment. This is the clip that gets embedded and
reposted, so it must be the least exaggerated thing in the library.

Facts used: FACTS.md → live blocked-attack results.

---

## Narration

> This is an AI agent asking a gateway to fetch cloud metadata — the endpoint that
> hands out IAM credentials on AWS.
>
> Blocked. Risk ninety-five. Nothing executed.
>
> Path traversal. Blocked, ninety.
>
> A query for password hashes. Blocked, ninety.
>
> Delete a repository — permanently denied by policy. No trust score raises that
> one.
>
> Every attempt is in the audit trail, hash-chained, whether it ran or not.

**Word count** ~70 → ~27 s.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:02 | Cold open, no intro card | Terminal already on screen, command typed, cursor waiting |
| 0:02–0:09 | Terminal | Enter. `network.fetch 169.254.169.254`. Response lands. Freeze 1.5s on `"decision":"blocked"` and `"riskScore":95`. |
| 0:09–0:14 | Terminal | Traversal call. Freeze on `FS_PATH_ESCAPE`. |
| 0:14–0:19 | Terminal | `passwordHash` query. Freeze on `SQL_FORBIDDEN_COLUMN`. |
| 0:19–0:25 | Terminal | `github.repo.delete` → **`deny`**. Hold longest here. |
| 0:25–0:29 | Audit view | Four rows appear, timestamps ascending |
| 0:29–0:30 | Outro card, minimal | Repo URL only |

**Camera** Locked off. No movement at all. The value of this clip is that it looks
like something you could run yourself, because it is.

**Transitions** Straight cuts on each response.

**Social crop** 9:16 — terminal centred, response JSON scaled so `decision` and
`riskScore` are legible on a phone. Burned captions mandatory; this autoplays muted.

---

## Reproduce this take

All four calls are in `docs/videos/scripts/06-mcp-gateway.md` plus:

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"network.fetch","arguments":{"url":"http://169.254.169.254/latest/meta-data/"}}}'
```

Use a non-existent repository for the delete call.

---

## CTA

Text card only, no voice: `github.com/amitchahar509-collab/shadowpaste`
