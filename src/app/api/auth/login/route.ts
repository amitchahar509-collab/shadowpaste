import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { enforceRateLimit, peekRateLimit } from "@/lib/rate-limit";
import { auditRequest } from "@/lib/audit-request"

export async function POST(req: NextRequest) {
  // Brute-force protection: 10 FAILED attempts per 15min.
  //
  // Peek here, consume only on a wrong password (below). Charging successful
  // logins achieved nothing defensively — an attacker guessing passwords
  // produces failures by definition — while it did lock out legitimate users
  // sharing an IP behind NAT or a corporate proxy.
  const rl = await peekRateLimit(req, "auth");
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded: too many auth attempts, try again later", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    {
      // Wrong credentials — THIS is what the brute-force budget exists for.
      await enforceRateLimit(req, "auth");
      await auditRequest(req, { action: "auth.login_failed", target: "/api/auth/login", decision: "BLOCKED", riskScore: 70, detail: { reason: "invalid credentials" } });
      return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
    }
  }
  const { token, expiresAt } = await createSession(user.id);
  const membership = await db.membership.findFirst({ where: { userId: user.id }, include: { org: true } });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name }, org: membership ? { id: membership.org.id, slug: membership.org.slug, role: membership.role } : null });
  res.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: expiresAt, path: "/" });
  return res;
}
