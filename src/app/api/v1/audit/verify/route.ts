import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, requirePermission } from "@/lib/auth"
import { validateAccessToken, bearerChallenge } from "@/lib/oauth"
import { auditUnauthorized, auditRequest } from "@/lib/audit-request"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import { verifyAuditChain, anchorHead } from "@/lib/observability/audit-chain"
import { fireAlert } from "@/lib/observability/alerts"

// GET  /api/v1/audit/verify?expectedHead=<hash>  — recompute the audit hash chain
// POST /api/v1/audit/verify                      — produce an anchor record
//
// Compliance evidence generation. Authenticated + `audit.export` + org-scoped:
// the chain covers the caller's OWN org only, so this cannot be used to probe
// another tenant's audit volume.
//
// The verification is itself an auditable event — an integrity check nobody can
// see the history of is weak evidence — so both verbs write an audit row.
async function authorize(req: NextRequest) {
  let orgId: string | null = null
  let role: string | null = null
  let actorId: string | null = null
  const bearer = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    const grant = await validateAccessToken(bearer)
    if (grant) {
      orgId = grant.orgId
      actorId = grant.userId
      const m = await db.membership.findFirst({ where: { userId: grant.userId, orgId: grant.orgId } })
      role = m?.role ?? "VIEWER"
    }
  }
  if (!orgId) {
    const ctx = await getContext(req)
    if (ctx?.user) { orgId = ctx.orgId; role = ctx.role; actorId = ctx.user.id }
  }
  if (!orgId || !role) {
    await auditUnauthorized(req, "/api/v1/audit/verify", { reason: "no valid session or bearer token" })
    return { error: NextResponse.json(
      { error: "unauthorized", message: "Authentication required to verify the audit chain" },
      { status: 401, headers: { "WWW-Authenticate": bearerChallenge(req) } }
    ) }
  }
  const allowed = requirePermission(role, "audit.export")
  if (!allowed.ok) {
    return { error: NextResponse.json(
      { error: "forbidden", message: "Your role does not permit audit verification" },
      { status: 403 }
    ) }
  }
  return { orgId, actorId: actorId ?? undefined }
}

export async function GET(req: NextRequest) {
  const rl = await enforceRateLimit(req, "scan") // recomputation is O(rows): throttle hard
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }
  const gate = await authorize(req)
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const expectedHead = searchParams.get("expectedHead") || undefined
  const fromRaw = searchParams.get("from")
  const toRaw = searchParams.get("to")
  // Reject unparseable dates rather than silently widening the scope to
  // "everything", which would make a narrow query quietly expensive.
  const from = fromRaw ? new Date(fromRaw) : undefined
  const to = toRaw ? new Date(toRaw) : undefined
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return NextResponse.json({ error: "invalid_date", message: "from/to must be ISO-8601" }, { status: 400 })
  }

  const result = await verifyAuditChain({ orgId: gate.orgId, from, to, expectedHead })

  await auditRequest(req, {
    action: "audit.chain_verified",
    target: "/api/v1/audit/verify",
    decision: result.ok ? "EXECUTED" : "BLOCKED",
    riskScore: result.ok ? 10 : 95, // a failed integrity check is a security event
    orgId: gate.orgId,
    actorId: gate.actorId,
    detail: { rowsVerified: result.rowsVerified, ok: result.ok, anchored: Boolean(expectedHead) },
  })

  // A divergent chain is the single highest-severity signal this system produces:
  // it means the compliance trail may no longer be trustworthy. Alert immediately.
  if (!result.ok) {
    void fireAlert({
      rule: "compliance.audit_chain_divergence",
      severity: "critical",
      title: "Audit chain verification FAILED",
      description: "Recomputed audit hash chain does not match the supplied anchor",
      dedupeKey: `audit_divergence:${gate.orgId}`,
      context: {
        orgId: gate.orgId,
        rowsVerified: result.rowsVerified,
        expected: result.anchorMismatch?.expected,
        actual: result.anchorMismatch?.actual,
      },
    })
  }

  return NextResponse.json({ apiVersion: "v1", ...result }, { status: result.ok ? 200 : 409 })
}

export async function POST(req: NextRequest) {
  const rl = await enforceRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }
  const gate = await authorize(req)
  if (gate.error) return gate.error

  const anchor = await anchorHead(gate.orgId)
  await auditRequest(req, {
    action: "audit.chain_anchored",
    target: "/api/v1/audit/verify",
    decision: "EXECUTED",
    riskScore: 15,
    orgId: gate.orgId,
    actorId: gate.actorId,
    detail: { rowsCovered: anchor.rowsCovered, headHash: anchor.headHash },
  })
  return NextResponse.json({ apiVersion: "v1", anchor })
}
