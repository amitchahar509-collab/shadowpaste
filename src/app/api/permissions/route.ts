import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/permissions?agentId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const agentId = searchParams.get("agentId")
  const permissions = await db.permission.findMany({
    where: agentId ? { agentId } : undefined,
    include: { agent: true },
    orderBy: { createdAt: "desc" },
  })
  return NextResponse.json({ permissions })
}

// POST — set/update a permission decision (allow_always / allow_once / ask / deny)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { agentId, toolName, scope, decision, riskLevel, grantedBy } = body
  if (!agentId || !toolName || !decision) {
    return NextResponse.json({ error: "agentId, toolName, decision required" }, { status: 400 })
  }
  // Upsert by agentId+toolName
  const existing = await db.permission.findFirst({ where: { agentId, toolName } })
  let permission
  if (existing) {
    permission = await db.permission.update({ where: { id: existing.id }, data: { decision, scope: scope || existing.scope, riskLevel: riskLevel || existing.riskLevel, grantedBy: grantedBy || "user" } })
  } else {
    permission = await db.permission.create({ data: { agentId, toolName, scope: scope || "read", decision, riskLevel: riskLevel || "low", grantedBy: grantedBy || "user" } })
  }
  return NextResponse.json({ permission })
}
