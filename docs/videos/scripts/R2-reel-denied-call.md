# R2 — Reel: the call that is never allowed

**Length** 30s vertical (9:16) · **Playlist** Social
**Goal** Make "hard deny" concrete in one clip.

Facts used: FACTS.md → MCP gateway (6 hard-denied tools).

## Narration

> An agent asks to delete a repository.
> Denied. Risk ninety-five. Nothing executed.
> Raise its trust score to a hundred. Ask again.
> Still denied.
> Six tools are denied by global policy. No trust score raises them, no approval unlocks them.
> Changing that means editing the source.

~55 words → ~22s.

## Screen recording

| Time | Screen | Action |
|---|---|---|
| 0:00–0:03 | Cold open | `github.repo.delete` typed, cursor waiting |
| 0:03–0:10 | Terminal | Enter → `deny`, risk 95, `executed: false` |
| 0:10–0:18 | Terminal | Agent trust score updated to 100 on screen, same call re-run → **still `deny`** |
| 0:18–0:26 | Card | The six hard-denied tool names, red left border |
| 0:26–0:30 | End card | Repo URL |

**Crop** 9:16. Burned captions.

**Camera** Locked. **Transitions** Cut.

## Reproduce

Use a repository name that does not exist. If the control ever regressed, the
take must not be able to destroy anything real.

## CTA

Text card only.
