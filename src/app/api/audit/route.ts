import { NextRequest, NextResponse } from "next/server"
import { getTimeline } from "@/lib/audit"

// GET /api/audit?limit=100&agentId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get("limit") || "100")
  const agentId = searchParams.get("agentId") || undefined
  const timeline = await getTimeline({ limit, agentId })
  return NextResponse.json({ timeline })
}
