import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createSession, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }
  const { token, expiresAt } = await createSession(user.id);
  const membership = await db.membership.findFirst({ where: { userId: user.id }, include: { org: true } });
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name }, org: membership ? { id: membership.org.id, slug: membership.org.slug, role: membership.role } : null });
  res.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", expires: expiresAt, path: "/" });
  return res;
}
