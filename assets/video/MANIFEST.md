# Rendered video assets

Empty until videos are produced. Each entry below is written by whoever renders
it, so the repo records what a given MP4 actually shows and against which commit.

## Required per asset

| Field | Why |
|---|---|
| `file` | Filename in this directory |
| `script` | Which `docs/videos/scripts/*.md` it was cut from |
| `commit` | The commit the demo was recorded against |
| `claims` | The numbers that appear on screen |
| `verified` | Command(s) re-run to confirm those numbers at record time |

A rendered video with no manifest entry cannot be reviewed for accuracy later,
which is the whole reason a video makes a claim dangerous: the code moves and the
frame does not.

## Assets

_No MP4s yet._ One SVG asset is published — see `assets/readme/`.

### assets/readme/attack-blocked.svg
- script: `docs/videos/scripts/07-attack-blocked.md`
- generator: `scripts/record-terminal-demo.mjs --demo attack-blocked`
- claims: SSRF blocked 95 · traversal blocked 90 · credential column blocked 90 ·
  repo.delete deny 95 · all four `executed: false`
- verified: the generator captured these from a live gateway at build time and
  refuses to write the file if any call reports `executed: true`

<!-- Template:
### 07-attack-blocked.mp4
- script: docs/videos/scripts/07-attack-blocked.md
- commit: 474bfc7
- claims: SSRF blocked 95 · traversal blocked 90 · SQL_FORBIDDEN_COLUMN 90 · repo.delete deny 95
- verified: the four curl calls in the script, run against a live server at record time
-->

## Before rendering anything

```bash
node scripts/video-sync.mjs
```

If it reports a numeric claim change, fix `docs/videos/FACTS.md` and the affected
scripts first. Rendering a video that states a stale number is worse than having
no video.
