// ShadowPaste V19 — Real MCP Server Endpoint (Phase 2)
// Supports two transports:
//   1. HTTP POST (single request/response) — /api/mcp
//   2. SSE stream (server-to-client) + POST (client-to-server) — /api/mcp?sse=1
// Claude Desktop / Cursor / Claude Web connect via an HTTP/SSE MCP server.
//
// CORS: this endpoint is authenticated by a Bearer token, NOT by cookies, so an
// Access-Control-Allow-Origin of "*" is safe (there are no ambient credentials
// for a hostile page to ride on). Browser-based MCP clients (Claude Web) send a
// CORS preflight, so we must answer OPTIONS with the right headers and echo them
// on every response — otherwise the browser blocks the connection before the
// JSON-RPC handshake ever runs.

import { NextRequest, NextResponse } from "next/server";
import { resolveMcpAgent, handleMcpRequest, MCP_SERVER_NAME, MCP_SERVER_VERSION, MCP_PROTOCOL_VERSION, type JsonRpcRequest } from "@/lib/mcp/server";
import { allowedOrigins } from "@/lib/app-url";

export const runtime = "nodejs";

// Permissive CORS for the MCP endpoint. Defaults to allowing any origin (the
// endpoint is token-authed). If ALLOWED_ORIGINS is configured, it is honored:
// a listed origin is reflected, an unlisted one falls back to the first entry.
function mcpCors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const allow = allowedOrigins();
  let acao: string;
  if (allow.length === 0 || allow.includes("*")) {
    acao = origin || "*";
  } else if (origin && allow.includes(origin)) {
    acao = origin;
  } else {
    acao = allow[0];
  }
  return {
    "Access-Control-Allow-Origin": acao,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mcp-version, MCP-Protocol-Version, Mcp-Session-Id",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// CORS preflight — 200 OK with the headers a browser MCP client needs.
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: mcpCors(req) });
}

// POST /api/mcp — single JSON-RPC request (or batch)
export async function POST(req: NextRequest) {
  const cors = mcpCors(req);
  const jsonHeaders = { "Content-Type": "application/json", ...cors };

  // Resolve the agent identity from the (optional) Bearer token. A missing token
  // is valid — it maps to the local-dev agent. Wrap it so a transient DB error
  // returns a clean JSON-RPC error instead of an unhandled 500.
  let agentId: string;
  try {
    agentId = await resolveMcpAgent(req.headers.get("authorization"));
  } catch (e) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: `agent resolution failed: ${(e as Error).message}` } },
      { status: 200, headers: jsonHeaders }
    );
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: jsonHeaders }
    );
  }

  try {
    if (Array.isArray(body)) {
      const results = await Promise.all(body.map((r) => handleMcpRequest(r, agentId, "default")));
      return NextResponse.json(results, { headers: { "Mcp-Session-Id": agentId, ...jsonHeaders } });
    }
    const res = await handleMcpRequest(body, agentId, "default");
    return NextResponse.json(res, { headers: { "Mcp-Session-Id": agentId, ...jsonHeaders } });
  } catch (e) {
    // Last-resort guard: never leak a 500 to an MCP client. Echo the request id
    // when we have one so the client can correlate the error.
    const id = !Array.isArray(body) && body && typeof body === "object" && "id" in body ? (body as JsonRpcRequest).id : null;
    return NextResponse.json(
      { jsonrpc: "2.0", id, error: { code: -32603, message: (e as Error).message } },
      { status: 200, headers: jsonHeaders }
    );
  }
}

// GET /api/mcp — server info (no ?sse) or an SSE stream (?sse=1)
export async function GET(req: NextRequest) {
  const cors = mcpCors(req);
  const { searchParams } = new URL(req.url);
  if (!searchParams.get("sse")) {
    return NextResponse.json(
      {
        server: MCP_SERVER_NAME, version: MCP_SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        transports: ["http", "sse"],
        endpoints: {
          post: "/api/mcp (JSON-RPC over HTTP)",
          sse: "/api/mcp?sse=1 (server-sent events stream)",
        },
        auth: "Bearer <agent-api-key> (optional for local dev)",
        docs: "https://modelcontextprotocol.io",
      },
      { headers: cors }
    );
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
      ...cors,
    },
  });
}
