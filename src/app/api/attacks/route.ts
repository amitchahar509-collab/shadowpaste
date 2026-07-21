import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ATTACK_SCENARIOS } from "@/lib/attacks"

// GET /api/attacks — list scenarios + historical attack tests
export async function GET() {
  const tests = await db.attackTest.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
  return NextResponse.json({ scenarios: ATTACK_SCENARIOS, history: tests })
}
