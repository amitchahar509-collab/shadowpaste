import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getContext } from "@/lib/auth";

// POST /api/audit/clear — clear seeded/demo attack-test history, keep only real tool calls.
// Authenticated only: this deletes rows, and was previously anonymous.
export async function POST(req: NextRequest) {
  const ctx = await getContext(req);
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  const { keepOnlyReal } = await req.json().catch(() => ({ keepOnlyReal: true }));
  if (keepOnlyReal) {
    // Remove pre-seeded AttackTest rows (those with result "blocked" and no defense from a real run)
    const before = await db.attackTest.count();
    await db.attackTest.deleteMany({ where: { defense: { contains: "Expected" } } });
    const after = await db.attackTest.count();
    return NextResponse.json({ ok: true, removed: before - after, remaining: after });
  }
  await db.attackTest.deleteMany({});
  return NextResponse.json({ ok: true, removed: "all", remaining: 0 });
}
