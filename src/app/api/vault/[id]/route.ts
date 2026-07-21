import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { deleteSecret } from "@/lib/security/vault";
import { db } from "@/lib/db";

// DELETE /api/vault/[id] — remove a vaulted secret.
// Authenticated + tenant-scoped: previously any caller could delete any org's
// secret by id (deleteSecret took no orgId).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authCtx = await getContext(req);
  if (!authCtx || !authCtx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  const deleted = await deleteSecret(id, authCtx.orgId);
  if (!deleted) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user.id, action: "vault.delete", target: id } });
  return NextResponse.json({ ok: true });
}
