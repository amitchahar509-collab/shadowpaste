import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext } from "@/lib/auth"
import { runAttack, ATTACK_SCENARIOS } from "@/lib/attacks"

// POST /api/attacks/run — { scenarioId, agentId }
// Authenticated + tenant-scoped: runs a red-team scenario against one of the
// caller's own agents.
export async function POST(req: NextRequest) {
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

  const body = await req.json()
  const scenario = ATTACK_SCENARIOS.find((s) => s.id === body.scenarioId)
  if (!scenario) return NextResponse.json({ error: "scenario not found" }, { status: 404 })
  // Default to a rogue agent in the caller's org if not specified
  let agentId = body.agentId
  if (agentId) {
    const owned = await db.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId } })
    if (!owned) return NextResponse.json({ error: "agent not found in your org" }, { status: 403 })
  } else {
    const rogue = await db.agent.findFirst({ where: { orgId: ctx.orgId, status: "quarantined" } })
    const fallback = await db.agent.findFirst({ where: { orgId: ctx.orgId, trustScore: { lt: 40 } } })
    agentId = (rogue || fallback)?.id
  }
  if (!agentId) return NextResponse.json({ error: "no agent available" }, { status: 400 })
  const result = await runAttack(scenario, agentId)
  return NextResponse.json({ ok: true, ...result })
}
