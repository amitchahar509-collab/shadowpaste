import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { storeSecret, listSecrets } from "@/lib/security/vault";
import { db } from "@/lib/db";
import { checkUsageLimit } from "@/lib/billing";
import { enforceRateLimit } from "@/lib/rate-limit";
import { auditUnauthorized } from "@/lib/audit-request"

// GET /api/vault — list vaulted secrets (masked only, never raw)
// Zero-trust: even the masked list + metadata (names, providers, fingerprints)
// is tenant-private, so this requires an authenticated session and is scoped to
// the caller's org.
export async function GET(req: NextRequest) {
  const ctx = await getContext(req);
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/vault"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) };
  const secrets = await listSecrets(ctx.orgId);
  return NextResponse.json({ secrets, count: secrets.length });
}

// POST /api/vault — store a new secret (encrypted at rest)
// Requires authentication — anonymous users cannot store secrets.
export async function POST(req: NextRequest) {
  // Rate limit: 20 vault ops per minute
  const rl = await enforceRateLimit(req, "vault");
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const ctx = await getContext(req);
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/vault"); return NextResponse.json({ error: "authentication required to store secrets" }, { status: 401 }); }

  let body: { raw?: string; name?: string; contextHint?: string; projectId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const { raw, name, contextHint, projectId } = body || {};
  if (!raw) return NextResponse.json({ error: "raw secret required" }, { status: 400 });

  // Billing enforcement: check vault secret limit
  const org = await db.organization.findUnique({ where: { id: ctx.orgId } });
  const limitCheck = await checkUsageLimit(ctx.orgId, "vaultSecrets", org?.plan || "FREE");
  if (!limitCheck.ok) {
    return NextResponse.json({ error: limitCheck.reason, limit: limitCheck.limit, current: limitCheck.current, upgrade: "/api/billing/plans" }, { status: 402 });
  }

  const stored = await storeSecret(raw, { name, contextHint, orgId: ctx.orgId, projectId });
  await db.auditLog.create({
    data: { orgId: ctx.orgId, actorType: "user", actorId: ctx.user.id, action: "vault.store", target: stored.id, metadata: JSON.stringify({ provider: stored.provider, scope: stored.scope }) },
  });
  return NextResponse.json({ ok: true, secret: { id: stored.id, name: stored.name, provider: stored.provider, scope: stored.scope, masked: stored.masked } });
}
