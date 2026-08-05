// ShadowPaste — alerting engine.
//
// THE GAP THIS CLOSES
// -------------------
// /api/health and /api/metrics are PULL-only. Nothing woke a human when the rate
// limiter silently degraded to per-instance memory, when the audit chain diverged,
// or when an agent tripped an SSRF block. Every security control in this codebase
// was observable and none of it was noticeable.
//
// DESIGN CONSTRAINTS THAT SHAPED THIS
// -----------------------------------
// 1. An alerting system that can storm is worse than none. A tight loop tripping
//    SSRF 5,000 times must produce ONE page, not 5,000 — otherwise the first real
//    incident is buried and on-call learns to mute the channel. Deduplication and
//    cooldown are therefore in the core, not an optional feature.
//
// 2. Delivery must never break the request that triggered it. Notifications are
//    fire-and-forget with a timeout; a dead Slack webhook cannot 500 a tool call.
//
// 3. Alert payloads pass through the SAME redaction as logs. An alert body is
//    delivered to third-party SaaS — it is the LAST place a credential should
//    appear, and the most likely place for one to end up (it quotes the event
//    that fired).
//
// 4. Adapters are split by what can be verified HERE. The webhook adapter (and
//    Slack/Teams, which are webhook-shaped) performs real HTTP and is testable
//    against a local listener. Email requires an SMTP relay or provider account
//    that does not exist in this environment, so it is a documented interface
//    with an explicit unavailable status rather than a fake success.

import { createHmac, randomUUID } from "node:crypto";
import { redact, redactObject } from "./logger";
import { currentCorrelationId, currentSpanContext } from "./trace";

export type Severity = "info" | "warning" | "critical";

const SEVERITY_RANK: Record<Severity, number> = { info: 10, warning: 20, critical: 30 };

export interface AlertEvent {
  /** Stable rule identity, e.g. "security.ssrf_blocked". */
  rule: string;
  severity: Severity;
  title: string;
  description: string;
  /** Structured context. Redacted before delivery. */
  context?: Record<string, unknown>;
  /** Overrides the automatic dedupe key when a rule needs finer grouping. */
  dedupeKey?: string;
}

export interface Alert extends AlertEvent {
  id: string;
  firedAt: string;
  correlationId?: string;
  traceId?: string;
  /** How many occurrences this alert represents (dedupe window). */
  occurrences: number;
  /** Delivery outcome per adapter. */
  deliveries: Array<{ adapter: string; ok: boolean; detail: string; ms: number }>;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export interface AlertRule {
  id: string;
  severity: Severity;
  title: string;
  /** Human explanation shown in the notification body. */
  description: string;
  /** Minimum seconds between notifications for the same dedupe key. */
  cooldownSec: number;
  /** Fire only after N occurrences inside the cooldown window (default 1). */
  threshold?: number;
  enabled: boolean;
}

/**
 * Default policy. Every rule maps to a signal this codebase ACTUALLY emits —
 * verified against gateway escalation codes and audit actions, not invented.
 *
 * Cooldowns are deliberately long for high-frequency security signals: an
 * attacker controls how often they trip SSRF, and therefore controls page volume
 * unless the cooldown does.
 */
export const DEFAULT_RULES: AlertRule[] = [
  {
    id: "security.ssrf_blocked",
    severity: "warning",
    title: "SSRF attempt blocked",
    description: "A tool call targeted a private, loopback or cloud-metadata address, or a non-allowlisted host.",
    cooldownSec: 300,
    threshold: 3,
    enabled: true,
  },
  {
    id: "security.path_escape",
    severity: "critical",
    title: "Filesystem sandbox escape attempt",
    description: "Input attempted to traverse outside the workspace sandbox.",
    cooldownSec: 300,
    enabled: true,
  },
  {
    id: "security.forbidden_table",
    severity: "critical",
    title: "db.read attempted a forbidden table",
    description: "A query targeted credentials, identity or cross-tenant data and was blocked.",
    cooldownSec: 300,
    enabled: true,
  },
  {
    id: "security.secrets_in_output",
    severity: "warning",
    title: "Credentials found in tool output",
    description: "A tool result contained secrets; they were redacted before reaching the agent.",
    cooldownSec: 600,
    threshold: 5,
    enabled: true,
  },
  {
    id: "compliance.audit_chain_divergence",
    severity: "critical",
    title: "Audit chain verification FAILED",
    description: "The recomputed audit hash chain does not match the stored anchor — the trail may have been altered.",
    cooldownSec: 60, // near-immediate re-alert: this is the highest-severity signal
    enabled: true,
  },
  {
    id: "ops.rate_limiter_degraded",
    severity: "warning",
    title: "Rate limiter degraded to per-instance memory",
    description: "Redis is configured but unreachable; limits are no longer global and floods may pass.",
    cooldownSec: 900,
    enabled: true,
  },
  {
    id: "ops.health_degraded",
    severity: "critical",
    title: "Health check degraded",
    description: "One or more dependency checks are failing.",
    cooldownSec: 300,
    enabled: true,
  },
  {
    id: "security.capability_replay",
    severity: "critical",
    title: "Capability token rejected at consume",
    description:
      "A single-use credential token was presented twice, or the ledger refused the write. Under CAPABILITY_ENFORCE=true the call is denied; otherwise it proceeds and only this alert fires.",
    // Short cooldown: a replayed credential token is either an attack or a bug
    // in a flow that hands out secrets. Neither should wait five minutes.
    cooldownSec: 60,
    enabled: true,
  },
  {
    id: "security.auth_probe_burst",
    severity: "warning",
    title: "Unauthenticated probe burst",
    description: "A client is repeatedly hitting protected endpoints without credentials.",
    cooldownSec: 900,
    threshold: 10,
    enabled: true,
  },
];

const rules = new Map<string, AlertRule>(DEFAULT_RULES.map((r) => [r.id, r]));

export const getRules = (): AlertRule[] => [...rules.values()];
export function upsertRule(rule: AlertRule): void {
  rules.set(rule.id, rule);
}

// ---------------------------------------------------------------------------
// Notification adapters
// ---------------------------------------------------------------------------

export interface NotificationAdapter {
  name: string;
  /** False when the adapter has no configuration and must be skipped. */
  configured(): boolean;
  send(alert: Alert): Promise<{ ok: boolean; detail: string }>;
}

const DELIVERY_TIMEOUT_MS = 5000;

/** Generic signed webhook. Slack and Teams are webhook-shaped and reuse this. */
class WebhookAdapter implements NotificationAdapter {
  constructor(
    public readonly name: string,
    private readonly urlEnv: string,
    private readonly secretEnv?: string,
    private readonly shape: "generic" | "slack" | "teams" = "generic"
  ) {}

  configured(): boolean {
    return Boolean(process.env[this.urlEnv]);
  }

  private body(alert: Alert): string {
    const text = `[${alert.severity.toUpperCase()}] ${alert.title} — ${alert.description}` +
      (alert.occurrences > 1 ? ` (x${alert.occurrences})` : "");
    if (this.shape === "slack") return JSON.stringify({ text, attachments: [{ color: alert.severity === "critical" ? "danger" : "warning", text: JSON.stringify(alert.context ?? {}) }] });
    if (this.shape === "teams") {
      return JSON.stringify({
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        themeColor: alert.severity === "critical" ? "D00000" : "E8A317",
        summary: alert.title,
        title: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        text: alert.description,
        sections: [{ facts: Object.entries(alert.context ?? {}).map(([name, value]) => ({ name, value: String(value) })) }],
      });
    }
    return JSON.stringify(alert);
  }

  async send(alert: Alert): Promise<{ ok: boolean; detail: string }> {
    const url = process.env[this.urlEnv];
    if (!url) return { ok: false, detail: `${this.urlEnv} not set` };
    const payload = this.body(alert);
    const headers: Record<string, string> = { "content-type": "application/json" };

    // HMAC signing so the receiver can verify the payload originated here.
    // Without this a webhook endpoint accepts anything that knows the URL.
    const secret = this.secretEnv ? process.env[this.secretEnv] : undefined;
    if (secret) {
      const ts = Math.floor(Date.now() / 1000).toString();
      const sig = createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
      headers["x-shadowpaste-timestamp"] = ts;
      headers["x-shadowpaste-signature"] = `v1=${sig}`;
    }
    try {
      const res = await fetch(url, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS) });
      return { ok: res.ok, detail: `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message.slice(0, 120) };
    }
  }
}

/**
 * Email. NOT IMPLEMENTED as a live sender.
 *
 * Sending mail needs an SMTP relay or a provider account (SES/SendGrid/Postmark)
 * — neither exists in this environment, and there is no way to runtime-verify
 * delivery. Rather than ship a call that silently no-ops and reports success, this
 * adapter reports itself unconfigured and documents the integration point. To
 * enable: implement send() against your provider SDK and set ALERT_EMAIL_TO.
 */
class EmailAdapter implements NotificationAdapter {
  name = "email";
  configured(): boolean {
    return false; // honest: no transport exists
  }
  async send(): Promise<{ ok: boolean; detail: string }> {
    return {
      ok: false,
      detail: "email transport not implemented — requires an SMTP relay or provider account; see docs/OPERATIONS.md",
    };
  }
}

const adapters: NotificationAdapter[] = [
  new WebhookAdapter("webhook", "ALERT_WEBHOOK_URL", "ALERT_WEBHOOK_SECRET", "generic"),
  new WebhookAdapter("slack", "ALERT_SLACK_WEBHOOK_URL", undefined, "slack"),
  new WebhookAdapter("teams", "ALERT_TEAMS_WEBHOOK_URL", undefined, "teams"),
  new EmailAdapter(),
];

/** Test seam: swap adapters without touching env. */
export function __setAdapters(list: NotificationAdapter[]): void {
  adapters.length = 0;
  adapters.push(...list);
}

/** Verify a signature produced by the webhook adapter. Exported for receivers. */
export function verifyWebhookSignature(secret: string, timestamp: string, payload: string, signature: string): boolean {
  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
  if (expected.length !== signature.length) return false;
  // Constant-time compare: a length-safe early-exit comparison leaks the prefix.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Dedupe, escalation, history
// ---------------------------------------------------------------------------

interface DedupeState { count: number; firstSeen: number; lastNotified: number }
const dedupe = new Map<string, DedupeState>();
const MAX_DEDUPE_KEYS = 5000;

const history: Alert[] = [];
const MAX_HISTORY = 500;

let suppressed = 0;

/** Minimum severity actually delivered. */
const MIN_SEVERITY: Severity = (process.env.ALERT_MIN_SEVERITY as Severity) || "warning";

/**
 * Fire an alert.
 *
 * Returns the Alert when it was delivered, or null when suppressed by policy
 * (disabled rule, below threshold, inside cooldown, or below MIN_SEVERITY).
 * Never throws — an alerting failure must not become an application failure.
 */
export async function fireAlert(event: AlertEvent): Promise<Alert | null> {
  try {
    const rule = rules.get(event.rule);
    if (rule && !rule.enabled) return null;

    const severity = rule?.severity ?? event.severity;
    if (SEVERITY_RANK[severity] < SEVERITY_RANK[MIN_SEVERITY]) return null;

    const key = event.dedupeKey ?? event.rule;
    const now = Date.now();
    const cooldownMs = (rule?.cooldownSec ?? 300) * 1000;
    const threshold = rule?.threshold ?? 1;

    let state = dedupe.get(key);
    if (!state) {
      if (dedupe.size >= MAX_DEDUPE_KEYS) {
        const oldest = dedupe.keys().next().value;
        if (oldest) dedupe.delete(oldest);
      }
      state = { count: 0, firstSeen: now, lastNotified: 0 };
      dedupe.set(key, state);
    }
    state.count++;

    // Threshold: require N occurrences before the first page.
    if (state.count < threshold) { suppressed++; return null; }
    // Cooldown: one notification per window, however many occurrences.
    if (state.lastNotified && now - state.lastNotified < cooldownMs) { suppressed++; return null; }

    const occurrences = state.count;
    state.lastNotified = now;
    state.count = 0; // start a fresh count for the next window

    const span = currentSpanContext();
    const alert: Alert = {
      id: randomUUID(),
      rule: event.rule,
      severity,
      title: rule?.title ?? event.title,
      description: rule?.description ?? event.description,
      // Context is redacted: an alert body goes to third-party SaaS and quotes
      // the event that fired it, so it is the most likely place for a leak.
      //
      // Structural walk, NOT JSON.parse(redact(JSON.stringify(...))). That
      // round-trip threw on redacted values (the KEY=value pattern eats the
      // closing quote), and because fireAlert catches to protect the caller, the
      // alert was silently dropped — the one message that most needed sending.
      context: event.context ? redactObject(event.context) : undefined,
      firedAt: new Date(now).toISOString(),
      correlationId: currentCorrelationId() ?? undefined,
      traceId: span?.traceId,
      occurrences,
      deliveries: [],
    };

    for (const a of adapters) {
      if (!a.configured()) {
        alert.deliveries.push({ adapter: a.name, ok: false, detail: "not configured", ms: 0 });
        continue;
      }
      const t0 = Date.now();
      const res = await a.send(alert);
      alert.deliveries.push({ adapter: a.name, ok: res.ok, detail: res.detail, ms: Date.now() - t0 });
    }

    history.push(alert);
    while (history.length > MAX_HISTORY) history.shift();
    return alert;
  } catch {
    // Alerting must never break the caller.
    return null;
  }
}

/** Incident timeline, newest first. */
export function alertHistory(limit = 100): Alert[] {
  return history.slice(-Math.max(1, Math.min(limit, MAX_HISTORY))).reverse();
}

/** Engine posture for /api/health and the alert dashboard. */
export function alertingStatus() {
  const configured = adapters.filter((a) => a.configured()).map((a) => a.name);
  return {
    enabledRules: getRules().filter((r) => r.enabled).length,
    totalRules: rules.size,
    minSeverity: MIN_SEVERITY,
    adaptersConfigured: configured,
    adaptersAvailable: adapters.map((a) => a.name),
    // No adapter configured means alerts are recorded but nobody is notified —
    // exactly the "observable but not noticeable" state this module exists to
    // fix, so it must be visible rather than implied by an empty list.
    deliveryActive: configured.length > 0,
    alertsInHistory: history.length,
    suppressedByPolicy: suppressed,
  };
}

/** Test seam. */
export function __resetAlerts(): void {
  dedupe.clear();
  history.length = 0;
  suppressed = 0;
}
