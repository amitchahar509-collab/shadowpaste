// Capability nonce ledger — pins the replay fix (P0.1).
//
// THE BUG
// -------
// The consumed-nonce ledger was a Set + Map on CapabilityEngine. The HMAC key
// is derived from master material and survives a restart; the ledger did not.
// Measured before the fix:
//
//   verify BEFORE consume : {"ok":true}
//   verify AFTER  consume : {"ok":false,"why":"nonce already consumed (replay)"}
//   verify on FRESH engine: {"ok":true}          <- protection gone
//
// On serverless "fresh engine" is every cold start, so replay protection reset
// continuously in production.
//
// WHAT THESE TESTS ACTUALLY PROVE
// -------------------------------
// A round-trip inside one engine instance proves nothing here — that already
// worked. Every test below constructs a SECOND engine with the same key, which
// is what a cold start looks like from the ledger's point of view.

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { CapabilityEngine, pruneExpiredNonces } from "@/lib/security/capability";
import { importHmacKey } from "@/lib/security/crypto";
import { db } from "@/lib/db";

// These tests hit a REAL database on purpose — the property under test is that
// the ledger outlives the process, which an in-memory fake cannot prove. So
// every assertion pays a round-trip to Postgres, and the first test also pays
// connection setup; 5s is not enough. This raises the patience, not the bar:
// the assertions are unchanged.
const DB_TIMEOUT = 30_000;

const SESSION = "sess_captest_" + Date.now().toString(36);
let key: CryptoKey;

/** A brand-new engine holding the same key — i.e. a cold start. */
const freshEngine = () => new CapabilityEngine(key);

beforeAll(async () => {
  key = await importHmacKey("capability-ledger-test-material");
});

afterAll(async () => {
  await db.capabilityNonce.deleteMany({ where: { sessionId: { startsWith: "sess_captest_" } } }).catch(() => {});
});

describe("replay protection survives a restart", () => {
  test("a consumed one-time token is rejected by a FRESH engine", async () => {
    const e1 = freshEngine();
    const token = await e1.mint({ secretId: "s1", sessionId: SESSION, scope: "github.repo" });

    expect((await e1.verify(token)).ok).toBe(true);
    expect((await e1.consume(token)).ok).toBe(true);
    expect((await e1.verify(token)).ok).toBe(false);

    // The whole point: a different process, same key, same token.
    const e2 = freshEngine();
    const after = await e2.verify(token);
    expect(after.ok).toBe(false);
    expect(after.why).toContain("replay");
  }, DB_TIMEOUT);

  test("consuming the same token twice fails on the SECOND engine", async () => {
    const e1 = freshEngine();
    const token = await e1.mint({ secretId: "s2", sessionId: SESSION, scope: "stripe.charges" });
    expect((await e1.consume(token)).ok).toBe(true);

    const e2 = freshEngine();
    const second = await e2.consume(token);
    expect(second.ok).toBe(false);
    expect(second.why).toContain("replay");
  }, DB_TIMEOUT);

  test("an unconsumed token still verifies on a fresh engine", async () => {
    // The fix must not invalidate legitimate tokens across a restart — that
    // would trade a security bug for an availability bug.
    const e1 = freshEngine();
    const token = await e1.mint({ secretId: "s3", sessionId: SESSION, scope: "db.read" });
    const e2 = freshEngine();
    expect((await e2.verify(token)).ok).toBe(true);
  }, DB_TIMEOUT);
});

describe("concurrent replays are resolved by the database, not by a read", () => {
  test("exactly one of N simultaneous consumes succeeds", async () => {
    const e = freshEngine();
    const token = await e.mint({ secretId: "s4", sessionId: SESSION, scope: "github.repo" });

    // A read-then-write check cannot decide this race; the unique constraint on
    // `nonce` can. Each attempt uses its own engine to rule out shared state.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => freshEngine().consume(token))
    );
    const ok = results.filter((r) => r.ok);
    expect(ok.length).toBe(1);
    for (const r of results.filter((x) => !x.ok)) expect(r.why).toContain("replay");
  }, DB_TIMEOUT);
});

describe("multi-use tokens", () => {
  test("usageLimit is enforced across engines, not per engine", async () => {
    const e1 = freshEngine();
    const token = await e1.mint({
      secretId: "s5",
      sessionId: SESSION,
      scope: "db.read",
      oneTime: false,
      usageLimit: 3,
    });

    expect((await freshEngine().consume(token)).ok).toBe(true);
    expect((await freshEngine().consume(token)).ok).toBe(true);
    expect((await freshEngine().consume(token)).ok).toBe(true);

    const fourth = await freshEngine().consume(token);
    expect(fourth.ok).toBe(false);
    expect(fourth.why).toContain("usage limit");
  }, DB_TIMEOUT);
});

describe("the ledger fails closed", () => {
  test("an expired token is rejected before the ledger is consulted", async () => {
    const e = freshEngine();
    const token = await e.mint({ secretId: "s6", sessionId: SESSION, scope: "db.read", ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 20));
    const v = await e.verify(token);
    expect(v.ok).toBe(false);
    expect(v.why).toContain("expired");
  }, DB_TIMEOUT);

  test("a tampered token is rejected regardless of ledger state", async () => {
    const e = freshEngine();
    const token = await e.mint({ secretId: "s7", sessionId: SESSION, scope: "db.read" });
    const forged = { ...token, scope: "github.admin" };
    const v = await e.verify(forged);
    expect(v.ok).toBe(false);
    expect(v.why).toContain("signature");
  }, DB_TIMEOUT);
});

describe("housekeeping", () => {
  test("expired rows are prunable and pruning does not touch live ones", async () => {
    const e = freshEngine();
    const expired = await e.mint({ secretId: "s8", sessionId: SESSION, scope: "db.read", ttlMs: 1 });
    const live = await e.mint({ secretId: "s9", sessionId: SESSION, scope: "db.read", ttlMs: 600_000 });
    await e.consume(expired);
    await e.consume(live);
    await new Promise((r) => setTimeout(r, 20));

    await pruneExpiredNonces();

    const expiredRow = await db.capabilityNonce.findUnique({ where: { nonce: expired.nonce } });
    const liveRow = await db.capabilityNonce.findUnique({ where: { nonce: live.nonce } });
    expect(expiredRow).toBeNull();
    expect(liveRow).not.toBeNull();
  }, DB_TIMEOUT);
});
