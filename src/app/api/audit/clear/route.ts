import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getContext, requirePermission } from "@/lib/auth";
import { auditUnauthorized, auditRequest } from "@/lib/audit-request"

// POST /api/audit/clear — clear seeded/demo attack-test history.
//
// NOTE ON SCOPE: despite the route name this does NOT touch AuditLog. The
// compliance trail has no update or delete path anywhere in the codebase and
// stays append-only. This clears AttackTest rows only.
//
// It was authenticated but otherwise ungated, and `deleteMany({})` carries no
// filter — so ANY authenticated user, including a VIEWER with no management
// rights, could destroy the attack-test history for every tenant at once.
// Authentication alone is not authorization for a destructive operation.
//
// Now requires `agent.manage` (OWNER/ADMIN/DEVELOPER, not VIEWER) and records
// the deletion in the audit trail with the actor's identity.
//
// ACCEPTED LIMITATION, documented rather than silently ignored: the AttackTest
// model has no orgId column, so this cannot be org-scoped without a schema
// migration and backfill. The table holds shared attack-simulation results
// rather than tenant PII, so the exposure is destructive-only, not a
// confidentiality breach. Per-tenant scoping needs `orgId` added to the model —
// tracked as follow-up, deliberately not bundled into a security fix.
export async function POST(req: NextRequest) {
  const ctx = await getContext(req);
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/audit/clear"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) };

  const allowed = requirePermission(ctx.role, "agent.manage");
  if (!allowed.ok) {
    await auditRequest(req, {
      action: "attacktest.clear_denied", target: "/api/audit/clear",
      decision: "BLOCKED", riskScore: 60, orgId: ctx.orgId, actorId: ctx.user.id,
      detail: { reason: allowed.reason ?? "insufficient role", role: ctx.role },
    });
    return NextResponse.json({ error: "forbidden", message: "Your role does not permit clearing attack-test history" }, { status: 403 });
  }

  const { keepOnlyReal } = await req.json().catch(() => ({ keepOnlyReal: true }));
  if (keepOnlyReal) {
    // Remove pre-seeded AttackTest rows (those with result "blocked" and no defense from a real run)
    const before = await db.attackTest.count();
    await db.attackTest.deleteMany({ where: { defense: { contains: "Expected" } } });
    const after = await db.attackTest.count();
    return NextResponse.json({ ok: true, removed: before - after, remaining: after });
  }
  const total = await db.attackTest.count();
  await db.attackTest.deleteMany({});
  // A destructive operation must leave a trace naming who performed it.
  await auditRequest(req, {
    action: "attacktest.cleared", target: "/api/audit/clear",
    decision: "EXECUTED", riskScore: 45, orgId: ctx.orgId, actorId: ctx.user.id,
    detail: { removed: total, scope: "all attack-test rows" },
  });
  return NextResponse.json({ ok: true, removed: total, remaining: 0 });
}
