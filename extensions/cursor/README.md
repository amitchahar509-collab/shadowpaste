# ShadowPaste for Cursor

Cursor ships the VS Code extension API, so this is a **thin wrapper** over
the sibling VS Code extension. It re-exports the same `activate` /
`deactivate` (which register `scanWorkspace`, `protectSecrets`,
`connectMcp`) and adds a fourth command:

- **ShadowPaste: Open Cursor MCP Config** (`shadowpaste.cursorMcp`) —
  calls `GET /api/mcp-config`, extracts the `cursor` key, formats it as a
  ready-to-paste `~/.cursor/mcp.json` document, and opens it in an
  untitled editor (or copies it to the clipboard).

## Why a separate extension?

Cursor's MCP settings file lives at `~/.cursor/mcp.json` (or workspace
`.cursor/mcp.json`) and uses a slightly different shape than Claude
Desktop's config. The backend's `/api/mcp-config` returns both shapes
under `configs.claude-desktop` and `configs.cursor`. This command shows
**only** the Cursor-shaped config so you don't have to hand-edit.

## Files

| File | Role |
|------|------|
| `package.json` | Same shape as the VS Code extension, plus `shadowpaste.cursorMcp` in `contributes.commands` and `activationEvents`. `displayName: "ShadowPaste for Cursor"`. |
| `src/extension.ts` | Re-exports `activate` / `deactivate` from `../../vscode/src/extension`, wraps `activate` to also register `shadowpaste.cursorMcp`, and implements the Cursor-specific MCP-config viewer. |
| `tsconfig.json` | `rootDir: ..` so the relative import to the sibling VS Code extension compiles. |

## Cursor-specific setup

1. Start the ShadowPaste backend (`bun run dev` from the project root).
2. Install + compile the extension (see below).
3. In Cursor: **Settings → Extensions → ShadowPaste for Cursor**, set
   `shadowpaste.serverUrl` to your backend URL (default
   `http://localhost:3000`) and optionally `shadowpaste.apiKey`.
4. Run **ShadowPaste: Open Cursor MCP Config** from the command palette.
5. Save the resulting JSON to `~/.cursor/mcp.json` (or workspace
   `.cursor/mcp.json`), replacing `<your-agent-api-key>` with a real
   ShadowPaste agent key.
6. Reload Cursor. The ShadowPaste MCP server now appears under
   **Settings → Cursor Settings → MCP** with all 25 tools discoverable.

## Build (scaffold only — do NOT npm install in this repo)

```bash
cd extensions/cursor
npm install            # @types/vscode, @types/node, typescript
npm run compile        # tsc -p . → out/extension.js
```

Then package with `vsce package` and install the `.vsix` into Cursor via
**Extensions → ⋯ → Install from VSIX**.
