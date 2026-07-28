// ShadowPaste V20 — Phase 5+11 War Test: Health & Observability Endpoints
// Integration test — requires `bun run dev` on http://localhost:3000.
// If the server is unreachable, prints "SKIP: server not running" and exits 0.
//
// Run: bun run tests/test-health-metrics.ts
//
// What it does:
//   1. GET /api/health
//        - status must be "healthy" or "degraded"
//        - checks array must contain: database, vault, mcp, github-api
//        - each named check must have ok:true (degraded allowed only if github-api
//          is the only failing check — that's network, not app)
//        - NO "fake" or "placeholder" strings in the response
//   2. GET /api/metrics
//        - agents.total must be > 0 (DB seeded with demo agents)
//        - toolCalls.total must be > 0
//        - latency.p50 must be > 0 (real recorded durations exist)
//        - NO "fake" or "placeholder" strings anywhere in the response
//        - If the DB is empty, the test will document this as a finding.
//          (We pre-warm by creating one agent + one fs.read tool call before
//           checking metrics, to make the test deterministic.)
//
// Output: results-health.json + stdout summary.

const BASE = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 15_000;

// Readiness probe. A single 2s timeout produced false "server not running"
// skips: /api/dashboard issues many queries and measured 4-6s against a remote
// (Neon) database, and Next dev compiles the route on first hit. We retry with a
// realistic per-attempt budget so the suite EXECUTES instead of silently skipping.
async function checkServer(): Promise<boolean> {
  const ATTEMPTS = 10;
  const PER_ATTEMPT_MS = 15_000;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE}/api/dashboard`, { signal: AbortSignal.timeout(PER_ATTEMPT_MS) });
      if (res.ok || res.status < 500) return true;
    } catch { /* server still warming — retry below */ }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T; ok: boolean; raw: string }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data, ok: res.ok, raw: text };
  } catch (e) {
    return { status: 0, data: { error: (e as Error).message } as any, ok: false, raw: "" };
  }
}

interface CheckResult {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

const FAKE_PATTERNS = /\b(fake|placeholder|dummy|mock|todo|stub)\b/i;

function containsFakeText(obj: any): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  function walk(o: any, path: string) {
    if (o == null) return;
    if (typeof o === "string") {
      if (FAKE_PATTERNS.test(o)) matches.push(`${path}="${o.slice(0, 80)}"`);
      return;
    }
    if (Array.isArray(o)) { o.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (typeof o === "object") {
      for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k);
    }
  }
  walk(obj, "");
  return { found: matches.length > 0, matches };
}

async function main() {
  if (!(await checkServer())) {
    console.log("SKIP: server not running (start with `bun run dev` to run this test)");
    process.exit(0);
  }

  console.log("=== ShadowPaste V20 — Health & Observability Test ===\n");

  const checks: CheckResult[] = [];

  // ============================================================
  // PART 1 — GET /api/health
  // ============================================================
  console.log("[H1] GET /api/health — system health check...");
  const healthRes = await api<{
    status?: string;
    uptime?: number;
    totalLatencyMs?: number;
    checks?: Array<{ name: string; ok: boolean; latencyMs: number; detail?: string }>;
    version?: string;
    timestamp?: string;
  }>("GET", "/api/health");

  // H1: status is healthy or degraded
  const h1Status = healthRes.data?.status === "healthy" || healthRes.data?.status === "degraded";
  checks.push({
    id: "H1",
    description: "/api/health returns status 'healthy' or 'degraded'",
    passed: h1Status,
    detail: `status="${healthRes.data?.status}", httpStatus=${healthRes.status}`,
  });
  console.log(`  -> ${h1Status ? "PASS" : "FAIL"} (status=${healthRes.data?.status})\n`);

  // H2: checks array contains required named checks (database, vault, mcp, github-api)
  const requiredChecks = ["database", "vault", "mcp", "github-api"];
  const actualChecks = healthRes.data?.checks || [];
  const actualCheckNames = actualChecks.map((c) => c.name);
  const allRequired = requiredChecks.every((n) => actualCheckNames.includes(n));
  checks.push({
    id: "H2",
    description: "/api/health checks include database, vault, mcp, github-api",
    passed: allRequired,
    detail: `required=${JSON.stringify(requiredChecks)}; actual=${JSON.stringify(actualCheckNames)}`,
  });
  console.log(`  -> ${allRequired ? "PASS" : "FAIL"} (checks: ${actualCheckNames.join(", ")})\n`);

  // H3: each required check has ok:true (allow github-api to be degraded in sandboxed envs without network)
  const failingChecks = actualChecks.filter((c) => requiredChecks.includes(c.name) && !c.ok);
  const failingNonGithub = failingChecks.filter((c) => c.name !== "github-api");
  // Strict pass: all required checks ok. Soft pass (degraded acceptable): only github-api is failing.
  const h3Strict = failingChecks.length === 0;
  const h3Soft = failingNonGithub.length === 0;
  checks.push({
    id: "H3",
    description: "All required health checks ok:true (strict)",
    passed: h3Strict,
    detail: `failing checks: ${JSON.stringify(failingChecks.map((c) => ({ name: c.name, detail: c.detail })))}. ${h3Strict ? "All healthy." : h3Soft ? "Only github-api is degraded (network-only — acceptable)." : "App-level checks failing!"}`,
  });
  console.log(`  -> ${h3Strict ? "PASS" : (h3Soft ? "DEGRADED (github-api only)" : "FAIL")}\n`);

  // H4: no fake/placeholder strings in /api/health response
  const healthFake = containsFakeText(healthRes.data);
  checks.push({
    id: "H4",
    description: "/api/health response has no 'fake'/'placeholder'/'mock' strings",
    passed: !healthFake.found,
    detail: healthFake.found ? `matches: ${healthFake.matches.slice(0, 5).join("; ")}` : "clean",
  });
  console.log(`  -> ${!healthFake.found ? "PASS" : "FAIL"} (${healthFake.matches.length} fake-string matches)\n`);

  // ============================================================
  // PART 2 — Pre-warm metrics (create an agent + tool call)
  // This makes the metrics assertions deterministic even on a fresh DB.
  // ============================================================
  console.log("[M0] Pre-warming metrics: creating an agent + firing one fs.read tool call...");
  const runTag = Date.now().toString(36);
  const agentRes = await api<{ agent?: { id: string }; error?: string }>("POST", "/api/agents", {
    name: `HealthProbe-${runTag}`,
    provider: "Claude",
    description: "Metrics pre-warm probe (auto-created by test-health-metrics)",
    trustScore: 50,
  });
  const agentId = agentRes.data?.agent?.id;
  if (!agentId) {
    console.log(`  -> could not create probe agent: HTTP ${agentRes.status} ${agentRes.data?.error || ""} (continuing — metrics may report 0 for fresh DB)`);
  } else {
    console.log(`  -> probe agent created: ${agentId}`);
    // Fire one fs.read call so toolCalls.total > 0 and there is a recorded duration
    const callRes = await api("POST", "/api/mcp/call", {
      agentId,
      toolName: "fs.read",
      input: { path: "package.json" },
    });
    console.log(`  -> probe fs.read: status=${callRes.status}, decision=${(callRes.data as any)?.decision}\n`);
  }

  // ============================================================
  // PART 3 — GET /api/metrics
  // ============================================================
  console.log("[M1] GET /api/metrics — observability metrics...");
  const metricsRes = await api<{
    timestamp?: string;
    queryLatencyMs?: number;
    agents?: { total: number; active: number; quarantined: number; avgTrust: number };
    toolCalls?: { total: number; allowed: number; denied: number; sandboxed: number; blockRate: number };
    latency?: { p50: number; p95: number; p99: number; sampleSize: number };
    security?: Record<string, number>;
    catalog?: Record<string, number>;
    memory?: { rssMb: number; heapUsedMb: number };
  }>("GET", "/api/metrics");

  // M1: agents.total > 0
  const agentsTotal = metricsRes.data?.agents?.total;
  const m1Pass = typeof agentsTotal === "number" && agentsTotal > 0;
  checks.push({
    id: "M1",
    description: "/api/metrics agents.total > 0",
    passed: m1Pass,
    detail: `agents.total=${agentsTotal} (type: ${typeof agentsTotal})`,
  });
  console.log(`  -> ${m1Pass ? "PASS" : "FAIL"} (agents.total=${agentsTotal})\n`);

  // M2: toolCalls.total > 0
  const toolCallsTotal = metricsRes.data?.toolCalls?.total;
  const m2Pass = typeof toolCallsTotal === "number" && toolCallsTotal > 0;
  checks.push({
    id: "M2",
    description: "/api/metrics toolCalls.total > 0",
    passed: m2Pass,
    detail: `toolCalls.total=${toolCallsTotal} (type: ${typeof toolCallsTotal})`,
  });
  console.log(`  -> ${m2Pass ? "PASS" : "FAIL"} (toolCalls.total=${toolCallsTotal})\n`);

  // M3: latency.p50 > 0
  const p50 = metricsRes.data?.latency?.p50;
  const m3Pass = typeof p50 === "number" && p50 > 0;
  checks.push({
    id: "M3",
    description: "/api/metrics latency.p50 > 0 (real recorded durations)",
    passed: m3Pass,
    detail: `latency.p50=${p50}, p95=${metricsRes.data?.latency?.p95}, p99=${metricsRes.data?.latency?.p99}, sampleSize=${metricsRes.data?.latency?.sampleSize}`,
  });
  console.log(`  -> ${m3Pass ? "PASS" : "FAIL"} (p50=${p50}, sampleSize=${metricsRes.data?.latency?.sampleSize})\n`);

  // M4: no fake/placeholder strings in /api/metrics response
  const metricsFake = containsFakeText(metricsRes.data);
  checks.push({
    id: "M4",
    description: "/api/metrics response has no 'fake'/'placeholder'/'mock' strings",
    passed: !metricsFake.found,
    detail: metricsFake.found ? `matches: ${metricsFake.matches.slice(0, 5).join("; ")}` : "clean",
  });
  console.log(`  -> ${!metricsFake.found ? "PASS" : "FAIL"} (${metricsFake.matches.length} fake-string matches)\n`);

  // M5: metrics object is well-formed (has the expected top-level keys)
  const expectedKeys = ["agents", "toolCalls", "latency", "security", "catalog", "memory"];
  const actualKeys = Object.keys(metricsRes.data || {});
  const m5Pass = expectedKeys.every((k) => actualKeys.includes(k));
  checks.push({
    id: "M5",
    description: "/api/metrics has all expected top-level keys (agents, toolCalls, latency, security, catalog, memory)",
    passed: m5Pass,
    detail: `expected=${JSON.stringify(expectedKeys)}; actual=${JSON.stringify(actualKeys)}`,
  });
  console.log(`  -> ${m5Pass ? "PASS" : "FAIL"} (keys: ${actualKeys.join(", ")})\n`);

  // ============================================================
  // Summary
  // ============================================================
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;

  // H3 may be "degraded" if github-api is unreachable in sandbox — that's acceptable.
  // All other checks must pass.
  const hardFailChecks = checks.filter((c) => {
    if (c.passed) return false;
    if (c.id === "H3") {
      // Allow github-api-only degradation
      return failingNonGithub.length > 0;
    }
    return true;
  });

  const result = {
    timestamp: new Date().toISOString(),
    runTag,
    health: {
      httpStatus: healthRes.status,
      status: healthRes.data?.status,
      version: healthRes.data?.version,
      uptime: healthRes.data?.uptime,
      totalLatencyMs: healthRes.data?.totalLatencyMs,
      checks: healthRes.data?.checks,
      fakeStringMatches: healthFake.matches,
    },
    metrics: {
      httpStatus: metricsRes.status,
      queryLatencyMs: metricsRes.data?.queryLatencyMs,
      agents: metricsRes.data?.agents,
      toolCalls: metricsRes.data?.toolCalls,
      latency: metricsRes.data?.latency,
      security: metricsRes.data?.security,
      catalog: metricsRes.data?.catalog,
      memory: metricsRes.data?.memory,
      fakeStringMatches: metricsFake.matches,
    },
    preWarm: {
      probeAgentId: agentId || null,
    },
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      passRate: +(passed / checks.length).toFixed(4),
      overallPass: hardFailChecks.length === 0,
      hardFailCount: hardFailChecks.length,
      degradedGithubOnly: !checks.find((c) => c.id === "H3")?.passed && failingNonGithub.length === 0,
    },
  };

  printSummaryTable(checks);

  const outPath = "tests/results-health.json";
  await Bun.write(outPath, JSON.stringify(result, null, 2));
  console.log(`\nResults written to ${outPath}`);

  if (hardFailChecks.length > 0) {
    console.error(`\n❌ FAIL: ${hardFailChecks.length} observability check(s) failed`);
    process.exit(1);
  }
  if (failed > 0) {
    console.log("\n⚠️  Some soft checks reported DEGRADED (e.g. github-api unreachable in sandbox) — observability endpoints otherwise functional");
    process.exit(0);
  }
  console.log("\n✅ HEALTH + METRICS ENDPOINTS WORK — real numbers, no fake/placeholder strings");
  process.exit(0);
}

function printSummaryTable(checks: CheckResult[]) {
  console.log("\n┌──────┬────────────────────────────────────────────────────────────┬──────┐");
  console.log("│ ID   │ Check                                                      │ Res  │");
  console.log("├──────┼────────────────────────────────────────────────────────────┼──────┤");
  for (const c of checks) {
    const desc = c.description.slice(0, 58).padEnd(58);
    const res = c.passed ? "PASS" : "FAIL";
    console.log(`│ ${c.id.padEnd(4)} │ ${desc} │ ${res.padEnd(4)} │`);
  }
  console.log("└──────┴────────────────────────────────────────────────────────────┴──────┘");
  const passed = checks.filter((c) => c.passed).length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  for (const c of checks.filter((c) => !c.passed)) {
    console.log(`\n  ${c.id}: ${c.description}`);
    console.log(`     -> ${c.detail}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
