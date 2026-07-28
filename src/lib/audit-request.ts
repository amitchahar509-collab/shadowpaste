// ShadowPaste — request-level audit for events that never reach the gateway.
//
// The gateway audits every tool call, but a rejected request short-circuits long
// before that: an unauthenticated 401 probe or a parameter-validation failure
// returned nothing to the audit trail at all. Those are exactly the events a
// defender wants — credential stuffing, connector misconfiguration and fuzzing
// all show up as bursts of 401/400 with no other footprint.
//
// Every record carries `decision` and `riskScore`, matching the gateway's shape
// so both sources can be queried uniformly.

import { db } from "@/lib/db";
import { getClientIp } from "@/lib/rate-limit";

export type AuditDecision = "BLOCKED" | "QUARANTINED" | "EXECUTED";

export interface RequestAuditEvent {
  action: string;                 // e.g. "auth.denied", "params.invalid"
  target?: string;                // route or resource
  decision: AuditDecision;
  riskScore: number;
  orgId?: string;
  actorId?: string;
  detail?: Record<string, unknown>;
}

/**
 * Record a request-level security event. Never throws and never blocks the
 * response: an audit failure must not convert a clean 401 into a 500.
 */
export async function auditRequest(req: Request, ev: RequestAuditEvent): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        orgId: ev.orgId || "default",
        actorType: ev.actorId ? "user" : "anonymous",
        actorId: ev.actorId ?? null,
        action: ev.action,
        target: ev.target ?? new URL(req.url).pathname,
        metadata: JSON.stringify({
          decision: ev.decision,
          riskScore: ev.riskScore,
          method: req.method,
          // Client identity honours TRUST_PROXY; never trusts a raw XFF header.
          ip: getClientIp(req),
          userAgent: (req.headers.get("user-agent") || "").slice(0, 200),
          ...ev.detail,
        }),
      },
    });
  } catch (e) {
    // Audit is best-effort. Log locally so the failure itself is visible.
    console.error("[audit-request] failed to record event", ev.action, e);
  }
}

/** Unauthenticated access attempt on a protected route. */
export function auditUnauthorized(req: Request, target?: string, detail?: Record<string, unknown>) {
  return auditRequest(req, {
    action: "auth.denied",
    target,
    decision: "BLOCKED",
    // Probing a protected endpoint without credentials is a moderate signal on
    // its own; volume is what makes it interesting, so keep the per-event score
    // meaningful but not alarmist.
    riskScore: 60,
    detail,
  });
}

/** Malformed or missing parameters on an otherwise reachable route. */
export function auditInvalidParams(req: Request, reason: string, target?: string) {
  return auditRequest(req, {
    action: "params.invalid",
    target,
    decision: "BLOCKED",
    riskScore: 40,
    detail: { reason },
  });
}
