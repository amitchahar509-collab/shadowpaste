import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, requirePermission } from "@/lib/auth"
import { validateAccessToken, bearerChallenge } from "@/lib/oauth"
import { auditUnauthorized } from "@/lib/audit-request"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import { limitParam } from "@/lib/query-params"
import { alertHistory, alertingStatus, getRules } from "@/lib/observability/alerts"

// GET /api/v1/alerts — incident timeline, rule policy and engine posture.
//
// Authenticated + `audit.export` + rate limited, for the same reason
// /api/v1/traces is: alert bodies quote the security events that fired them —
// tool names, agent ids, risk scores, org ids. That is an operational map of the
// tenant, so it is gated at creation rather than after someone notices.
//
// `severity` and `rule` filters let an on-call page straight to what matters
// without pulling the whole timeline.
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
    await auditUnauthorized(req, "/api/v1/alerts", { reason: "no valid session or bearer token" })
    return NextResponse.json(
      { error: "unauthorized", message: "Authentication required to read alerts" },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(req) } }
    )
  }
  const allowed = requirePermission(role, "audit.export")
  if (!allowed.ok) {
    return NextResponse.json(
      { error: "forbidden", message: "Your role does not permit reading alerts" },
      { status: 403 }
    )
  }

  const { searchParams } = new URL(req.url)
  const limit = limitParam(searchParams.get("limit"), 100, 500)
  const severity = searchParams.get("severity")
  const rule = searchParams.get("rule")

  let alerts = alertHistory(limit)
  if (severity) alerts = alerts.filter((a) => a.severity === severity)
  if (rule) alerts = alerts.filter((a) => a.rule === rule)

  return NextResponse.json({
    apiVersion: "v1",
    engine: alertingStatus(),
    rules: getRules(),
    count: alerts.length,
    alerts,
  })
}
