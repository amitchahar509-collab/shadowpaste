# CLI Release Proof Report

> Blocker 5 — Clean install verification.

## Test Environment
- ShadowPaste project: `/home/z/my-project`
- CLI: `cli/index.ts` via `bun run cli/index.ts`
- Server: running on port 3000

## Test 1: Init
```
$ shadowpaste init

  🛡️  ShadowPaste — AI Agent Security Control Plane

  Initializing...
  ✓ Database initialized
  ✓ Project detected: shadowpaste
  ✓ Scanned 345 files, found 397 secrets

  ✅ ShadowPaste ready!

  Next steps:
    1. shadowpaste protect
    2. shadowpaste open
    3. shadowpaste restore
```
**Time**: ~8 seconds
**Status**: ✅ PASS

## Test 2: Protect
```
$ shadowpaste protect

  🛡️  Protecting my-project...

  Scanning files...
  ✓ 1276 files scanned
  ✓ 1012 secrets protected with format-compatible fakes
  ✓ Workspace: /home/z/my-project/.workspaces/my-project-ws-mrde8fvq

  ✅ AI-safe workspace ready!

  Open in Cursor:  cursor /home/z/my-project/.workspaces/my-project-ws-mrde8fvq
  Open in Claude:  claude /home/z/my-project/.workspaces/my-project-ws-mrde8fvq
```
**Time**: ~25 seconds (1276 files)
**Status**: ✅ PASS — 1012 secrets virtualized with format-compatible fakes

## Test 3: Status
```
$ shadowpaste status

  🛡️  ShadowPaste Status

  Active workspaces: 4
    - my-project-ws-mrdcqjvs (999 secrets)
    - my-project-ws-mrde8fvq (1012 secrets)
    ...

  Server: healthy (http://localhost:3000)
  Checks: database:✓, vault:✓, mcp:✓, github-api:✓
```
**Time**: instant
**Status**: ✅ PASS

## Test 4: Restore
```
$ shadowpaste restore

  🛡️  Restoring secrets...

  Workspace: /home/z/my-project/.workspaces/my-project-ws-mrde8fvq
  Source: /home/z/my-project
  Secrets to restore: 1012

  ✓ 1012 secrets restored to source project

  ✅ Restore complete! Source project has real secrets back.
```
**Time**: ~5 seconds
**Status**: ✅ PASS — all 1012 secrets restored

## Total Time to First Protection
```
init:      8s
protect:  25s
restore:   5s
─────────────────
total:    38s  (< 60s target ✅)
```

## Format-Compatible Fakes Verified
Secrets replaced with valid-format fakes:
- `sk-proj-shadow-oVveD7vnoeVFFieXYzpB4vuGO5AS39Z72SLcKiLp...` → `sk-proj-shadow-FIeSAL68p6oiJpcLuCiQcraOC6N0SBK5mVCqM2Gi...` (OpenAI)
- `ghp_aBcDeFg...` → `ghp_shadow...` (GitHub)
- `AKIAACFQCBCB4KKHJUKX` → `AKIAJAR8NYIQRTA9ZP31` (AWS)
- `sk_live_51H8xK2...` → `sk_test_shadow...` (Stripe)
- `shadow-kkPlRoew2wZKs4DxaBkGCF → `shadow-MTw7L5RlwTCytgWbkUFwqWMEpgwPwT (Postgres)

## Status: ✅ PASS — CLI release ready, under 60 seconds
