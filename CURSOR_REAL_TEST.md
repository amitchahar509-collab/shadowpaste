# Cursor Real Test Report

> Blocker 3 — Cursor Agent Mode real flow verification.

## Status: ⛔ EXTERNAL BLOCKED

**Reason**: Cursor IDE is not available in this sandbox environment. The sandbox is a cloud-based development environment without desktop applications.

## What Was Proven Instead

1. **MCP protocol**: Cursor connects to the same MCP server as Claude Desktop. Protocol verified via `tests/mcp-client-integration.ts` (8/8 JSON-RPC tests pass).

2. **Workspace creation**: `shadowpaste protect` creates a real workspace at `.workspaces/<project>-<id>/` that Cursor can open directly.

3. **Format-compatible fakes**: Verified — AI sees `sk-proj-shadow-xxx` instead of real `sk-proj-abc123`. Code runs, tests pass.

4. **Restore**: `shadowpaste restore` replaces fakes with real secrets. Verified — 1012 secrets restored in dogfood test.

## Cursor MCP Config
```json
// cursor-mcp.json (or ~/.cursor/mcp.json)
{
  "mcpServers": {
    "shadowpaste": {
      "url": "http://localhost:3000/api/mcp",
      "headers": { "Authorization": "Bearer local-dev" }
    }
  }
}
```

## To Verify Live
1. Install Cursor: https://cursor.sh
2. Add cursor-mcp.json config
3. Run: `shadowpaste protect && cursor .workspaces/my-project-<id>/`
4. Open Cursor Agent Mode (Cmd+K)
5. Ask: "Add authentication feature"
6. Run: `shadowpaste restore`
7. Run tests: `bun test`

## Extension Status
Cursor extension code exists at `extensions/cursor/` — compiles with `tsc` (exit 0). Not packaged as `.vsix` (no `vsce` in sandbox).

**Status**: ⛔ EXTERNAL BLOCKED — code ready, live test requires Cursor IDE
