# ShadowPaste video library

Developer-first technical video. Every script is grounded in
**[FACTS.md](FACTS.md)** — the verified-claims sheet — and nothing may be said on
camera that is not on that sheet or added to it with evidence.

## Why this is structured this way

A security tool's demo has one failure mode that matters: showing something that
does not actually happen. So every script here is built around a **terminal or
UI moment that can be reproduced by the viewer**, with the exact command and the
exact expected output. If a take does not reproduce, the script is wrong, not
the recording.

## Catalogue

Status legend: `planned` = catalogued, not yet written · `written` = script complete · `recorded` = screen capture done · `composed` = video built · `published` = linked from README.

| # | Title | Len | Audience | Playlist | Status |
|---|---|---|---|---|---|
| 01 | What ShadowPaste actually does | 60s | Everyone | Beginner, Launch | **written** |
| 02 | Install and first run | 3m | New contributor | Beginner, Onboarding | **written** |
| 03 | Your first secret scan | 60s | Developer | Beginner | planned |
| 04 | Secret virtualization: how fakes keep code running | 3m | Developer | Beginner, Advanced | **written** |
| 05 | Restore: getting your real secrets back | 60s | Developer | Beginner | planned |
| 06 | The MCP gateway: risk → policy → audit | 3m | AI engineer | MCP, Advanced | **written** |
| 07 | Watching an attack get blocked | 30s | Everyone | Security, Social | **written** |
| 08 | Connecting Claude Code, Cursor and VS Code | 3m | AI engineer | MCP, Onboarding | planned |
| 09 | The vault and single-use capability tokens | 60s | Security engineer | Security, Advanced | planned |
| 10 | Tamper-evident audit chain | 60s | Security engineer | Security, Enterprise | **written** |
| 11 | OAuth 2.1 for MCP, end to end | 3m | Platform engineer | MCP, Enterprise | planned |
| 12 | CLI walkthrough | 3m | Developer | Beginner, Onboarding | **written** |
| 13 | API walkthrough | 3m | Developer | Advanced | planned |
| 14 | Importing a project four ways | 60s | Developer | Beginner | planned |
| 15 | Alerting: from blocked call to page | 60s | SRE | Security, Enterprise | planned |
| 16 | Security architecture in five minutes | 5m | Security reviewer | Security, Enterprise | planned |
| 17 | The full developer workflow | 5m | Developer | Advanced, Onboarding | planned |
| L1 | Show HN demo | 90s | HN | Launch | **written** |
| L2 | Product Hunt | 60s | PH | Launch | planned |
| L3 | GitHub repo banner | 30s | Repo visitors | Launch | planned |
| R1 | Reel: the secret your agent never sees | 30s | Social | Social | **written** |
| R2 | Reel: the call that is never allowed | 30s | Social | Social | **written** |
| R3 | Reel: 501 patterns, zero misses | 30s | Social | Social | **written** |

## Playlists

**Onboarding** (new contributor, ~10 min) → 02 · 12 · 08 · 17
**Beginner** (~7 min) → 01 · 03 · 04 · 05 · 14
**Advanced** (~14 min) → 04 · 06 · 13 · 17
**Security** (~8 min) → 07 · 09 · 10 · 15 · 16
**MCP** (~7 min) → 06 · 08 · 11
**Enterprise** (~8 min) → 10 · 11 · 15 · 16
**Launch** → L1 · L2 · L3 · 01

## Production standard

**Tone.** Explain, do not sell. No superlatives. State the limitation next to the
capability — the audience for a security tool is more convinced by a disclosed
weakness than by a claim.

**Every demo shows real output.** Terminal takes are unedited; if a command takes
four seconds, the take takes four seconds or is visibly time-compressed with a
marker.

**Branding.** Dark background `#0A0A0B`, accent blue `#3B82F6`, critical red
`#EF4444`, allow green `#10B981`. Monospace for all terminal and code.
Shield mark + wordmark bottom-right, 60% opacity, never over content.

**Intro** — 1.5 s: shield mark draws, wordmark fades in, tagline
"Let AI code your real repo without exposing secrets."
**Outro** — 2.5 s: `github.com/amitchahar509-collab/shadowpaste`, MIT, one CTA.

**Captions.** Burned in, sentence case, max 2 lines. Assume muted autoplay.

## Directory layout

```
docs/videos/
  README.md          this catalogue
  FACTS.md           verified claims — the source of truth for every script
  scripts/           one file per video: narration, screen actions, timing, CTA
assets/video/        rendered MP4s (feature demos, tutorials)
assets/social/       reels and shorts, vertical crops
assets/readme/       README hero, banner, feature GIF replacements
```

## Regenerating after a repo change

`scripts/video-sync.mjs` maps source paths to the videos that depend on them,
compares against the last recorded sync commit, and reports which scripts and
renders are stale. It does **not** re-render automatically — rendering is a paid
action, and a re-render should be a decision, not a side effect of a commit.

```bash
node scripts/video-sync.mjs          # report what changed and what is stale
node scripts/video-sync.mjs --mark   # record the current commit as synced
```
