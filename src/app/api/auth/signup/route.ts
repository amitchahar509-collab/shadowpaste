import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, createSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { randomBytes } from "crypto";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { validateSignup } from "@/lib/auth-validate";

export async function POST(req: NextRequest) {
  // Account creation is unauthenticated and writes User + Org + Membership rows,
  // so it is a free way to bulk-write to the database. Its own bucket, counted
  // on every attempt: a signup succeeds by design, so success-only counting
  // would leave mass registration unthrottled. Keeping it separate from the
  // login bucket means a burst of registrations cannot exhaust the brute-force
  // budget protecting existing accounts.
  const rl = await enforceRateLimit(req, "signup");
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded: too many signup attempts, try again later", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  const body = await req.json().catch(() => ({}));
  // Validate BEFORE any database work: presence, email format, password length
  // and bounded input. Previously only presence was checked, so a garbage string
  // like `'; DROP TABLE users;--` (harmless to Prisma, but junk) and a
  // 1-character password both created real accounts.
  const v = validateSignup(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const { email, password, name, orgName } = v.value;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "email already registered" }, { status: 409 });

  const user = await db.user.create({ data: { email, name, passwordHash: hashPassword(password) } });
  // Create personal org + OWNER membership
  const slug = `${(name || email).toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20)}-${randomBytes(3).toString("hex")}`;
  const org = await db.organization.create({ data: { name: orgName || `${name || email}'s Workspace`, slug } });
  await db.membership.create({ data: { userId: user.id, orgId: org.id, role: "OWNER" } });

  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name }, org: { id: org.id, slug: org.slug, role: "OWNER" } });
  res.cookies.set(SESSION_COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: expiresAt, path: "/" });
  return res;
}
