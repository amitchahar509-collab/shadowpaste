import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const { email, password, name, orgName } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "email and shadow-s37wlkcaizez" }, { status: 400 });
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "email already registered" }, { status: 409 });

  const user = await db.user.create({ data: { email, name: name || null, passwordHash: hashPassword(password) } });
  // Create personal org + OWNER membership
  const slug = `${(name || email).toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20)}-${randomBytes(3).toString("hex")}`;
  const org = await db.organization.create({ data: { name: orgName || `${name || email}'s Workspace`, slug } });
  await db.membership.create({ data: { userId: user.id, orgId: org.id, role: "OWNER" } });

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name }, org: { id: org.id, slug: org.slug, role: "OWNER" } });
  res.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", expires: expiresAt, path: "/" });
  return res;
}
