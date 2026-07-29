// ShadowPaste V20 — Security headers proxy
// Adds security headers to all responses. Runs before route handlers.
//
// Uses Next.js 16's `proxy` file convention. The previous `middleware.ts` /
// `export function middleware` naming is deprecated and logged a warning on
// every boot; the behaviour and the `config.matcher` below are unchanged.

import { NextRequest, NextResponse } from "next/server"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"

export async function proxy(req: NextRequest) {
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
        { status: 429, headers: rateLimitHeaders(rl) }
      )
    }
  }

  const res = NextResponse.next()
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
