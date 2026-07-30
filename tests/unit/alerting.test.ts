// Alerting engine unit suite.
//
// The properties that matter operationally, not just "it sends something":
// storm suppression, threshold gating, redaction of bodies delivered to
// third-party SaaS, and failure isolation.

import { describe, expect, test, beforeEach } from "bun:test";
import {
  fireAlert, alertHistory, alertingStatus, __resetAlerts, __setAdapters,
  verifyWebhookSignature, upsertRule, getRules, type Alert, type NotificationAdapter,
} from "@/lib/observability/alerts";
import { createHmac } from "node:crypto";

const SK = ["sk", "live", "51QaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"].join("_");
let sent: Alert[] = [];
const capture: NotificationAdapter = {
  name: "capture",
  configured: () => true,
  send: async (a) => { sent.push(a); return { ok: true, detail: "HTTP 200" }; },
};

beforeEach(() => { __resetAlerts(); sent = []; __setAdapters([capture]); });

describe("storm suppression", () => {
  // An alerting system that can storm is worse than none: on-call mutes the
  // channel and the next real incident is invisible.
  test("5000 occurrences produce ONE notification", async () => {
    for (let i = 0; i < 5000; i++) {
      await fireAlert({ rule: "security.ssrf_blocked", severity: "critical", title: "t", description: "d", dedupeKey: "ssrf:agentX" });
    }
    expect(sent).toHaveLength(1);
    expect(sent[0].occurrences).toBeGreaterThanOrEqual(3);
    expect(alertingStatus().suppressedByPolicy).toBeGreaterThan(4000);
  });
  test("distinct dedupe keys page independently", async () => {
    await fireAlert({ rule: "security.path_escape", severity: "critical", title: "t", description: "d", dedupeKey: "a1" });
    await fireAlert({ rule: "security.path_escape", severity: "critical", title: "t", description: "d", dedupeKey: "a2" });
    expect(sent).toHaveLength(2);
  });
});

describe("threshold gating", () => {
  test("holds until the rule threshold is reached", async () => {
    const fire = () => fireAlert({ rule: "security.ssrf_blocked", severity: "critical", title: "t", description: "d", dedupeKey: "k" });
    await fire();
    expect(sent).toHaveLength(0); // 1 of 3
    await fire(); await fire();
    expect(sent).toHaveLength(1); // threshold met
  });
});

describe("redaction of delivered payloads", () => {
  // An alert body goes to third-party SaaS and quotes the event that fired it,
  // so it is the most likely place for a credential to escape.
  test("never delivers credentials in context", async () => {
    await fireAlert({
      rule: "security.path_escape", severity: "critical", title: "t", description: "d", dedupeKey: "red",
      context: { query: `token=${SK}`, note: "DB_PASSWORD=hunter2superlong" },
    });
    expect(sent).toHaveLength(1);
    const body = JSON.stringify(sent[0]);
    expect(body).not.toContain(SK);
    expect(body).not.toContain("hunter2superlong");
  });
  // Regression: redaction used to run as JSON.parse(redact(JSON.stringify(ctx))).
  // The KEY=value pattern ate the closing quote, JSON.parse threw, fireAlert
  // caught it to protect the caller, and the alert was SILENTLY DROPPED — the
  // one message that most needed to be sent.
  test("a credential-bearing alert is still delivered, not dropped", async () => {
    await fireAlert({
      rule: "security.path_escape", severity: "critical", title: "t", description: "d", dedupeKey: "drop",
      context: { note: "DB_PASSWORD=hunter2superlong" },
    });
    expect(sent).toHaveLength(1);
  });
});

describe("failure isolation and policy", () => {
  test("a throwing adapter never propagates to the caller", async () => {
    __setAdapters([{ name: "boom", configured: () => true, send: async () => { throw new Error("adapter exploded"); } }]);
    await expect(
      fireAlert({ rule: "security.path_escape", severity: "critical", title: "t", description: "d", dedupeKey: "boom" })
    ).resolves.toBeDefined();
  });
  test("a disabled rule never delivers", async () => {
    const rule = getRules().find((r) => r.id === "security.path_escape")!;
    upsertRule({ ...rule, enabled: false });
    await fireAlert({ rule: "security.path_escape", severity: "critical", title: "t", description: "d", dedupeKey: "off" });
    expect(sent).toHaveLength(0);
    upsertRule({ ...rule, enabled: true });
  });
});

describe("webhook signature", () => {
  const secret = "s3cret", ts = "1700000000", payload = '{"a":1}';
  const sig = "v1=" + createHmac("sha256", secret).update(`${ts}.${payload}`).digest("hex");
  test("accepts a valid signature", () => {
    expect(verifyWebhookSignature(secret, ts, payload, sig)).toBe(true);
  });
  test("rejects tampering, wrong secret and length mismatch", () => {
    expect(verifyWebhookSignature(secret, ts, '{"a":2}', sig)).toBe(false);
    expect(verifyWebhookSignature("other", ts, payload, sig)).toBe(false);
    expect(verifyWebhookSignature(secret, ts, payload, "v1=short")).toBe(false);
  });
});

describe("incident timeline", () => {
  test("records id, timestamp and per-adapter delivery outcome", async () => {
    await fireAlert({ rule: "compliance.audit_chain_divergence", severity: "critical", title: "t", description: "d", dedupeKey: "tl" });
    const h = alertHistory(10);
    expect(h).toHaveLength(1);
    expect(h[0].rule).toBe("compliance.audit_chain_divergence");
    expect(h[0].id).toBeTruthy();
    expect(h[0].firedAt).toBeTruthy();
    expect(h[0].deliveries.length).toBeGreaterThan(0);
  });
});
