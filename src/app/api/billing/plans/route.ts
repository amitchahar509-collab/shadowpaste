import { NextResponse } from "next/server"
import { PLANS } from "@/lib/billing"

// GET /api/billing/plans — list all plans + limits
export async function GET() {
  return NextResponse.json({ plans: Object.values(PLANS) })
}
