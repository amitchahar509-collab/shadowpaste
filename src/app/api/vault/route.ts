import { NextRequest, NextResponse } from "next/server";
import { getContext, anonymousContext } from "@/lib/auth";
import { storeSecret, listSecrets } from "@/lib/security/vault";
import { db } from "@/lib/db";

// GET /api/vault — list vaulted secrets (masked only, never raw)
export async function GET(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext();
  const secrets = await listSecrets(ctx.orgId);
  return NextResponse.json({ secrets, count: secrets.length });
}

// POST /api/vault — store a new secret (encrypted at rest)
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext();
  const { raw, name, contextHint, projectId } = await req.json();
  if (!raw) return NextResponse.json({ error: "raw secret required" }, { status: 400 });
  const stored = await storeSecret(raw, { name, contextHint, orgId: ctx.orgId, projectId });
  // Audit log
  await db.auditLog.create({
    data: { orgId: ctx.orgId, actorType: ctx.user ? "user" : "system", actorId: ctx.user?.id, action: "vault.store", target: stored.id, metadata: JSON.stringify({ provider: stored.provider, scope: stored.scope }) },
  });
  return NextResponse.json({ ok: true, secret: { id: stored.id, name: stored.name, provider: stored.provider, scope: stored.scope, masked: stored.masked } });
}
