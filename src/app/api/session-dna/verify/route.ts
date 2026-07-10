import { NextResponse } from "next/server"
import { verifyChain, getFullChain } from "@/lib/security/flight-recorder"

// GET /api/session-dna/verify — verify the hash chain integrity
export async function GET() {
  const result = await verifyChain()
  return NextResponse.json({ ...result, eventCount: getFullChain().length })
}
