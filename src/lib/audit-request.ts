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

// ---------------------------------------------------------------------------
// Write-amplification guard
// ---------------------------------------------------------------------------
// Auditing rejected requests is valuable, but it made an unauthenticated caller
// able to drive unbounded INSERTs: every 401 wrote a row and the routes had no
// rate limit. Measured before this guard: 30 parallel anonymous GETs to
// /api/audit-logs produced 30 database writes. On a usage-billed Postgres that
// is both a denial-of-service and a direct cost-amplification attack.
//
// Fix: coalesce. Per (actor, action, target) we write at most ONE row per
// window and count the rest. The next row that IS written carries
// `suppressedCount`, so a burst of 10,000 probes becomes a handful of rows that
// each say how many attempts they represent — strictly MORE useful to a
// defender than 10,000 identical rows, at a bounded write cost.
//
// The counter is in-process. On serverless each instance keeps its own, so the
// real ceiling is (instances x 1 write per window) — still bounded, still a
// vast reduction, and it degrades safely.

const COALESCE_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 5_000;

interface Suppression {
  windowStart: number;
  suppressed: number;
}

const suppressions = new Map<string, Suppression>();

/**
 * Decide whether this event gets a database row.
 *
 * @returns the number of events suppressed since the last write (attach it to
 *          the row), or `null` if this event should be counted and dropped.
 */
function admit(key: string): number | null {
  const now = Date.now();
  const s = suppressions.get(key);

  if (!s) {
    if (suppressions.size >= MAX_TRACKED_KEYS) {
      // Map iterates in insertion order, so the first key is the oldest window.
      const oldest = suppressions.keys().next().value;
      if (oldest) suppressions.delete(oldest);
    }
    suppressions.set(key, { windowStart: now, suppressed: 0 });
    return 0; // first sighting — always worth a row
  }

  if (now - s.windowStart >= COALESCE_WINDOW_MS) {
    const carried = s.suppressed;
    s.windowStart = now;
    s.suppressed = 0;
    return carried; // window rolled — write, and report the burst size
  }

  s.suppressed += 1;
  return null; // inside the window — counted, not written
}

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
export async function auditRequest(
  req: Request,
  ev: RequestAuditEvent,
  opts: { coalesce?: boolean } = {}
): Promise<void> {
  try {
    const ip = getClientIp(req);
    const target = ev.target ?? new URL(req.url).pathname;

    // Unauthenticated / rejected events are coalesced so a probe flood cannot
    // amplify into unbounded writes. Authenticated gateway audits are not
    // coalesced — they are already bounded by rate limits and each one matters.
    let suppressedCount = 0;
    if (opts.coalesce) {
      const admitted = admit(`${ip}|${ev.action}|${target}`);
      if (admitted === null) return; // counted, intentionally not written
      suppressedCount = admitted;
    }

    await db.auditLog.create({
      data: {
        orgId: ev.orgId || "default",
        actorType: ev.actorId ? "user" : "anonymous",
        actorId: ev.actorId ?? null,
        action: ev.action,
        target,
        metadata: JSON.stringify({
          decision: ev.decision,
          // A burst is more dangerous than a single probe: reflect that in the
          // score rather than losing the signal to coalescing.
          riskScore: suppressedCount > 0 ? Math.min(95, ev.riskScore + 20) : ev.riskScore,
          method: req.method,
          // Client identity honours TRUST_PROXY; never trusts a raw XFF header.
          ip,
          userAgent: (req.headers.get("user-agent") || "").slice(0, 200),
          ...(suppressedCount > 0
            ? {
                suppressedCount,
                burst: true,
                note: `${suppressedCount} additional identical event(s) from this client were coalesced into this row within a ${COALESCE_WINDOW_MS / 1000}s window`,
              }
            : {}),
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
  }, { coalesce: true });
}

/** Malformed or missing parameters on an otherwise reachable route. */
export function auditInvalidParams(req: Request, reason: string, target?: string) {
  return auditRequest(req, {
    action: "params.invalid",
    target,
    decision: "BLOCKED",
    riskScore: 40,
    detail: { reason },
  }, { coalesce: true });
}
