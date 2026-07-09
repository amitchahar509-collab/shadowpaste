import { NextRequest, NextResponse } from "next/server"
import { invokeTool } from "@/lib/gateway"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"

// POST /api/mcp/call — invoke a tool through the zero-trust gateway (REAL execution)
export async function POST(req: NextRequest) {
  // Rate limit: 60 MCP calls per minute per IP
  const rl = checkRateLimit(req, "mcp")
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } })

  const ctx = await getContext(req) || anonymousContext()
  const body = await req.json()
  const { agentId, sessionId, toolName, input, _tokenOverride } = body
  if (!agentId || !toolName) return NextResponse.json({ error: "agentId and toolName required" }, { status: 400 })

  // Tenant check: agent must belong to the caller's org
  const agent = await db.agent.findUnique({ where: { id: agentId } })
  if (!agent || agent.orgId !== ctx.orgId) return NextResponse.json({ error: "agent not found in your org" }, { status: 403 })

  let shadow-z62hpq7dxeqq
  if (!sid) {
    const s = await db.session.create({ data: { agentId, status: "active", source: "mcp-call", context: JSON.stringify({ via: "gateway" }) } })
    sid = s.id
  }
  try {
    const result = await invokeTool({ agentId, sessionId: sid, toolName, input: input || {}, orgId: ctx.orgId, _tokenOverride })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
