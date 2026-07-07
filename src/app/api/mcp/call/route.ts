import { NextRequest, NextResponse } from "next/server"
import { invokeTool } from "@/lib/gateway"
import { db } from "@/lib/db"

// POST /api/mcp/call — invoke a tool through the zero-trust gateway
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { agentId, sessionId, toolName, input } = body
  if (!agentId || !toolName) {
    return NextResponse.json({ error: "agentId and toolName required" }, { status: 400 })
  }
  // Ensure a session exists
  let sid = sessionId
  if (!sid) {
    const s = await db.session.create({ data: { agentId, status: "active", source: "mcp-call", context: JSON.stringify({ via: "gateway" }) } })
    sid = s.id
  }
  try {
    const result = await invokeTool({ agentId, sessionId: sid, toolName, input: input || {} })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
