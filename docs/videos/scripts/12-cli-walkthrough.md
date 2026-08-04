# 12 — CLI walkthrough

**Length** 3m · **Audience** developers · **Playlists** Beginner, Onboarding
**Goal** Viewer can run the full protect → edit → restore loop from the terminal
without touching the dashboard or creating an account.

Facts used: FACTS.md → Product surface (CLI commands), Detection, Crypto.

---

## Narration

> Six commands. Everything the dashboard does to a project, the CLI does too, and
> none of it needs a server or an account.
>
> `init` sets ShadowPaste up in the current project and scans it.
>
> `protect` is the one you will actually use. It scans, vaults what it finds, and
> writes an AI-safe workspace copy. Point it anywhere with `-p`.
>
> Read the output rather than trusting it. It tells you what was found, which
> provider each secret belongs to, and where the workspace went. That path is
> namespaced by organization — that namespacing is what keeps one tenant's files
> out of another's.
>
> Open that folder in Cursor or Claude Code. Let the AI work. Every credential it
> can see is dead.
>
> `status` shows what is currently protected.
>
> When the AI is done, `restore` puts the real secrets back and brings the edits
> with them. Files with no secret mapping are copied byte-for-byte rather than
> rewritten, so images, binaries and files with a byte-order mark come back
> unchanged. A workspace that quietly re-encodes your files is not a safe copy.
>
> `open` launches the workspace in your editor. `daemon start` runs a background
> file watcher.
>
> One thing to set up before you protect anything you care about. The vault key
> lives on your machine, and if you lose it the vaulted secrets are unrecoverable.
> That is not a bug — it is what makes the vault worth having. Back up
> `SHADOWPASTE_MASTER_KEY` and `SHADOWPASTE_VAULT_SALT` now, not later.

**Word count** ~285 → ~1m 50s plus live command time.

---

## Screen recording script

| Time | Screen | Action |
|---|---|---|
| 0:00–0:03 | Intro | |
| 0:03–0:12 | Card | The six commands as a monospace list |
| 0:12–0:28 | Terminal | `bun run cli/index.ts --help` |
| 0:28–1:05 | Terminal | `protect -p ./demo-project`, unedited. Hold on the secrets list and the workspace path. |
| 1:05–1:25 | Editor | Open the workspace; show one fake key in place, and the file still parsing |
| 1:25–1:42 | Terminal | `status` |
| 1:42–2:15 | Editor + terminal | Make a visible edit in the workspace (as an AI would), run `restore`, then show BOTH: the real secret back, and the edit preserved |
| 2:15–2:38 | Terminal | `cmp` a binary before and after — byte-identical, on camera |
| 2:38–2:52 | Card, amber | "Lose SHADOWPASTE_MASTER_KEY and vaulted secrets are unrecoverable. Back it up first." |
| 2:52–3:00 | Outro | |

**Camera** Static. **Transitions** Cut.

---

## Reproduce this take

```bash
bun run cli/index.ts --help
bun run cli/index.ts protect -p ./demo-project
bun run cli/index.ts status
bun run cli/index.ts restore
```

```bash
cmp ./demo-project/logo.png ./.workspaces/<org>/<ws>/logo.png && echo "byte-identical"
```

---

## CTA

> No server, no account. Run it on a scratch copy of a project you know well —
> if it finds something you did not know was in there, that is the point.
> `docs/QUICKSTART.md`
