import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, requirePermission } from "@/lib/auth"
import { validateAccessToken } from "@/lib/oauth"
import { auditUnauthorized, auditRequest } from "@/lib/audit-request"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"

// GET /api/audit-logs?limit=100&action=vault.store&actorType=agent
// Returns org-scoped audit log entries (compliance trail).
//
// SECURITY: this endpoint previously did `getContext(req) || anonymousContext()`,
// and anonymousContext() resolves to orgId "default" with role DEVELOPER. That
// handed ANY unauthenticated caller the entire default org's compliance trail —
// tool invocations, vault operations, actor ids, client IPs and user agents.
// Confirmed exploitable in production (anonymous GET returned HTTP 200 with real
// rows) before this fix.
//
// Authentication is now mandatory and accepted from either:
//   * an OAuth 2.1 Bearer access token (validated against the token store), or
//   * a ShadowPaste session cookie.
// The caller must additionally hold the `audit.export` permission, so a VIEWER
// cannot read the compliance trail. Results stay scoped to the caller's own org.
export async function GET(req: NextRequest) {
  // 0. Throttle first. Every rejected request used to write an audit row, so an
  //    anonymous caller could drive unbounded INSERTs (measured: 30 parallel
  //    probes -> 30 writes). Limiting before the auth check means a probe flood
  //    costs zero database work; auditUnauthorized additionally coalesces.
  // Its own budget, not the login one: an unauthenticated probe here must not
  // consume the brute-force allowance protecting a user's password, and vice
  // versa. Write amplification is bounded independently by the coalescing in
  // auditUnauthorized, so this limit is defence in depth rather than the
  // primary control.
  const rl = await enforceRateLimit(req, "default")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  // 1. OAuth Bearer token takes precedence (MCP clients / integrations).
  let orgId: string | null = null
  let role: string | null = null
  let actorId: string | null = null

  const auth = req.headers.get("authorization") || ""
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    const grant = await validateAccessToken(bearer)
    if (grant) {
      orgId = grant.orgId
      actorId = grant.userId
      // Resolve the token owner's role within that org.
      const m = await db.membership.findFirst({ where: { userId: grant.userId, orgId: grant.orgId } })
      role = m?.role ?? "VIEWER"
    }
  }

  // 2. Fall back to a session cookie.
  if (!orgId) {
    const ctx = await getContext(req)
    if (ctx?.user) {
      orgId = ctx.orgId
      role = ctx.role
      actorId = ctx.user.id
    }
  }

  // 3. No valid credential -> 401. Never fall back to an anonymous context.
  if (!orgId || !role) {
    await auditUnauthorized(req, "/api/audit-logs", { reason: "no valid session or bearer token" })
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required to access audit logs" },
      { status: 401, headers: { "WWW-Authenticate": `Bearer realm="shadowpaste"` } }
    )
  }

  // 4. Authenticated but insufficient role -> 403 (distinct from "who are you?").
  const allowed = requirePermission(role, "audit.export")
  if (!allowed.ok) {
    await auditRequest(req, {
      action: "audit.access_denied", target: "/api/audit-logs",
      decision: "BLOCKED", riskScore: 55, orgId, actorId: actorId ?? undefined,
      detail: { reason: allowed.reason ?? "insufficient role", role },
    })
    return NextResponse.json(
      { error: "forbidden", message: "Your role does not permit reading audit logs" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500)
  const action = searchParams.get("action")
  const actorType = searchParams.get("actorType")

  // Always scoped to the caller's own org — never a client-supplied orgId.
  const where: Record<string, unknown> = { orgId }
  if (action) where.action = { contains: action }
  if (actorType) where.actorType = actorType

  const logs = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  // Aggregate counts by action + actorType for the summary
  const allLogs = await db.auditLog.findMany({ where: { orgId }, select: { action: true, actorType: true } })
  const byAction: Record<string, number> = {}
  const byActor: Record<string, number> = {}
  for (const l of allLogs) {
    byAction[l.action] = (byAction[l.action] || 0) + 1
    byActor[l.actorType] = (byActor[l.actorType] || 0) + 1
  }

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      orgId: l.orgId,
      actorType: l.actorType,
      actorId: l.actorId,
      action: l.action,
      target: l.target,
      metadata: l.metadata ? safeParse(l.metadata) : null,
      time: l.createdAt.toISOString(),
    })),
    counts: { total: allLogs.length, byAction, byActor },
  })
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return { raw: s } }
}
