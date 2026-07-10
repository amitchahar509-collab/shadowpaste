import { NextRequest, NextResponse } from "next/server";
import { getContext } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const ctx = await getContext(req);
  if (!ctx || !ctx.user) return NextResponse.json({ user: null, org: null });
  const membership = await db.membership.findFirst({ where: { userId: ctx.user.id }, include: { org: true } });
  return NextResponse.json({
    user: ctx.user,
    org: membership ? { id: membership.org.id, name: membership.org.name, slug: membership.org.slug, role: membership.role, plan: membership.org.plan } : null,
  });
}
