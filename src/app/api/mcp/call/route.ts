import { NextRequest, NextResponse } from "next/server"
import { invokeTool } from "@/lib/gateway"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"

// POST /api/mcp/call — invoke a tool through the zero-trust gateway (REAL execution)
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const body = await req.json()
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
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
