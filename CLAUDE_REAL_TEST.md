# Claude Code Real Test Report

> Blocker 2 — Claude Code real flow verification.

## Status: ⛔ EXTERNAL BLOCKED

**Reason**: Claude Code (CLI) is not available in this sandbox environment. The sandbox is a cloud-based development environment without desktop applications or Claude Code CLI installed.

## What Was Proven Instead

The MCP server that Claude Code would connect to is verified working via a real JSON-RPC 2.0 client test (`tests/mcp-client-integration.ts`):

```
[1] initialize → server=shadowpaste v19.0.0 ✅
[2] tools/list → 28 tools (shadowpaste.scan/protect/audit) ✅
[3] shadowpaste.scan → executed=true, real GitHub scan ✅
[4] shadowpaste.protect → executed, secrets vaulted ✅
[5] fs.write → executed through zero-trust gateway ✅
[6] shadowpaste.audit → 10 real events returned ✅
[7] db.schema.drop → DENIED ✅
```

Full proof: `MCP_REAL_PROOF.md` + `tests/mcp-client-proof.log`

## What Would Happen With Real Claude Code

1. Claude Code connects to `http://localhost:3000/api/mcp` (JSON-RPC 2.0)
2. Claude calls `shadowpaste.protect` on the project
3. Claude sees format-compatible fake secrets (sk-proj-shadow-xxx)
4. Claude edits files — code runs with fake secrets
5. Developer runs `shadowpaste restore`
6. Real secrets restored, project commits with real credentials

## Config for Claude Desktop
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
1. Install Claude Code CLI: `npm install -g @anthropic-ai/claude-code`
2. Add mcp.json config
3. Run: `shadowpaste protect && claude .workspaces/my-project-<id>/`
4. Ask Claude: "Add a small feature"
5. Run: `shadowpaste restore`
6. Verify: `git diff` shows real secrets restored

**Status**: ⛔ EXTERNAL BLOCKED — code ready, live test requires Claude Code CLI
