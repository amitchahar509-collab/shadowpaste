// ShadowPaste V19 — Authentication & Multi-Tenant Context
// Session-token auth (cookie-based) + org resolution + RBAC enforcement.
// Uses bcrypt-style hashing via Node crypto (scrypt). No NextAuth dependency
// complexity — lightweight, self-contained, production-shaped.

import { db } from "@/lib/db";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { enforce as rbacEnforce, type Permission } from "@/lib/security/rbac";

const SESSION_COOKIE = "sp_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const PEPPER = process.env.AUTH_PEPPER || "shadowpaste-shadow-TTgEaBqhy5UE6C8O1d";

// ---- Password hashing (scrypt + pepper) ----
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password + PEPPER, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, derived] = parts;
  const test = scryptSync(password + PEPPER, salt, 64);
  const storedBuf = Buffer.from(derived, "hex");
  return test.length === storedBuf.length && timingSafeEqual(test, storedBuf);
}

// ---- Session tokens ----
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hmacToken(token: string): string {
  return createHmac("sha256", PEPPER).update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.userSession.create({
    data: { userId, token: hmacToken(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function getSession(token: string | undefined): Promise<{ user: { id: string; email: string; name: string | null }; membership: { orgId: string; role: string } } | null> {
  if (!token) return null;
  const row = await db.userSession.findUnique({
    where: { token: hmacToken(token) },
    include: { user: { include: { memberships: { take: 1 } } } },
  });
  if (!row || row.expiresAt < new Date()) return null;
  const m = row.user.memberships[0];
  if (!m) return { user: { id: row.user.id, email: row.user.email, name: row.user.name }, membership: { orgId: "default", role: "VIEWER" } };
  return { user: { id: row.user.id, email: row.user.email, name: row.user.name }, membership: { orgId: m.orgId, role: m.role } };
}

export async function destroySession(token: string): Promise<void> {
  try { await db.userSession.delete({ where: { token: hmacToken(token) } }); } catch { /* ignore */ }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// ---- Request helpers ----
export function getTokenFromRequest(req: Request): string | undefined {
  // Cookie header
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  if (match) return match[1];
  // eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWFIRgEdA1syI4nLTtJlh3 fallback (for API/MCP clients)
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.match(/^Bearer\s+(.+)$/);
  if (bearer) return bearer[1];
  return undefined;
}

export async function getContext(req: Request): Promise<{ user: { id: string; email: string; name: string | null } | null; orgId: string; role: string } | null> {
  const token = getTokenFromRequest(req);
  const session = await getSession(token);
  if (!session) return null;
  return { user: session.user, orgId: session.membership.orgId, role: session.membership.role };
}

// Anonymous fallback context (for the public demo + public scanner).
// In production, mutating routes would reject this.
export function anonymousContext(): { user: null; orgId: string; role: string } {
  return { user: null, orgId: "default", role: "DEVELOPER" };
}

// ---- RBAC enforcement for API routes ----
export function requirePermission(role: string, permission: Permission): { ok: boolean; reason?: string } {
  return rbacEnforce(role, permission);
}

// ---- Tenant isolation helper ----
// Every org-scoped query MUST filter by orgId. This helper makes it impossible
// to forget: pass the resolved orgId, get a where-clause fragment back.
export function tenantWhere(orgId: string): { orgId: string } {
  return { orgId };
}
