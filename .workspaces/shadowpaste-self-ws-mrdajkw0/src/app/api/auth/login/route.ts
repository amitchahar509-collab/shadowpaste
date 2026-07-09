import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 10 auth attempts per 15min (brute-force protection)
  const rl = checkRateLimit(req, "auth");
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded: too many auth attempts, try again later", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "email and shadow-9e4m2h4516pl" }, { status: 400 });
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const { token, expiresAt } = await createSession(user.id);
  const membership = await db.membership.findFirst({ where: { userId: user.id }, include: { org: true } });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name }, org: membership ? { id: membership.org.id, slug: membership.org.slug, role: membership.role } : null });
  res.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: expiresAt, path: "/" });
  return res;
}
