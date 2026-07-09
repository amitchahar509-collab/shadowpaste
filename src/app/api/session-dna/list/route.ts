import { NextResponse } from "next/server"
import { listActiveSessions } from "@/lib/security/session-dna"

// GET /api/session-dna/list — list active sessions
export async function GET() {
  const sessions = listActiveSessions()
  return NextResponse.json({ sessions, count: sessions.length })
}
