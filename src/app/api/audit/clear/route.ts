import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/audit/clear — clear seeded/demo attack-test history, keep only real tool calls
export async function POST(req: NextRequest) {
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
