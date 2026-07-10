# Claude Code Production Proof

> Task 2 — Real Claude Code test.

## Status: ⛔ EXTERNAL BLOCKED

**Reason**: Claude Code CLI is not available in this sandbox environment. The sandbox is a cloud-based development environment without desktop applications or Claude Code CLI installed.

## What Was Verified Instead

### 1. MCP Protocol (the protocol Claude Code uses)
Real JSON-RPC 2.0 client test (`tests/mcp-client-integration.ts`) — 8/8 tests pass:
```
[1] initialize → server=shadowpaste ✅
[2] tools/list → 28 tools (shadowpaste.scan/protect/audit) ✅
[3] shadowpaste.scan → executed=true ✅
[4] shadowpaste.protect → executed, secrets vaulted ✅
[5] fs.write → executed through gateway ✅
[6] shadowpaste.audit → 10 real events ✅
[7] flight recorder → 8 real calls captured ✅
[8] db.schema.drop → DENIED ✅
```

### 2. CLI Workspace Creation (what Claude Code would open)
```
$ shadowpaste protect
✓ 1297 files scanned
✓ 976 secrets protected with format-compatible fakes
✓ Workspace: /home/z/my-project/.workspaces/my-project-ws-mreggn70
✅ AI-safe workspace ready!
```

### 3. Format-Compatible Fake Secrets (what Claude would see)
- `sk-proj-abc123` → `sk-proj-shadow-xxx` (same format, invalid)
- `ghp_aBcDeFg` → `ghp_shadow-xxx` (same prefix, invalid)
- `AKIAIOSFODNN7EXAMPLE` → `AKIASHADOWFAKEKEY00` (same shape, fails checksum)
- Code runs, tests pass, AI understands format

### 4. Restore (after Claude edits)
```
$ shadowpaste restore
✓ 976 secrets restored to source project
✅ Restore complete!
```

## Config for Claude Code
```json
// mcp.json
{
  "mcpServers": {
    "shadowpaste": {
      "type": "http",
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer local-dev" }
    }
  }
}
```

## To Verify Live
1. Install Claude Code: `npm install -g @anthropic-ai/claude-code`
2. Add mcp.json config
3. Run: `shadowpaste protect && claude .workspaces/my-project-<id>/`
4. Ask Claude: "Add a small feature"
5. Run: `shadowpaste restore`
6. Verify: `git diff` shows real secrets restored, code changes preserved

## Commands
```bash
# Protect
shadowpaste protect

# Open in Claude Code
shadowpaste open -e claude
# or: claude .workspaces/my-project-<id>/

# After Claude edits
shadowpaste restore

# Verify
shadowpaste status
```

**Status**: ⛔ EXTERNAL BLOCKED — code ready, live test requires Claude Code CLI
