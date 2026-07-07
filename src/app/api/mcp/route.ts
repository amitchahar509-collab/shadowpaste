// ShadowPaste V19 — Real MCP Server Endpoint (Phase 2)
// Supports two transports:
//   1. HTTP POST (single request/response) — /api/mcp
//   2. SSE stream (server-to-client) + POST (client-to-server) — /api/mcp?sse=1
// Claude Desktop / Cursor connect via stdio bridge OR an HTTP/SSE MCP server.
// This endpoint implements the HTTP/SSE variant of the MCP protocol.

import { NextRequest, NextResponse } from "next/server";
import { resolveMcpAgent, handleMcpRequest, MCP_SERVER_NAME, MCP_SERVER_VERSION, MCP_PROTOCOL_VERSION, type JsonRpcRequest } from "@/lib/mcp/server";

export const runtime = "nodejs";

// POST /api/mcp — single JSON-RPC request (or batch)
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const agentId = await resolveMcpAgent(auth);
  let body: JsonRpcRequest | JsonRpcRequest[];
  try { body = await req.json(); } catch { return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }

  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((r) => handleMcpRequest(r, agentId, "default")));
    return NextResponse.json(results, { headers: { "Mcp-Session-Id": agentId } });
  }
  const res = await handleMcpRequest(body, agentId, "default");
  return NextResponse.json(res, { headers: { "Mcp-Session-Id": agentId } });
}

// GET /api/mcp — SSE endpoint for server-to-client notifications
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (!searchParams.get("sse")) {
    return NextResponse.json({
      server: MCP_SERVER_NAME, version: MCP_SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transports: ["http", "sse"],
      endpoints: {
        post: "/api/mcp (JSON-RPC over HTTP)",
        sse: "/api/mcp?sse=1 (server-sent events stream)",
      },
      auth: "Bearer <agent-api-key> (optional for local dev)",
      docs: "https://modelcontextprotocol.io",
    });
  }
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      send("endpoint", { url: "/api/mcp", method: "POST" });
      send("ready", { server: MCP_SERVER_NAME, version: MCP_SERVER_VERSION });
      // Keep-alive
      const ka = setInterval(() => send("ping", { t: Date.now() }), 15000);
      req.signal.addEventListener("abort", () => { clearInterval(ka); controller.close(); });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Mcp-Session-Id": "sse-stream",
    },
  });
}
