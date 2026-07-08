import { NextRequest, NextResponse } from "next/server";
import { getContext, anonymousContext } from "@/lib/auth";
import { deleteSecret } from "@/lib/security/vault";
import { db } from "@/lib/db";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const authCtx = await getContext(_req) || anonymousContext();
  await deleteSecret(id);
  await db.auditLog.create({ data: { orgId: authCtx.orgId, actorType: "user", actorId: authCtx.user?.id, action: "vault.delete", target: id } });
  return NextResponse.json({ ok: true });
}
