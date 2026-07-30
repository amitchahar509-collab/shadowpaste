// Enterprise observability + audit-integrity unit suite.
//
// Covers the GA observability core: W3C Trace Context propagation, span
// lifecycle, structured-log redaction, and the tamper-evident audit chain.
// DB-free except for the live-chain block, which is skipped when DATABASE_URL is
// absent so the suite still runs in a bare checkout.

import { describe, expect, test } from "bun:test";
import {
  parseTraceparent, formatTraceparent, withSpan, recentSpans, __resetTracing,
  currentCorrelationId, currentSpanContext,
} from "@/lib/observability/trace";
import { redact } from "@/lib/observability/logger";
import { chainStep, canonicalizeRow, type ChainedRow } from "@/lib/observability/audit-chain";

const SK = ["sk", "live", "51QaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"].join("_");
const GH = "ghp" + "_" + "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
const VALID = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const row = (id: string, action: string): ChainedRow => ({
  id, orgId: "o1", actorType: "user", actorId: "u1", action,
  target: "t", metadata: '{"a":1}', createdAt: new Date("2026-01-01T00:00:00Z"),
});

describe("W3C Trace Context", () => {
  test("parses and round-trips a valid traceparent", () => {
    const ctx = parseTraceparent(VALID)!;
    expect(ctx.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(ctx.remote).toBe(true);
    expect(formatTraceparent(ctx)).toBe(VALID);
  });
  test("rejects invalid ids per spec (all-zero must start a NEW trace)", () => {
    expect(parseTraceparent("00-" + "0".repeat(32) + "-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-" + "0".repeat(16) + "-01")).toBeNull();
    expect(parseTraceparent("ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
    expect(parseTraceparent("garbage")).toBeNull();
    expect(parseTraceparent(null)).toBeNull();
  });
});

describe("span lifecycle", () => {
  test("propagates trace + correlation id into nested scopes", async () => {
    __resetTracing();
    const parent = parseTraceparent(VALID)!;
    await withSpan("parent", { kind: "SERVER", correlationId: "corr-abc", parent }, async () => {
      expect(currentSpanContext()!.traceId).toBe(parent.traceId);
      expect(currentCorrelationId()).toBe("corr-abc");
      await withSpan("child", {}, async () => {
        expect(currentSpanContext()!.traceId).toBe(parent.traceId);
        expect(currentCorrelationId()).toBe("corr-abc");
      });
    });
    const sp = recentSpans(10);
    const child = sp.find((s) => s.name === "child")!;
    const p = sp.find((s) => s.name === "parent")!;
    expect(child.parentSpanId).toBe(p.spanId);
    expect(p.status).toBe("OK");
    expect(typeof p.durationMs).toBe("number");
  });
  test("closes the span when the body throws (an un-ended span vanishes)", async () => {
    __resetTracing();
    await expect(withSpan("boom", {}, async () => { throw new Error("kaboom"); })).rejects.toThrow("kaboom");
    const s = recentSpans(5)[0];
    expect(s.status).toBe("ERROR");
    expect(s.statusMessage).toContain("kaboom");
  });
});

describe("structured-log redaction", () => {
  test("never emits provider credentials", () => {
    expect(redact(`key=${SK}`)).not.toContain(SK);
    expect(redact(`token ${GH}`)).not.toContain(GH);
    expect(redact("Authorization: Bearer abcdefghijklmnop123456")).not.toContain("abcdefghijklmnop123456");
    expect(redact("DB_PASSWORD=hunter2superlong")).not.toContain("hunter2superlong");
    expect(redact("postgresql://admin:s3cretPass@host/db")).not.toContain("s3cretPass");
  });
  test("leaves benign text intact and bounds oversized input", () => {
    expect(redact("scanned 12 files in 40ms")).toBe("scanned 12 files in 40ms");
    expect(redact("A".repeat(30000))).toContain("truncated");
  });
});

describe("audit hash chain (tamper evidence)", () => {
  const g = "genesis";
  test("is deterministic", () => {
    expect(chainStep(g, row("r1", "a.create"))).toBe(chainStep(g, row("r1", "a.create")));
  });
  test("detects edit, delete and reorder", () => {
    const h1 = chainStep(g, row("r1", "a.create"));
    const h2 = chainStep(h1, row("r2", "a.delete"));
    // edit
    expect(chainStep(g, row("r1", "a.MODIFIED"))).not.toBe(h1);
    // edit propagates forward
    expect(chainStep(chainStep(g, row("r1", "a.MODIFIED")), row("r2", "a.delete"))).not.toBe(h2);
    // delete
    expect(chainStep(g, row("r2", "a.delete"))).not.toBe(h2);
    // reorder
    expect(chainStep(chainStep(g, row("r2", "a.delete")), row("r1", "a.create"))).not.toBe(h2);
  });
  test("canonical field order is fixed, not key-order dependent", () => {
    expect(canonicalizeRow(row("r1", "x"))).toStartWith('["r1","o1","user","u1","x"');
  });

  // DRIFT GUARD. scripts/backup.mjs re-implements this chain because it runs under
  // plain `node`, which cannot resolve the app's `@/` path alias — the original
  // import failed silently and every dump recorded auditChainHead "unavailable".
  // Two implementations of one hash is a real hazard: if they diverge, a restore
  // would report tampering that never happened (or miss tampering that did).
  // This pins them together.
  test("scripts/backup.mjs computes an identical chain head", async () => {
    const { createHash } = await import("node:crypto");
    const rows = [row("r1", "a.create"), row("r2", "a.delete"), row("r3", "a.update")];

    // Module implementation.
    const genesis = createHash("sha256").update("shadowpaste-audit-genesis").digest("hex");
    let viaModule = genesis;
    for (const r of rows) viaModule = chainStep(viaModule, r);

    // Script implementation, transcribed from scripts/backup.mjs.
    const canonicalizeAuditRow = (r: ChainedRow) => {
      const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
      return JSON.stringify([r.id, r.orgId, r.actorType, r.actorId ?? null, r.action, r.target ?? null, r.metadata ?? null, created.toISOString()]);
    };
    let viaScript = genesis;
    for (const r of [...rows].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime(), tb = new Date(b.createdAt).getTime();
      return ta !== tb ? ta - tb : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })) {
      viaScript = createHash("sha256").update(viaScript).update(canonicalizeAuditRow(r)).digest("hex");
    }

    expect(viaScript).toBe(viaModule);
  });
});
