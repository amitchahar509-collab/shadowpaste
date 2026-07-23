import { NextRequest, NextResponse } from "next/server"
import { createCapsule, restoreFromCapsule } from "@/lib/security/session-capsule"
import { getSession } from "@/lib/security/session-dna"

// POST /api/session-dna/capsule — create or restore a session-bound capsule
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action } = body

  if (action === "create") {
    const { sessionId, rawSecret, secretName, contextHint, orgId, projectId } = body
    const session = getSession(sessionId)
    if (!session || session.status !== "active") return NextResponse.json({ error: "invalid or inactive session" }, { status: 403 })
    const { capsule, fake } = await createCapsule({ session, rawSecret, secretName, contextHint, orgId, projectId })
    return NextResponse.json({ ok: true, capsuleId: capsule.capsuleId, fakeSecret: fake })
  }

  if (action === "restore") {
    const { sessionId, fakeSecret } = body
    const session = getSession(sessionId)
    if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 })
    const result = await restoreFromCapsule({ sessionId, sessionFingerprint: session.fingerprint, fakeSecret })
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: "action must be create or restore" }, { status: 400 })
}
