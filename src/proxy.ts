// ShadowPaste V20 — Security headers proxy
// Adds security headers to all responses. Runs before route handlers.
//
// Uses Next.js 16's `proxy` file convention. The previous `middleware.ts` /
// `export function middleware` naming is deprecated and logged a warning on
// every boot; the behaviour and the `config.matcher` below are unchanged.

import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"
import { parseTraceparent, newTraceId, newSpanId, formatTraceparent } from "@/lib/observability/trace"

/**
 * Correlation identity for a request.
 *
 * Honours an inbound W3C `traceparent` so a trace started upstream continues
 * here, and an inbound `x-correlation-id`/`x-request-id` so an existing
 * operational id is preserved rather than replaced. Generates both when absent.
 *
 * Every response echoes them, which is what makes a user-reported error
 * traceable: the id they can see is the id in the logs, traces and audit rows.
 */
function correlationHeaders(req: NextRequest): Record<string, string> {
  const inbound = parseTraceparent(req.headers.get("traceparent"))
  const traceId = inbound?.traceId ?? newTraceId()
  const spanId = newSpanId()
  const correlationId =
    req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || traceId
  return {
    "x-correlation-id": correlationId,
    "x-trace-id": traceId,
    traceparent: formatTraceparent({ traceId, spanId, traceFlags: inbound?.traceFlags ?? 1, remote: false }),
  }
}

export async function proxy(req: NextRequest) {
  const corr = correlationHeaders(req)

  // Flood backstop for the whole API surface.
  //
  // Individual routes carry their own (much stricter) presets, but only 10 of
  // 50 routes had one — leaving /api/mcp, /api/audit-logs and /api/auth/signup
  // completely unthrottled. This guarantees a floor for every route, including
  // any added later, so "forgot to add a limiter" can no longer mean "no limit".
  // The threshold is deliberately high: it stops floods without shaping normal
  // traffic or pre-empting the per-route limits.
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const rl = await enforceRateLimit(req, "global")
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
        // Correlation headers on the 429 too: a throttled request is exactly the
        // one an operator needs to trace, and omitting them here would make the
        // rate-limit path the one blind spot.
        { status: 429, headers: { ...rateLimitHeaders(rl), ...corr } }
      )
    }
  }

  // Forward correlation identity to the route handler so downstream code and
  // audit rows key on the same ids the client sees.
  const forwarded = new Headers(req.headers)
  for (const [k, v] of Object.entries(corr)) forwarded.set(k, v)
  const res = NextResponse.next({ request: { headers: forwarded } })
  for (const [k, v] of Object.entries(corr)) res.headers.set(k, v)
  // API contract version on every response, so a client can detect the server
  // contract without a preflight call. See /api/v1/version for the policy.
  res.headers.set("X-API-Version", "v1")
  // Security headers
  res.headers.set("X-Content-Type-Options", "nosniff")
  res.headers.set("X-Frame-Options", "DENY")
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  res.headers.set("X-XSS-Protection", "1; mode=block")
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  // CSP — permissive enough for Next.js + inline styles, blocks external scripts
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://api.github.com https://api.stripe.com; frame-ancestors 'none';"
  )
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
}
