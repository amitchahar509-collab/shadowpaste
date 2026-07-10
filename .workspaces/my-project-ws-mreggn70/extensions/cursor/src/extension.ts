// ShadowPaste for Cursor — thin wrapper over the VS Code extension.
//
// Cursor ships the VS Code extension API, so we literally re-export the
// VS Code extension's `activate` / `deactivate` (which register the three
// commands: scanWorkspace, protectSecrets, connectMcp) and add a fourth
// command — `shadowpaste.cursorMcp` — that opens the MCP config in the
// Cursor-specific format.
//
// The Cursor-specific config lives under the `cursor` key of the response
// from GET /api/mcp-config (see /home/z/my-project/src/app/api/mcp-config/route.ts).
// We extract just that key, format it as a `~/.cursor/mcp.json`-shaped
// document, and open it in an untitled editor so the user can copy/paste
// it into Cursor's MCP settings.

import * as vscode from "vscode";
// Re-export everything (deactivate, readConfig, getJson, types …) from the
// sibling VS Code extension. We override `activate` below to add the
// Cursor-specific `shadowpaste.cursorMcp` command on top of the three
// base commands the VS Code extension registers.
import * as vscodeExt from "../../vscode/src/extension";

export const deactivate = vscodeExt.deactivate;

/**
 * Cursor entry point. Delegates to the VS Code extension's activate (which
 * registers scanWorkspace / protectSecrets / connectMcp) and then registers
 * the Cursor-specific `shadowpaste.cursorMcp` command.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Run the VS Code extension's activate — registers the 3 base commands.
  if (typeof vscodeExt.activate === "function") {
    vscodeExt.activate(context);
  }
  // Register the Cursor-specific command.
  context.subscriptions.push(
    vscode.commands.registerCommand("shadowpaste.cursorMcp", () =>
      cursorMcpCommand()
    )
  );
  console.info("[ShadowPaste-Cursor] extension activated.");
}

// ---------------------------------------------------------------------------
// shadowpaste.cursorMcp — open the Cursor-formatted MCP config
// ---------------------------------------------------------------------------

interface CursorMcpConfig {
  mcpServers?: Record<string, Record<string, unknown>>;
}

async function cursorMcpCommand(): Promise<void> {
  const cfg = vscodeExt.readConfig();
  const res = await vscodeExt.getJson<vscodeExt.McpConfigResponse>(
    cfg,
    "/api/mcp-config"
  );
  if (!res.ok) {
    vscode.window.showErrorMessage(
      `ShadowPaste: cannot fetch MCP config — ${res.error}`
    );
    return;
  }
  const data = res.data;
  // Pull the `cursor` key — the backend ships a Cursor-shaped mcpServers block.
  const cursorConfig = (data.configs?.cursor as CursorMcpConfig | undefined) || {
    mcpServers: {},
  };

  // Cursor reads mcp.json from ~/.cursor/mcp.json (or workspace .cursor/mcp.json).
  // We render a ready-to-paste JSON document plus a short header explaining
  // where to put it.
  const header = [
    "// ShadowPaste — Cursor MCP config",
    `// Server: ${cfg.serverUrl}`,
    `// MCP protocol: ${data.server?.protocolVersion || "?"}`,
    "// Paste this into ~/.cursor/mcp.json (or workspace .cursor/mcp.json)",
    "// and replace <your-agent-api-key> with a real ShadowPaste agent key.",
    "",
  ].join("\n");

  const body = JSON.stringify(cursorConfig, null, 2);
  const full = `${header}${body}\n`;

  const choice = await vscode.window.showInformationMessage(
    `ShadowPaste: Cursor MCP config ready (server ${
      data.server?.name || "?"
    }). Open in editor?`,
    "Open in editor",
    "Copy to clipboard"
  );
  if (choice === "Open in editor") {
    const doc = await vscode.workspace.openTextDocument({
      content: full,
      language: "jsonc",
    });
    await vscode.window.showTextDocument(doc);
  } else if (choice === "Copy to clipboard") {
    await vscode.env.clipboard.writeText(body);
    vscode.window.showInformationMessage(
      "ShadowPaste: Cursor MCP config copied to clipboard (paste into ~/.cursor/mcp.json)."
    );
  }
}
