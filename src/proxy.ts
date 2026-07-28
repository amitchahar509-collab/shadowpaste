// ShadowPaste V20 — Security headers proxy
// Adds security headers to all responses. Runs before route handlers.
//
// Uses Next.js 16's `proxy` file convention. The previous `middleware.ts` /
// `export function middleware` naming is deprecated and logged a warning on
// every boot; the behaviour and the `config.matcher` below are unchanged.

import { NextRequest, NextResponse } from "next/server"

export function proxy(_req: NextRequest) {
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
