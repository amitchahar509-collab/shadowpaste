# 06 — The MCP gateway: risk → policy → audit

**Length** 3m · **Audience** AI engineers wiring agents to real systems
**Playlists** MCP, Advanced
**Goal** The viewer can predict what the gateway will do to any given tool call,
and knows where to look when it does something they did not expect.

Facts used: FACTS.md → MCP gateway (all rows), live blocked-attack results.

---

## Narration

> An MCP server hands an agent tools. Most of them hand over the tool and stop
> there. ShadowPaste puts six steps between the agent and the real system, and
> every one of them is visible in the response.
>
> Start with the simplest call — read a file.
>
> `decision: allow_once`. `riskScore: 5`. `executed: true`. The gateway scored the
> call, the policy engine allowed it once, the adapter ran, and the result came
> back sanitized.
>
> Risk is a number from zero to a hundred, and the thresholds are fixed: eighty
> and above is critical, fifty is high, twenty-five is medium. `fs.read` is a five.
>
> Now the same tool, pointed somewhere it should not go.
>
> `blocked`. `riskScore: 90`. `FS_PATH_ESCAPE`. Nothing executed. And notice the
> risk score changed — the input itself was classified before the policy engine
> ever ran, so a traversal attempt is recorded as a critical security event, not
> as a routine read that happened to fail.
>
> That ordering matters more than it looks. If classification only happened
> inside the adapter, then an attack aimed at a tool the policy stops earlier
> would be contained — but recorded as ordinary traffic, and it would page
> nobody.
>
> Here is a database read asking for a credential column.
>
> `SQL_FORBIDDEN_COLUMN`, risk 90, blocked. And a cross-tenant join —
> `FROM "Agent", "User" u` — `SQL_FORBIDDEN_TABLE`, risk 85, blocked. That second
> one is the shape that gets missed: the query never names a forbidden table in
> the position a naive parser looks at.
>
> Then there are the calls that are never allowed at all.
>
> Six tools are hard-denied by global policy. Repository deletion. Schema drop.
> Database export. Direct charges. Customer deletion. Filesystem execution. No
> trust score raises them, no approval unlocks them. Changing that means editing
> the source.
>
> Everything you just saw is in the audit trail — allowed, blocked, and denied
> alike — and the trail is hash-chained, so it can be verified after the fact.
>
> One thing this is not: the approval queue is a policy decision, not container
> isolation. A high-risk call you approve runs with the credentials you gave it,
> on the real system. `shell.exec` refuses rather than pretend otherwise.

**Word count** ~390 → ~2m 30s at 155 wpm, leaving 30s of held output.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:03 | Intro | |
| 0:03–0:15 | Diagram | The six-stage pipeline, built one stage at a time in sync with narration: Identity → Risk → Policy → Credential → Execute → Sanitize+Audit |
| 0:15–0:40 | Terminal | `fs.read package.json`. Full JSON response visible. Highlight `decision`, `riskScore`, `executed` in sequence. |
| 0:40–0:55 | Card | Threshold table: ≥80 critical, ≥50 high, ≥25 medium. `fs.read = 5` marked on it. |
| 0:55–1:20 | Terminal | `fs.read ../../../../etc/passwd` → hold on `blocked` / `90` / `FS_PATH_ESCAPE` |
| 1:20–1:40 | Diagram, redrawn | Pipeline again, with pre-flight inspection now shown BEFORE the policy gate. Old path greyed out. |
| 1:40–2:05 | Terminal | Two db.read calls back to back: credential column, then the comma-join. Both blocked. |
| 2:05–2:25 | Terminal + card | `github.repo.delete` → `deny`. Card lists all six hard-denied tools. |
| 2:25–2:40 | Terminal | `shadowpaste.audit` — the previous calls appear in order, blocked ones included |
| 2:40–2:55 | Card, amber border | "The sandbox is a policy decision, not container isolation." |
| 2:55–3:00 | Outro | |

**Camera** Static for all terminal work. The diagram sections may pan.

**Transitions** Cut on every terminal change. Cross-dissolve only between the two
diagram states, to show it is the same pipeline being re-ordered.

---

## Reproduce this take

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fs.read","arguments":{"path":"package.json"}}}'
```

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"fs.read","arguments":{"path":"../../../../etc/passwd"}}}'
```

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"db.read","arguments":{"query":"SELECT email, \"passwordHash\" FROM \"User\" LIMIT 5"}}}'
```

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"db.read","arguments":{"query":"SELECT u.email FROM \"Agent\", \"User\" u LIMIT 3"}}}'
```

Expected, in order: `allow_once`/5/executed true · `blocked`/90/`FS_PATH_ESCAPE` ·
`blocked`/90/`SQL_FORBIDDEN_COLUMN` · `blocked`/85/`SQL_FORBIDDEN_TABLE`.

---

## CTA

> The gateway returns its reasoning on every call — so point an agent at it and
> read what comes back before you trust it.
> Docs: `docs/ARCHITECTURE.md`. MIT.
