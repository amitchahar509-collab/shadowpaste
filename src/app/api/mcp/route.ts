// ShadowPaste V19 — MCP Server Endpoint (Phase 2)
//
// Transports supported on this single URL (/api/mcp):
//   • HTTP+SSE (2024-11-05): GET opens an SSE stream and emits an `endpoint`
//     event; the client POSTs JSON-RPC to that endpoint.
//   • Streamable HTTP (newer clients, incl. Claude connectors): the client POSTs
//     JSON-RPC and, when it sends `Accept: text/event-stream`, receives the
//     response framed as a single SSE `message` event instead of a JSON body.
//
// CORS: the endpoint is authenticated by a Bearer token / query token, NOT by
// cookies, so an Access-Control-Allow-Origin of "*" is safe. Browser MCP clients
// (Claude Web) preflight with OPTIONS, so every response echoes CORS headers.
//
// Auth: token is read from the Authorization header first, then from a query
// param (?token= / ?key= / ?api_key=) because some clients (Claude Web UI)
// can't attach custom headers. No token => the local-dev agent, never an error.

import { NextRequest, NextResponse } from "next/server";
import { resolveMcpAgent, handleMcpRequest, MCP_SERVER_NAME, MCP_SERVER_VERSION, MCP_PROTOCOL_VERSION, type JsonRpcRequest } from "@/lib/mcp/server";
import { allowedOrigins } from "@/lib/app-url";
import { validateAccessToken } from "@/lib/oauth";
import { auditRequest } from "@/lib/audit-request";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

// ---- CORS ----
function mcpCors(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin");
  const allow = allowedOrigins();
  let acao: string;
  if (allow.length === 0 || allow.includes("*")) acao = origin || "*";
  else if (origin && allow.includes(origin)) acao = origin;
  else acao = allow[0];
  return {
    "Access-Control-Allow-Origin": acao,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-mcp-version, MCP-Protocol-Version, Mcp-Session-Id, Accept, Last-Event-ID",
    "Access-Control-Expose-Headers": "Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ---- token extraction: header, then query param ----
function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  if (h) {
    const m = h.match(/^Bearer\s+(.+)$/i);
    return (m ? m[1] : h).trim() || null;
  }
  const q = req.nextUrl.searchParams;
  return q.get("token") || q.get("key") || q.get("api_key") || null;
}

function wantsEventStream(req: NextRequest): boolean {
  return (req.headers.get("accept") || "").toLowerCase().includes("text/event-stream");
}

// Frame a JSON payload as a single-message SSE response (Streamable HTTP).
function sseJson(payload: unknown, sessionId: string, extra: Record<string, string>): Response {
  const body = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Mcp-Session-Id": sessionId,
      ...extra,
    },
  });
}

// ---- OPTIONS: CORS preflight (200 OK) ----
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 200, headers: mcpCors(req) });
}

// ---- POST: JSON-RPC request (or batch). Responds JSON or SSE per Accept. ----
export async function POST(req: NextRequest) {
  const cors = mcpCors(req);
  const jsonHeaders = { "Content-Type": "application/json", ...cors };

  // Rate limit BEFORE any auth work or DB access. This is the primary public
  // attack surface — it was previously unthrottled, and 90 parallel requests
  // all returned 200. Rejecting here means a flood costs no database round
  // trips at all. Errors are returned in JSON-RPC shape so MCP clients can
  // parse them; -32000 is the reserved implementation-defined server error.
  const rl = await enforceRateLimit(req, "mcp");
  if (!rl.ok) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: `rate limit exceeded: too many MCP requests, retry in ${Math.ceil(rl.retryAfterMs / 1000)}s`,
        },
      },
      { status: 429, headers: { ...jsonHeaders, ...rateLimitHeaders(rl) } }
    );
  }

  // Resolve agent identity (header token → query token → local-dev). Wrapped so
  // a transient DB error becomes a JSON-RPC error, never an unhandled 500.
  //
  // If the token is a real OAuth access token it is validated first, and the
  // resolved user/org becomes the tenant for this call. REQUIRE_OAUTH=true makes
  // a valid OAuth token mandatory, which is the correct posture for a public
  // deployment; the default stays permissive for local development.
  let agentId: string;
  let oauthOrgId: string | null = null;
  try {
    const token = extractToken(req);
    if (token) {
      const grant = await validateAccessToken(token);
      if (grant) oauthOrgId = grant.orgId;
      else if (process.env.REQUIRE_OAUTH === "true") {
        // A presented-but-invalid token is a stronger signal than no token at
        // all: it means someone is replaying an expired/revoked/forged bearer.
        await auditRequest(req, {
          action: "mcp.token_invalid", target: "/api/mcp",
          decision: "BLOCKED", riskScore: 75, detail: { reason: "invalid or expired OAuth access token" },
        });
        return NextResponse.json(
          { jsonrpc: "2.0", id: null, error: { code: -32001, message: "invalid_token: a valid OAuth access token is required" } },
          { status: 401, headers: { ...jsonHeaders, "WWW-Authenticate": `Bearer realm="shadowpaste", error="invalid_token"` } }
        );
      }
    } else if (process.env.REQUIRE_OAUTH === "true") {
      await auditRequest(req, {
        action: "mcp.unauthenticated", target: "/api/mcp",
        decision: "BLOCKED", riskScore: 60, detail: { reason: "no bearer token presented" },
      });
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32001, message: "invalid_token: authorization required" } },
        { status: 401, headers: { ...jsonHeaders, "WWW-Authenticate": `Bearer realm="shadowpaste"` } }
      );
    }
    agentId = await resolveMcpAgent(token ? `Bearer ${token}` : null, oauthOrgId || "default");
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

  const sse = wantsEventStream(req);
  try {
    const payload = Array.isArray(body)
      ? await Promise.all(body.map((r) => handleMcpRequest(r, agentId, oauthOrgId || "default")))
      : await handleMcpRequest(body, agentId, oauthOrgId || "default");

    return sse
      ? sseJson(payload, agentId, cors)
      : NextResponse.json(payload, { headers: { "Mcp-Session-Id": agentId, ...jsonHeaders } });
  } catch (e) {
    const id = !Array.isArray(body) && body && typeof body === "object" && "id" in body ? (body as JsonRpcRequest).id : null;
    const errPayload = { jsonrpc: "2.0", id, error: { code: -32603, message: (e as Error).message } };
    return sse
      ? sseJson(errPayload, agentId, cors)
      : NextResponse.json(errPayload, { status: 200, headers: jsonHeaders });
  }
}

// ---- GET: SSE stream (HTTP+SSE transport) or JSON server info ----
export async function GET(req: NextRequest) {
  const cors = mcpCors(req);
  const { searchParams } = new URL(req.url);
  const sse = searchParams.get("sse") !== null || wantsEventStream(req);

  if (!sse) {
    // Plain GET (browser / discovery) → JSON server descriptor.
    return NextResponse.json(
      {
        server: MCP_SERVER_NAME, version: MCP_SERVER_VERSION,
        protocolVersion: MCP_PROTOCOL_VERSION,
        transports: ["streamable-http", "http", "sse"],
        endpoints: { post: "/api/mcp", sse: "/api/mcp (Accept: text/event-stream)" },
        auth: "Bearer <token> header, or ?token=<token> query param (optional; falls back to local-dev)",
        docs: "https://modelcontextprotocol.io",
      },
      { headers: cors }
    );
  }

  // SSE stream. Per the HTTP+SSE transport, the first event is `endpoint`, whose
  // data is the URI the client should POST JSON-RPC messages to (a string).
  const messagesUri = "/api/mcp";
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const raw = (s: string) => controller.enqueue(encoder.encode(s));
      // Standard endpoint discovery event (data = URI string).
      raw(`event: endpoint\ndata: ${messagesUri}\n\n`);
      // Keep-alive comments so proxies don't drop the idle stream.
      const ka = setInterval(() => raw(`: keep-alive ${Date.now()}\n\n`), 15000);
      req.signal.addEventListener("abort", () => { clearInterval(ka); try { controller.close(); } catch { /* already closed */ } });
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
