import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, requirePermission } from "@/lib/auth"
import { validateAccessToken, bearerChallenge } from "@/lib/oauth"
import { auditUnauthorized } from "@/lib/audit-request"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import { limitParam } from "@/lib/query-params"
import { recentSpans, tracingStatus } from "@/lib/observability/trace"

// GET /api/v1/traces — recent spans from the in-process buffer + exporter status.
//
// AUTHENTICATED AND ROLE-GATED. Spans carry tool names, agent ids, org ids, risk
// scores and decisions — an operational map of who is doing what. That is exactly
// the material the audit-log disclosure taught us not to serve anonymously, so
// this endpoint requires the same `audit.export` permission from the outset
// rather than being retrofitted after someone notices.
export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, "default")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  let orgId: string | null = null
  let role: string | null = null
  const bearer = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    const grant = await validateAccessToken(bearer)
    if (grant) {
      orgId = grant.orgId
      const m = await db.membership.findFirst({ where: { userId: grant.userId, orgId: grant.orgId } })
      role = m?.role ?? "VIEWER"
    }
  }
  if (!orgId) {
    const ctx = await getContext(req)
    if (ctx?.user) { orgId = ctx.orgId; role = ctx.role }
  }
  if (!orgId || !role) {
    await auditUnauthorized(req, "/api/v1/traces", { reason: "no valid session or bearer token" })
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required to read traces" },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(req) } }
    )
  }
  const allowed = requirePermission(role, "audit.export")
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "forbidden", message: "Your role does not permit reading traces" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const limit = limitParam(searchParams.get("limit"), 100, 500)
  const traceId = searchParams.get("traceId")

  let spans = recentSpans(limit)
  if (traceId) spans = spans.filter((s) => s.traceId === traceId)

  return NextResponse.json({
    apiVersion: "v1",
    tracing: tracingStatus(),
    count: spans.length,
    spans,
  })
}
