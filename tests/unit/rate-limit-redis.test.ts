// Durable rate limiting — the Redis path (P0.2).
//
// WHY THIS FILE EXISTS
// --------------------
// Production enforces limits through Upstash. Verified live: 90 parallel calls
// to /api/mcp (preset max 60) returned exactly {"401":60,"429":30} — a sharp
// global count, not a per-instance one.
//
// But no test had ever executed that path. The local .env has no
// UPSTASH_REDIS_REST_URL, so every existing rate-limit test exercised the
// in-memory fallback instead. The code that actually runs on every production
// request was the code with no coverage — the same shape of gap as the
// write-only nonce ledger: a control nobody had checked, because the check
// silently took a different branch.
//
// REDIS_URL and REDIS_TOKEN are read at module load, so each case sets the
// environment and then imports a FRESH copy of the module. `fetch` is stubbed
// to stand in for Upstash's REST API; nothing here talks to a real Redis.

import { describe, expect, test, afterEach } from "bun:test";

const REDIS = "https://fake-upstash.example.com";
const realFetch = globalThis.fetch;

interface Captured {
  url: string;
  method?: string;
  auth?: string;
  body?: unknown;
}

/**
 * Load rate-limit.ts with Redis configured, and capture what it sends.
 * `respond` decides what Upstash "returns" for the pipeline call.
 */
async function loadWithRedis(respond: (captured: Captured) => Response | Promise<Response>) {
  process.env.UPSTASH_REDIS_REST_URL = REDIS;
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";

  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith(REDIS)) return realFetch(input as never, init);
    const c: Captured = {
      url,
      method: init?.method,
      auth: new Headers(init?.headers ?? {}).get("authorization") ?? undefined,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(c);
    return respond(c);
  }) as typeof fetch;

  const mod = await import(`@/lib/rate-limit?redis=${Math.random()}`);
  return { mod, calls };
}

/** Load with Redis explicitly absent, to exercise the fallback branch. */
async function loadWithoutRedis() {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  return import(`@/lib/rate-limit?noredis=${Math.random()}`);
}

const pipelineOk = (count: number) =>
  new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 });

const req = () => new Request("https://app.example.com/api/mcp", { method: "POST" });

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("the request Upstash actually receives", () => {
  test("INCR and EXPIRE are pipelined in one round trip, with the token", async () => {
    const { mod, calls } = await loadWithRedis(() => pipelineOk(1));
    await mod.enforceRateLimit(req(), "mcp");

    expect(calls.length).toBe(1); // one round trip, not two
    const c = calls[0];
    expect(c.url).toBe(`${REDIS}/pipeline`);
    expect(c.method).toBe("POST");
    expect(c.auth).toBe("Bearer fake-token");

    const body = c.body as string[][];
    expect(body[0][0]).toBe("INCR");
    expect(body[1][0]).toBe("EXPIRE");
    // mcp preset is a 60s window, so the key must expire with it — a missing
    // TTL would leave the counter permanent and lock the caller out forever.
    expect(body[1][2]).toBe("60");
    expect(body[0][1]).toBe(body[1][1]); // same key for both commands
  });

  test("the key is namespaced by preset and bucketed by window slot", async () => {
    const { mod, calls } = await loadWithRedis(() => pipelineOk(1));
    await mod.enforceRateLimit(req(), "mcp");
    await mod.enforceRateLimit(req(), "scan");

    const keyMcp = (calls[0].body as string[][])[0][1];
    const keyScan = (calls[1].body as string[][])[0][1];

    expect(keyMcp).toContain("sp:rl:mcp:");
    expect(keyScan).toContain("sp:rl:scan:");
    // Different presets must never share a counter, or a burst of scans would
    // consume the MCP budget.
    expect(keyMcp).not.toBe(keyScan);
    // The trailing slot is what rotates the key, so no cleanup job is needed.
    expect(keyMcp.split(":").pop()).toMatch(/^\d+$/);
  });
});

describe("the decision comes from Redis, not from local state", () => {
  test("under the limit is allowed, with remaining derived from the count", async () => {
    const { mod } = await loadWithRedis(() => pipelineOk(10));
    const r = await mod.enforceRateLimit(req(), "mcp"); // max 60
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(50);
  });

  test("exactly at the limit is still allowed", async () => {
    const { mod } = await loadWithRedis(() => pipelineOk(60));
    const r = await mod.enforceRateLimit(req(), "mcp");
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(0);
  });

  test("one over the limit is refused, with a retry hint", async () => {
    const { mod } = await loadWithRedis(() => pipelineOk(61));
    const r = await mod.enforceRateLimit(req(), "mcp");
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    expect(r.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  test("a caller far over the limit stays refused", async () => {
    const { mod } = await loadWithRedis(() => pipelineOk(5000));
    expect((await mod.enforceRateLimit(req(), "mcp")).ok).toBe(false);
  });

  test("the local bucket is NOT consulted while Redis is answering", async () => {
    // Redis says "over the limit" on the very first call. If the in-memory
    // bucket were authoritative the request would be allowed, because that
    // bucket is untouched and full.
    const { mod, calls } = await loadWithRedis(() => pipelineOk(999));
    const r = await mod.enforceRateLimit(req(), "mcp");
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(1);
  });
});

describe("failure handling — and what it costs", () => {
  test("an HTTP error falls back to the in-memory bucket rather than failing the request", async () => {
    const { mod } = await loadWithRedis(() => new Response("boom", { status: 500 }));
    const r = await mod.enforceRateLimit(req(), "mcp");
    // Deliberate fail-OPEN: a Redis outage degrades to per-instance limits
    // instead of rejecting traffic. Recorded here so the trade-off is visible
    // in the test suite and not only in a comment.
    expect(r.ok).toBe(true);
    expect(mod.rateLimitMode().redisFail).toBeGreaterThan(0);
  });

  test("a malformed pipeline response falls back too", async () => {
    const { mod } = await loadWithRedis(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    const r = await mod.enforceRateLimit(req(), "mcp");
    expect(r.ok).toBe(true);
    expect(mod.rateLimitMode().redisFail).toBeGreaterThan(0);
  });

  test("a thrown fetch falls back and is recorded", async () => {
    const { mod } = await loadWithRedis(() => {
      throw new Error("ECONNRESET");
    });
    const r = await mod.enforceRateLimit(req(), "mcp");
    expect(r.ok).toBe(true);
    expect(mod.rateLimitMode().redisFail).toBeGreaterThan(0);
  });

  test("auth rejection is reported distinctly — the usual cause is a pasted variable name", async () => {
    const { mod } = await loadWithRedis(() => new Response("unauthorized", { status: 401 }));
    await mod.enforceRateLimit(req(), "mcp");
    const probe = await mod.probeDurableBackend();
    expect(probe.ok).toBe(false);
    expect(probe.detail).toContain("401");
  });
});

describe("rateLimitMode reports the posture honestly", () => {
  test("configured and answering => durable", async () => {
    const { mod } = await loadWithRedis(() => pipelineOk(1));
    await mod.enforceRateLimit(req(), "mcp");
    const m = mod.rateLimitMode();
    expect(m.configured).toBe(true);
    expect(m.durable).toBe(true);
    expect(m.backend).toBe("upstash-redis");
    expect(m.redisOk).toBeGreaterThan(0);
  });

  test("configured but ALWAYS failing => degraded, not durable", async () => {
    // This is the dangerous state: limits have silently become per-instance
    // while every response is still a normal 200. It must not read as healthy.
    const { mod } = await loadWithRedis(() => new Response("nope", { status: 500 }));
    await mod.enforceRateLimit(req(), "mcp");
    const m = mod.rateLimitMode();
    expect(m.configured).toBe(true);
    expect(m.durable).toBe(false);
    expect(m.backend).toContain("FAILING");
    expect(m.note).toContain("DEGRADED");
  });

  test("not configured => in-memory, and says so", async () => {
    const mod = await loadWithoutRedis();
    const m = mod.rateLimitMode();
    expect(m.configured).toBe(false);
    expect(m.durable).toBe(false);
    expect(m.backend).toBe("in-memory");
    expect(m.note).toContain("per-instance");
  });
});

describe("diagnostics never publish configuration", () => {
  test("an error echoing the token does not survive into the report", async () => {
    // /api/health is public. An Upstash error that quotes the misconfigured
    // value would otherwise hand the token to anyone who curls it.
    const { mod } = await loadWithRedis(
      () => new Response('Failed to parse URL from UPSTASH_REDIS_REST_TOKEN="AXtSuperSecretValue123"', { status: 500 })
    );
    await mod.enforceRateLimit(req(), "mcp");
    const m = mod.rateLimitMode();
    const serialized = JSON.stringify(m);
    expect(serialized).not.toContain("AXtSuperSecretValue123");
  });
});
