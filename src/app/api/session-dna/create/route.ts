import { NextRequest, NextResponse } from "next/server"
import { createSessionDNA } from "@/lib/security/session-dna"
import { getContext } from "@/lib/auth"
import { auditUnauthorized } from "@/lib/audit-request"

// POST /api/session-dna/create — create a new Agent Session DNA.
// Authenticated only: mints a signing identity for an agent session.
export async function POST(req: NextRequest) {
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/session-dna/create"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const { agentId, agentName, workspacePath, trustScore } = await req.json().catch(() => ({}))
  if (!agentId || !agentName) return NextResponse.json({ error: "agentId and agentName required" }, { status: 400 })

  const { session, privateKey: _priv } = await createSessionDNA({ agentId, agentName, workspacePath, trustScore })
  // Private key NEVER leaves the server
  return NextResponse.json({
    ok: true,
    session: {
      sessionId: session.sessionId,
      publicKey: session.publicKeyB64,
      fingerprint: session.fingerprint,
      createdAt: session.createdAt,
      agentId: session.agentId,
      agentName: session.agentName,
      workspacePath: session.workspacePath,
      trustScore: session.trustScore,
      status: session.status,
      expiresAt: session.expiresAt,
    },
  })
}
