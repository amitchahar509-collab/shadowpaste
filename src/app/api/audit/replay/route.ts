import { NextRequest, NextResponse } from "next/server"
import { getReplay } from "@/lib/audit"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get("sessionId") || undefined
  const steps = await getReplay(sessionId)
  return NextResponse.json({ steps })
}
