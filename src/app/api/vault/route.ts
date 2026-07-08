import { NextRequest, NextResponse } from "next/server";
import { getContext, anonymousContext } from "@/lib/auth";
import { storeSecret, listSecrets } from "@/lib/security/vault";
import { db } from "@/lib/db";
import { checkUsageLimit } from "@/lib/billing";
import { checkRateLimit } from "@/lib/rate-limit";

// GET /api/vault — list vaulted secrets (masked only, never raw)
// Allows anonymous read for the public demo (default org), but real orgs require auth.
export async function GET(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext();
  const secrets = await listSecrets(ctx.orgId);
  return NextResponse.json({ secrets, count: secrets.length });
}

// POST /api/vault — store a new secret (encrypted at rest)
// Requires authentication — anonymous users cannot store secrets.
export async function POST(req: NextRequest) {
  // Rate limit: 20 vault ops per minute
  const rl = checkRateLimit(req, "vault");
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const ctx = await getContext(req);
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required to store secrets" }, { status: 401 });

  const { raw, name, contextHint, projectId } = await req.json();
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
