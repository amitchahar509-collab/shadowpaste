// Import budget — pins the throughput/limit mismatch fix.
//
// Extraction allowed 100 MB (uploads 200 MB), but a full import scans every file
// with 501 patterns, vaults secrets, writes fakes and copies the tree. Measured
// end to end: ~0.33 MB/s (1 MB 5.6s, 2 MB 6.6s, 4 MB 12.9s, 8 MB 22.7s), so
// 100 MB needed ~300s against a 60s vercel.json maxDuration.
//
// The old failure mode was the worst kind: request accepted, ran past the
// deadline, died as a gateway timeout with a half-written workspace. The budget
// now derives from the deadline so the same request fails immediately with a 413
// that says what the limit is and how to raise it.

import { describe, expect, test } from "bun:test";

async function withEnv<T>(env: Record<string, string | undefined>, fn: (m: typeof import("@/lib/import-budget")) => T) {
  const saved: Record<string, string | undefined> = {};
  const keys = ["VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "SHADOWPASTE_MAX_IMPORT_MB", "SHADOWPASTE_MAX_IMPORT_FILES", "SHADOWPASTE_IMPORT_DEADLINE_SEC"];
  for (const k of keys) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  const mod = await import(`../../src/lib/import-budget?cache=${Math.random()}`);
  try {
    return fn(mod as never);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe("import budget vs measured throughput", () => {
  test("a serverless budget fits inside the request deadline", async () => {
    await withEnv({ VERCEL: "1" }, (m) => {
      const seconds = m.IMPORT_MAX_BYTES / 1048576 / m.MEASURED_IMPORT_MB_PER_SEC;
      // Must finish well inside the 60s platform deadline, with room for upload
      // transfer, extraction, DB writes and cold start.
      expect(seconds).toBeLessThan(60);
      expect(seconds).toBeLessThanOrEqual(31);
      // …and must not be so small it rejects ordinary projects.
      expect(m.IMPORT_MAX_BYTES).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    });
  });

  test("the old 100 MB ceiling would NOT have fit — this is the bug being pinned", async () => {
    await withEnv({ VERCEL: "1" }, (m) => {
      const oldSeconds = 100 / m.MEASURED_IMPORT_MB_PER_SEC;
      expect(oldSeconds).toBeGreaterThan(60); // ~300s
      expect(m.IMPORT_MAX_BYTES).toBeLessThan(100 * 1024 * 1024);
    });
  });

  test("a longer platform deadline earns a proportionally larger budget", async () => {
    const small = await withEnv({ VERCEL: "1", SHADOWPASTE_IMPORT_DEADLINE_SEC: "60" }, (m) => m.IMPORT_MAX_BYTES);
    const large = await withEnv({ VERCEL: "1", SHADOWPASTE_IMPORT_DEADLINE_SEC: "300" }, (m) => m.IMPORT_MAX_BYTES);
    expect(large).toBeGreaterThan(small * 4);
  });

  test("self-hosting keeps the generous ceiling — no feature regression", async () => {
    await withEnv({}, (m) => {
      expect(m.IMPORT_MAX_BYTES).toBe(100 * 1024 * 1024);
    });
  });

  test("explicit override wins over every default", async () => {
    await withEnv({ VERCEL: "1", SHADOWPASTE_MAX_IMPORT_MB: "25" }, (m) => {
      expect(m.IMPORT_MAX_BYTES).toBe(25 * 1024 * 1024);
    });
    await withEnv({ VERCEL: "1", SHADOWPASTE_MAX_IMPORT_FILES: "77" }, (m) => {
      expect(m.IMPORT_MAX_FILES).toBe(77);
    });
  });

  test("a file-count ceiling exists — many tiny files blow the deadline on syscalls, not bytes", async () => {
    await withEnv({ VERCEL: "1" }, (m) => {
      expect(m.IMPORT_MAX_FILES).toBeGreaterThan(200);
      expect(m.IMPORT_MAX_FILES).toBeLessThanOrEqual(5000);
    });
  });

  test("the over-budget error tells the user the limit AND how to raise it", async () => {
    await withEnv({ VERCEL: "1" }, (m) => {
      for (const kind of ["size", "files"] as const) {
        const e = m.overBudgetError(kind);
        expect(e.error).toBeTruthy();
        expect(e.limit).toBeTruthy();
        expect(e.reason).toContain("60s");
        expect(e.hint).toContain("SHADOWPASTE_MAX_IMPORT_MB");
      }
    });
  });

  test("an over-sized body is caught by Content-Length BEFORE parsing", async () => {
    // req.formData() throws on a body larger than the runtime will buffer, and
    // that throw is indistinguishable from "not multipart" — a 12 MB upload was
    // measured returning 400 "expected a multipart/form-data upload", which is
    // wrong and unactionable. The route now checks Content-Length first.
    const src = await Bun.file("src/app/api/workspace/upload/route.ts").text();
    const guard = src.indexOf('req.headers.get("content-length")');
    // Compare against the ASSIGNMENT, not any mention of formData — the comment
    // above the guard names it too, and matching that made this test pass on
    // source order that did not exist.
    const parse = src.indexOf("form = await req.formData()");
    expect(guard).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(parse);
    expect(src).toContain('overBudgetError("size")');
  });

  test("archive limits are wired to the budget, not to their own constants", async () => {
    const { IMPORT_LIMITS } = await import("@/lib/archive");
    const budget = await import("@/lib/import-budget");
    expect(IMPORT_LIMITS.maxTotalBytes).toBe(budget.IMPORT_MAX_BYTES);
    expect(IMPORT_LIMITS.maxFiles).toBe(budget.IMPORT_MAX_FILES);
    expect(IMPORT_LIMITS.skipDirs?.has("node_modules")).toBe(true);
  });
});
