import { NextRequest, NextResponse } from "next/server"
import { invokeTool } from "@/lib/gateway"
import { db } from "@/lib/db"
import { getContext } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { internalError } from "@/lib/api-error"
import { auditUnauthorized } from "@/lib/audit-request"

// POST /api/mcp/call — invoke a tool through the zero-trust gateway (REAL execution)
export async function POST(req: NextRequest) {
  // Rate limit: 60 MCP calls per minute per IP
  const rl = checkRateLimit(req, "mcp")
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } })

  // Authenticated only: the gateway executes real side effects (filesystem
  // writes, GitHub mutations) on behalf of the caller's org.
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/mcp/call"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const body = await req.json().catch(() => ({}))
  const { agentId, sessionId, toolName, input, _tokenOverride } = body
  if (!agentId || !toolName) return NextResponse.json({ error: "agentId and toolName required" }, { status: 400 })

  // Tenant check: agent must belong to the caller's org
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent || agent.orgId !== ctx.orgId) return NextResponse.json({ error: "agent not found in your org" }, { status: 403 })

  let sid = sessionId
  if (!sid) {
    const s = await db.session.create({ data: { agentId, status: "active", source: "mcp-call", context: JSON.stringify({ via: "gateway" }) } })
    sid = s.id
  }
  try {
    const result = await invokeTool({ agentId, sessionId: sid, toolName, input: input || {}, orgId: ctx.orgId, _tokenOverride })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return internalError(e, "mcp.call")
  }
}
