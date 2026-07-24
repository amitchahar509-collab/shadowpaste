// ShadowPaste V19 — Real MCP Protocol Server (Phase 2)
// Implements the Model Context Protocol JSON-RPC 2.0 message format over HTTP
// and SSE. Claude Desktop / Cursor / any MCP client can connect to /api/mcp.
//
// Supported methods:
//   - initialize       → protocol handshake, server capabilities
//   - tools/list       → enumerate registered MCP tools (from our registry)
//   - tools/call       → invoke a tool through the zero-trust gateway
//   - ping             → health
//
// Every tools/call passes through: risk -> policy -> credential injection ->
// real execution -> audit. The agent identity is derived from the MCP client
// token (Bearer) or a default demo agent for local development.

import { db } from "@/lib/db";
import { TOOL_REGISTRY } from "@/lib/tool-registry";
import { invokeTool } from "@/lib/gateway";
import { createHash } from "crypto";

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const MCP_SERVER_NAME = "shadowpaste";
export const MCP_SERVER_VERSION = "1.0.0";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Resolve an agent identity from the MCP client. In production this would map
// a per-client API key to an Agent row. For local dev, we use a hash of the
// bearer token to find or create a "Claude Desktop" agent.
export async function resolveMcpAgent(authHeader: string | null, orgId = "default"): Promise<string> {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "") || "local-dev";
  const tokenHash = createHash("sha256").update(token).digest("hex").slice(0, 32);
  // Look for an agent with this apiKeyHash
  const existing = await db.agent.findFirst({ where: { apiKeyHash: tokenHash } });
  if (existing) return existing.id;
  // Create a new agent identity for this MCP client
  const provider = token === "local-dev" ? "Claude" : "MCP-Client";
  const name = token === "local-dev" ? "Claude Desktop (local)" : `MCP Client ${tokenHash.slice(0, 6)}`;
  const agent = await db.agent.create({
    data: { orgId, name, provider, trustScore: 70, status: "active", avatarColor: "#d97706", modelVersion: "mcp-client", apiKeyHash: tokenHash },
  });
  return agent.id;
}

// The tool registry stores parameter types in shorthand ("string", "number",
// "object", "string[]"). MCP requires each inputSchema property to be a valid
// JSON Schema object ({ "type": "string" }), NOT a bare type string. A client
// that validates the schema (Claude) silently drops any tool whose properties
// are malformed — which surfaces as "0 tools". This converter expands the
// shorthand into spec-compliant JSON Schema.
function toJsonSchema(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object") return v as Record<string, unknown>; // already a schema
  const t = String(v ?? "string").trim();
  if (t.endsWith("[]")) return { type: "array", items: toJsonSchema(t.slice(0, -2)) };
  switch (t) {
    case "string": return { type: "string" };
    case "number": return { type: "number" };
    case "integer": return { type: "integer" };
    case "boolean": return { type: "boolean" };
    case "object": return { type: "object" };
    case "array": return { type: "array" };
    default: return { type: "string" };
  }
}

export function buildToolList() {
  return TOOL_REGISTRY.map((t) => {
    // Always emit a valid object schema. A tool with no params gets
    // { type: "object", properties: {} } — never undefined/null.
    const properties: Record<string, Record<string, unknown>> = {};
    for (const [key, val] of Object.entries(t.inputSchema || {})) {
      properties[key] = toJsonSchema(val);
    }
    return {
      name: t.name,
      description: t.description,
      inputSchema: { type: "object", properties, additionalProperties: false },
      annotations: { riskLevel: t.riskLevel, riskScore: t.riskScore, category: t.category, package: t.packageName },
    };
  });
}

export async function handleMcpRequest(req: JsonRpcRequest, agentId: string, orgId: string): Promise<JsonRpcResponse> {
  try {
    switch (req.method) {
      case "initialize":
        return {
          jsonrpc: "2.0", id: req.id,
          result: {
            protocolVersion: MCP_PROTOCOL_VERSION,
            serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
            capabilities: { tools: { listChanged: false }, resources: {}, prompts: {}, logging: {} },
          },
        };
      case "initialized":
        return { jsonrpc: "2.0", id: req.id, result: {} };
      case "ping":
        return { jsonrpc: "2.0", id: req.id, result: {} };
      case "tools/list":
        return { jsonrpc: "2.0", id: req.id, result: { tools: buildToolList() } };
      case "tools/call": {
        const params = req.params || {};
        const name = params.name as string;
        const input = (params.arguments as Record<string, unknown>) || {};
        if (!name) return { jsonrpc: "2.0", id: req.id, error: { code: -32602, message: "Missing tool name" } };
        // Create a session for this MCP call
        const session = await db.session.create({ data: { agentId, status: "active", source: "mcp-sse", context: JSON.stringify({ via: "mcp" }) } });
        const result = await invokeTool({ agentId, sessionId: session.id, toolName: name, input, orgId });
        // MCP content format
        const content = [{
          type: "text",
          text: JSON.stringify({
            tool: name, decision: result.decision, reason: result.reason,
            riskScore: result.riskScore, riskLevel: result.riskLevel,
            executed: result.executed, output: result.output,
          }, null, 2),
        }];
        const isError = result.decision === "deny" || result.decision === "blocked";
        return { jsonrpc: "2.0", id: req.id, result: { content, isError } };
      }
      default:
        return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
    }
  } catch (e) {
    return { jsonrpc: "2.0", id: req.id, error: { code: -32603, message: (e as Error).message } };
  }
}
