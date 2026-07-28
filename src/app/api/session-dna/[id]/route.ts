import { NextRequest, NextResponse } from "next/server"
import { getSession, revokeSession, isSessionValid } from "@/lib/security/session-dna"
import { getContext } from "@/lib/auth"
import { auditUnauthorized } from "@/lib/audit-request"

// GET /api/session-dna/[id] — get session status
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const session = getSession(id)
  if (!session) return NextResponse.json({ error: "session not found" }, { status: 404 })
  return NextResponse.json({ session, valid: isSessionValid(id) })
}

// DELETE /api/session-dna/[id] — revoke (kill switch). Authenticated only.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const authCtx = await getContext(req)
  if (!authCtx || !authCtx.user) { await auditUnauthorized(req, "/api/session-dna/[id]"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }

  const { searchParams } = new URL(req.url)
  const reason = searchParams.get("reason") || "manual revoke"
  const ok = revokeSession(id, reason)
  return NextResponse.json({ ok, sessionId: id, reason })
}
