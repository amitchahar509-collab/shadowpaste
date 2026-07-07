import { NextRequest, NextResponse } from "next/server";
import { MCP_SERVER_NAME, MCP_PROTOCOL_VERSION } from "@/lib/mcp/server";

// GET /api/mcp-config — generate mcp.json config examples for Claude Desktop / Cursor
export async function GET(req: NextRequest) {
  const host = req.headers.get("host") || "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;
  return NextResponse.json({
    server: { name: MCP_SERVER_NAME, protocolVersion: MCP_PROTOCOL_VERSION },
    configs: {
      "claude-desktop": {
        mcpServers: {
          shadowpaste: {
            type: "http",
            url: `${base}/api/mcp`,
            // Optional: per-agent API key for identity
            headers: { Authorization: "Bearer <your-agent-api-key>" },
          },
        },
      },
      cursor: {
        mcpServers: {
          shadowpaste: {
            url: `${base}/api/mcp`,
            headers: { Authorization: "Bearer <your-agent-api-key>" },
          },
        },
      },
      "stdio-bridge": {
        command: "npx",
        args: ["-y", "mcp-remote", `${base}/api/mcp`],
      },
    },
    instructions: [
      `1. Add the config above to your MCP client (Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json on macOS)`,
      `2. Restart the client`,
      `3. Claude will now discover ${TOOL_COUNT} tools via tools/list`,
      `4. Every tools/call passes through ShadowPaste's zero-trust gateway (risk → policy → audit)`,
    ],
  });
}

const TOOL_COUNT = 25;
