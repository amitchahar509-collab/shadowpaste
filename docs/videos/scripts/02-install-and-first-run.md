# 02 — Install and first run

**Length** 3m · **Audience** new contributor · **Playlists** Beginner, Onboarding
**Goal** Empty directory to a working server and a passing MCP call, with no step
that only works on the presenter's machine.

Facts used: FACTS.md → Product surface. README install sequence.

---

## Narration

> Two prerequisites. Bun 1.3 or Node 20, and a PostgreSQL database. The Prisma
> provider is postgresql — there is no SQLite path, so a `file:` URL will not work.
>
> Clone, install.
>
> Copy the example environment file. The defaults in it match the bundled Postgres
> exactly, so if you use Docker Compose you change nothing.
>
> Now the step people skip, and the reason this video exists.
>
> Generate the Prisma client. Skip it and the app still starts — but every
> database-backed route returns a five hundred whose only clue is "at-prisma-slash-
> client did not initialize yet", rendered as an HTML error page rather than JSON.
> You will spend twenty minutes looking at your database config for a problem that
> is not there.
>
> `db:push` also generates the client, so if that succeeded you are covered. Run it
> explicitly if your database is not up yet.
>
> Push the schema. Start the server.
>
> Verify with a real call rather than by looking at the port.
>
> Twenty-eight tools. That is the whole handshake — no token needed locally,
> because unauthenticated calls are attributed to a built-in local-dev agent.
>
> One sharp edge worth knowing now: an *invalid* token is also accepted locally and
> falls back to that same agent. So if you paste a made-up key and calls succeed,
> that proves nothing about your credentials. Set `REQUIRE_OAUTH=true` when you
> want the token actually enforced.

**Word count** ~270 → ~1m 45s, the rest is watching commands run.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:03 | Intro | |
| 0:03–0:12 | Terminal | Empty dir. `git clone`, `cd`. |
| 0:12–0:40 | Terminal | `bun install` — time-compressed with a visible "2×" marker, never silently |
| 0:40–0:55 | Terminal + editor | `cp .env.example .env`; show the `DATABASE_URL` default beside the compose `db` service so the match is visible, not asserted |
| 0:55–1:20 | Terminal | `docker compose up -d db`, then `bun run db:generate`. Hold on "Generated Prisma Client". |
| 1:20–1:50 | Terminal, red border | **Deliberate failure take.** Skip generate, start server, `curl /api/health` → HTML. Scroll to the `did not initialize yet` string buried in the markup. |
| 1:50–2:10 | Terminal | Fix: `bun run db:generate`, `bun run db:push`, restart |
| 2:10–2:35 | Terminal | `bun run dev`, then the `tools/list` curl → 28 tools |
| 2:35–2:52 | Card, amber | "Locally, an invalid token is accepted too. Set REQUIRE_OAUTH=true to enforce." |
| 2:52–3:00 | Outro | |

**Camera** Static. **Transitions** Cut.

The failure take is the point of the video — showing the broken state and its
actual symptom is worth more than a clean run the viewer cannot debug.

---

## Reproduce this take

```bash
git clone https://github.com/amitchahar509-collab/shadowpaste.git && cd shadowpaste
bun install
cp .env.example .env
docker compose up -d db
bun run db:generate
bun run db:push
bun run dev
```

```bash
curl -s -X POST http://localhost:3000/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: a JSON-RPC result listing 28 tools. HTML instead means the Prisma client
was never generated.

---

## CTA

> If the tools list comes back, you have a working gateway. Next: the CLI
> walkthrough. Full notes in `docs/INSTALLATION.md`.
