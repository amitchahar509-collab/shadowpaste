// ShadowPaste V19 — Phase 11 War Test: MCP Gateway Load Test
// Integration test — requires `bun run dev` on http://localhost:3000.
// If the server is unreachable, prints "SKIP: server not running" and exits 0.
//
// Run: bun run tests/load-mcp-calls.ts
//
// What it does:
//   1. Ensures 50 agents exist (seeds via POST /api/agents until count == 50)
//   2. Fires 100 MCP tool calls per agent (5000 total) in concurrent batches of 20
//   3. Tool mix: fs.read 60%, fs.write 20%, github.read 10%, db.read 8%, db.schema.drop 2%
//   4. Measures throughput, p50/p95/p99 latency, allow/deny rate, error rate
//
// Scaling note: to reach the full 100K target (1000 agents × 100 calls), bump
// AGENT_COUNT to 1000. Runtime scales roughly linearly; expect ~20 minutes.
//
// Output: results-mcp.json + stdout summary.

const BASE = "http://localhost:3000";
const AGENT_COUNT = 50;
const CALLS_PER_AGENT = 100;
const CONCURRENCY = 20;
const REQUEST_TIMEOUT_MS = 10_000;

// ---------- HTTP helpers ----------
async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/dashboard`, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string,
): Promise<{ status: number; data: T; ok: boolean; durationMs: number }> {
  const start = performance.now();
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data, ok: res.ok, durationMs: performance.now() - start };
  } catch (e) {
    return { status: 0, data: { error: (e as Error).message }, ok: false, durationMs: performance.now() - start };
  }
}

// ---------- Tool mix ----------
interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
}

function pickTool(): ToolCall {
  const r = Math.random();
  if (r < 0.60) return { toolName: "fs.read", input: { path: "package.json" } };
  if (r < 0.80) return { toolName: "fs.write", input: { path: `loadtest/${Math.floor(Math.random() * 1000)}.txt`, content: `load-test-${Date.now()}` } };
  if (r < 0.90) return { toolName: "github.read", input: { repo: "octocat/Hello-World", path: "README" } };
  if (r < 0.98) return { toolName: "db.read", input: { query: "SELECT name FROM sqlite_master WHERE type='table' LIMIT 5" } };
  return { toolName: "db.schema.drop", input: { table: "users" } }; // HARD_DENY — 2%
}

// ---------- Stats helpers ----------
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function ensureAgents(): Promise<string[]> {
  console.log(`Ensuring ${AGENT_COUNT} agents exist...`);
  const list = await api<{ agents: Array<{ id: string; name: string }> }>("GET", "/api/agents");
  let existing = list.data.agents || [];
  const needed = AGENT_COUNT - existing.length;
  if (needed > 0) {
    console.log(`  ${existing.length} found, seeding ${needed} more...`);
    for (let i = 0; i < needed; i++) {
      const res = await api<{ agent: { id: string } }>("POST", "/api/agents", {
        name: `LoadTestAgent-${existing.length + i}`,
        provider: ["Claude", "OpenAI", "Cursor", "Copilot", "Custom"][i % 5],
        description: `Load test agent #${existing.length + i} — auto-seeded by war test`,
        trustScore: 70,
        modelVersion: "load-test-v1",
        avatarColor: "#10b981",
      });
      if (res.data?.agent?.id) existing.push(res.data.agent);
    }
  } else {
    existing = existing.slice(0, AGENT_COUNT);
    console.log(`  ${existing.length} agents already present`);
  }
  return existing.map((a) => a.id);
}

// ---------- Main ----------
async function main() {
  if (!(await checkServer())) {
    console.log("SKIP: server not running (start with `bun run dev` to run this test)");
    process.exit(0);
  }

  console.log("=== ShadowPaste V19 — MCP Gateway Load Test ===");
  console.log(`Target: ${AGENT_COUNT} agents × ${CALLS_PER_AGENT} calls = ${AGENT_COUNT * CALLS_PER_AGENT} tool calls`);
  console.log(`Concurrency: ${CONCURRENCY} in-flight at a time\n`);

  const agentIds = await ensureAgents();
  if (agentIds.length === 0) {
    console.error("❌ FAIL: no agents available — aborting");
    process.exit(1);
  }

  // Build the full call list upfront
  type Job = { agentId: string; call: ToolCall; seq: number };
  const jobs: Job[] = [];
  let seq = 0;
  for (const agentId of agentIds) {
    for (let i = 0; i < CALLS_PER_AGENT; i++) {
      jobs.push({ agentId, call: pickTool(), seq: seq++ });
    }
  }
  // Shuffle for realistic interleaving
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }

  console.log(`Firing ${jobs.length} calls in batches of ${CONCURRENCY}...`);
  const t0 = performance.now();
  const latencies: number[] = [];
  const decisions: Record<string, number> = {};
  let allowCount = 0;
  let denyCount = 0;
  let askCount = 0;
  let sandboxCount = 0;
  let errorCount = 0;
  let executedCount = 0;
  let okCount = 0;
  let httpErrorCount = 0;
  const adapterCounts: Record<string, number> = {};

  // Process in concurrency-limited batches
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (job) => {
        const t = performance.now();
        const res = await api("POST", "/api/mcp/call", {
          agentId: job.agentId,
          toolName: job.call.toolName,
          input: job.call.input,
        });
        const latency = performance.now() - t;
        return { res, latency, job };
      }),
    );
    for (const { res, latency, job } of results) {
      latencies.push(latency);
      const data: any = res.data;
      if (!res.ok || res.status === 0) {
        httpErrorCount++;
        errorCount++;
        continue;
      }
      okCount++;
      const decision = (data?.decision as string) || "unknown";
      decisions[decision] = (decisions[decision] || 0) + 1;
      if (decision === "allow_always" || decision === "allow_once") allowCount++;
      else if (decision === "deny") denyCount++;
      else if (decision === "ask") askCount++;
      else if (decision === "sandbox") sandboxCount++;
      if (data?.executed) executedCount++;
      if (data?.adapter) adapterCounts[data.adapter] = (adapterCounts[data.adapter] || 0) + 1;
    }
    if (((i / CONCURRENCY) | 0) % 5 === 0) {
      const done = Math.min(i + CONCURRENCY, jobs.length);
      const pct = ((done / jobs.length) * 100).toFixed(1);
      const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\r  ${done}/${jobs.length} (${pct}%) — ${elapsed}s elapsed   `);
    }
  }
  const t1 = performance.now();
  console.log(""); // newline

  const totalMs = t1 - t0;
  const totalSec = totalMs / 1000;
  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = latencies[0] || 0;
  const max = latencies[latencies.length - 1] || 0;
  const throughput = jobs.length / totalSec;

  const result = {
    timestamp: new Date().toISOString(),
    target: { agents: AGENT_COUNT, callsPerAgent: CALLS_PER_AGENT, totalCalls: jobs.length, concurrency: CONCURRENCY },
    scalingNote: "To reach 100K calls (1000 agents × 100), bump AGENT_COUNT to 1000. Expect ~20 min runtime.",
    summary: {
      totalCalls: jobs.length,
      completed: okCount,
      httpErrors: httpErrorCount,
      errors: errorCount,
      executed: executedCount,
      allowCount,
      denyCount,
      askCount,
      sandboxCount,
      allowRate: +((allowCount / jobs.length) * 100).toFixed(2),
      denyRate: +((denyCount / jobs.length) * 100).toFixed(2),
      askRate: +((askCount / jobs.length) * 100).toFixed(2),
      sandboxRate: +((sandboxCount / jobs.length) * 100).toFixed(2),
      errorRate: +((errorCount / jobs.length) * 100).toFixed(2),
      executedRate: +((executedCount / jobs.length) * 100).toFixed(2),
    },
    performance: {
      totalDurationMs: Math.round(totalMs),
      totalDurationSec: +totalSec.toFixed(3),
      throughputCallsPerSec: +throughput.toFixed(2),
      latencyMs: { min: +min.toFixed(2), mean: +mean.toFixed(2), p50: +p50.toFixed(2), p95: +p95.toFixed(2), p99: +p99.toFixed(2), max: +max.toFixed(2) },
    },
    decisions,
    adapters: adapterCounts,
  };

  // ---- Print summary ----
  console.log("\n┌──────────────────────────────────────────────────────────┐");
  console.log("│ MCP GATEWAY LOAD TEST RESULTS                            │");
  console.log("├──────────────────────────────────────────────────────────┤");
  const row = (k: string, v: string) => console.log(`│ ${k.padEnd(38)} ${v.padStart(14)} │`);
  row("Total calls", jobs.length.toLocaleString());
  row("Completed (HTTP 2xx)", okCount.toLocaleString());
  row("HTTP errors", String(httpErrorCount));
  row("Allow", `${allowCount} (${result.summary.allowRate}%)`);
  row("Deny", `${denyCount} (${result.summary.denyRate}%)`);
  row("Ask", `${askCount} (${result.summary.askRate}%)`);
  row("Sandbox", `${sandboxCount} (${result.summary.sandboxRate}%)`);
  row("Executed (real)", `${executedCount} (${result.summary.executedRate}%)`);
  row("Throughput (calls/sec)", throughput.toFixed(2));
  row("Latency p50 (ms)", p50.toFixed(2));
  row("Latency p95 (ms)", p95.toFixed(2));
  row("Latency p99 (ms)", p99.toFixed(2));
  row("Latency mean (ms)", mean.toFixed(2));
  row("Latency max (ms)", max.toFixed(2));
  row("Total duration (sec)", totalSec.toFixed(2));
  console.log("└──────────────────────────────────────────────────────────┘");
  console.log("Decisions breakdown:", decisions);
  console.log("Adapters used:", adapterCounts);

  const outPath = "/home/z/my-project/tests/results-mcp.json";
  await Bun.write(outPath, JSON.stringify(result, null, 2));
  console.log(`\nResults written to ${outPath}`);

  // ---- Assertions ----
  const failures: string[] = [];
  if (errorCount / jobs.length > 0.05) failures.push(`error rate ${result.summary.errorRate}% > 5%`);
  if (allowCount + denyCount + askCount + sandboxCount < jobs.length * 0.9) {
    failures.push("too few decisions recorded (>10% missing)");
  }
  // db.schema.drop MUST be denied — verify it appears in deny count
  if (!decisions["deny"]) failures.push("expected at least one DENY (from db.schema.drop calls)");

  if (failures.length) {
    console.error("\n❌ FAIL: " + failures.join("; "));
    process.exit(1);
  }
  console.log("\n✅ LOAD TEST PASSED");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
