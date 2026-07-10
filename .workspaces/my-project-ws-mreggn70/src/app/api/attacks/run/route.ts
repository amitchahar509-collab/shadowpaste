import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { runAttack, ATTACK_SCENARIOS } from "@/lib/attacks"

// POST /api/attacks/run — { scenarioId, agentId }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const scenario = ATTACK_SCENARIOS.find((s) => s.id === body.scenarioId)
  if (!scenario) return NextResponse.json({ error: "scenario not found" }, { status: 404 })
  // Default to rogue agent if not specified
  let agentId = body.agentId
  if (!agentId) {
    const rogue = await db.agent.findFirst({ where: { status: "quarantined" } })
    const fallback = await db.agent.findFirst({ where: { trustScore: { lt: 40 } } })
    agentId = (rogue || fallback)?.id
  }
  if (!agentId) return NextResponse.json({ error: "no agent available" }, { status: 400 })
  const result = await runAttack(scenario, agentId)
  return NextResponse.json({ ok: true, ...result })
}
