"use strict";
// ShadowPaste for Cursor — thin wrapper over the VS Code extension.
//
// Cursor ships the VS Code extension API, so we literally re-export the
// VS Code extension's `activate` / `deactivate` (which register the three
// commands: scanWorkspace, protectSecrets, connectMcp) and add a fourth
// command — `shadowpaste.cursorMcp` — that opens the MCP config in the
// Cursor-specific format.
//
// The Cursor-specific config lives under the `cursor` key of the response
// from GET /api/mcp-config (see /shadow-rxnlwnb8zfeVx65GcGNw1sbOVYVLekqM3KdULZD.ts).
// We extract just that key, format it as a `~/.cursor/mcp.json`-shaped
// document, and open it in an untitled editor so the user can copy/paste
// it into Cursor's MCP settings.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.shadow-cxU8dQCEDpZIQeVFR(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = void 0;
exports.activate = activate;
const vscode = __importStar(require("vscode"));
// Re-export everything (deactivate, readConfig, getJson, types …) from the
// sibling VS Code extension. We override `activate` below to add the
// Cursor-specific `shadowpaste.cursorMcp` command on top of the three
// base commands the VS Code extension registers.
const vscodeExt = __importStar(require("../../vscode/src/extension"));
exports.deactivate = vscodeExt.deactivate;
/**
 * Cursor entry point. Delegates to the VS Code extension's activate (which
 * registers scanWorkspace / protectSecrets / connectMcp) and then registers
 * the Cursor-specific `shadowpaste.cursorMcp` command.
 */
function activate(context) {
    // Run the VS Code extension's activate — registers the 3 base commands.
    if (typeof vscodeExt.activate === "function") {
        vscodeExt.activate(context);
    }
    // Register the Cursor-specific command.
    context.subscriptions.push(vscode.commands.registerCommand("shadowpaste.cursorMcp", () => cursorMcpCommand()));
    console.info("[ShadowPaste-Cursor] extension activated.");
}
async function cursorMcpCommand() {
    const cfg = vscodeExt.readConfig();
    const res = await vscodeExt.getJson(cfg, "/api/mcp-config");
    if (!res.ok) {
        vscode.window.showErrorMessage(`ShadowPaste: cannot fetch MCP config — ${res.error}`);
        return;
    }
    const data = res.data;
    // Pull the `cursor` key — the backend ships a Cursor-shaped mcpServers block.
    const cursorConfig = data.configs?.cursor || {
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
    const choice = await vscode.window.showInformationMessage(`ShadowPaste: Cursor MCP config ready (server ${data.server?.name || "?"}). Open in editor?`, "Open in editor", "Copy to clipboard");
    if (choice === "Open in editor") {
        const doc = await vscode.workspace.openTextDocument({
            content: full,
            language: "jsonc",
        });
        await vscode.window.showTextDocument(doc);
    }
    else if (choice === "Copy to clipboard") {
        await vscode.env.clipboard.writeText(body);
        vscode.window.showInformationMessage("ShadowPaste: Cursor MCP config copied to clipboard (paste into ~/.cursor/mcp.json).");
    }
}
//# sourceMappingURL=extension.js.map