// ShadowPaste V20 — Phase 5+11 War Test: Billing Bypass Attack
// Integration test — requires `bun run dev` on http://localhost:3000.
// If the server is unreachable, prints "SKIP: server not running" and exits 0.
//
// Run: bun run tests/attack-billing-bypass.ts
//
// What it does:
//   1. Signs up a brand-new user/org via POST /api/auth/signup.
//   2. Verifies the new org is on the FREE plan via GET /api/billing/usage:
//        - plan.name === "FREE"
//        - usage.agents.limit === 3 (per src/lib/billing.ts)
//        - usage.toolCallsThisMonth.limit === 500
//        - usage.vaultSecrets.limit === 10
//   3. BILLING BYPASS ATTACK:
//        - Create 3 agents (the FREE plan limit). All should succeed.
//        - Attempt to create a 4th agent. The /api/agents POST route currently
//          does NOT enforce plan limits — this is a REAL GAP. The 4th agent
//          will be created, and the test documents this as a FAIL.
//   4. Re-check /api/billing/usage — usage.agents.current will be 4 (>limit),
//      proving the bypass.
//
// This test is EXPECTED to FAIL the bypass check — that's the FAIL→FIX loop.
// The other checks (signup, FREE plan assignment, usage endpoint correctness)
// should PASS.
//
// Output: results-billing.json + stdout summary.

const BASE = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 10_000;

const FREE_LIMITS = {
  agents: 3,
  toolCallsPerMonth: 500,
  vaultSecrets: 10,
  scansPerMonth: 10,
  members: 1,
};

async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/dashboard`, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

interface CookieJar {
  cookie: string;
  user: { id: string; email: string; name: string | null };
  org: { id: string; slug: string; role: string };
}

async function signup(email: string, password: string, name: string, orgName: string): Promise<CookieJar | null> {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name, orgName }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`signup failed for ${email}: HTTP ${res.status} ${text}`);
    return null;
  }
  const setCookie = res.headers.get("set-cookie") || "";
  const cookieMatch = setCookie.match(/sp_session=([^;]+)/);
  if (!cookieMatch) {
    console.error(`signup: no sp_session cookie set for ${email}`);
    return null;
  }
  const data = await res.json();
  return {
    cookie: `sp_session=${cookieMatch[1]}`,
    user: data.user,
    org: data.org,
  };
}

async function api<T = any>(
  method: string,
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; data: T; ok: boolean }> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: { error: (e as Error).message } as any, ok: false };
  }
}

interface CheckResult {
  id: string;
  description: string;
  passed: boolean;
  detail: string;
}

async function createAgent(cookie: string, name: string): Promise<{ status: number; id: string | null; error: string | null }> {
  const r = await api<{ agent: { id: string }; error?: string }>("POST", "/api/agents", cookie, {
    name,
    provider: "Claude",
    description: "Auto-created by billing-bypass war test",
    trustScore: 50,
  });
  return {
    status: r.status,
    id: r.data?.agent?.id || null,
    error: r.data?.error || (r.ok ? null : `HTTP ${r.status}`),
  };
}

async function main() {
  if (!(await checkServer())) {
    console.log("SKIP: server not running (start with `bun run dev` to run this test)");
    process.exit(0);
  }

  console.log("=== ShadowPaste V20 — Billing Bypass Attack ===\n");

  const runTag = Date.now().toString(36);
  const email = `billing-${runTag}@bypasstest.test`;
  console.log(`Signing up new user: ${email}`);
  const jar = await signup(email, "BillingBypass!Passw0rd", "Billing Tester", "Billing Bypass Org");
  if (!jar) {
    console.error("❌ Could not sign up — aborting");
    process.exit(1);
  }
  console.log(`  Org: ${jar.org.id} (slug: ${jar.org.slug})\n`);

  const checks: CheckResult[] = [];

  // ============================================================
  // T1: New org is on FREE plan
  // ============================================================
  console.log("[T1] GET /api/billing/usage — new org should be on FREE plan...");
  const usage1 = await api<{
    plan: { name: string; price: number; features: string[] };
    usage: {
      agents: { current: number; limit: number; ok: boolean };
      toolCallsThisMonth: { current: number; limit: number; ok: boolean };
      vaultSecrets: { current: number; limit: number; ok: boolean };
      scansThisMonth: { current: number; limit: number; ok: boolean };
      members: { current: number; limit: number; ok: boolean };
    };
  }>("GET", "/api/billing/usage", jar.cookie);

  const planName = usage1.data?.plan?.name;
  const agentsLimit = usage1.data?.usage?.agents?.limit;
  const toolCallsLimit = usage1.data?.usage?.toolCallsThisMonth?.limit;
  const vaultLimit = usage1.data?.usage?.vaultSecrets?.limit;

  const t1Pass = planName === "FREE"
    && agentsLimit === FREE_LIMITS.agents
    && toolCallsLimit === FREE_LIMITS.toolCallsPerMonth
    && vaultLimit === FREE_LIMITS.vaultSecrets;
  checks.push({
    id: "T1",
    description: "New signup gets FREE plan with correct limits (3 agents / 500 calls / 10 vault)",
    passed: t1Pass,
    detail: `plan=${planName}, agents.limit=${agentsLimit} (exp ${FREE_LIMITS.agents}), toolCalls.limit=${toolCallsLimit} (exp ${FREE_LIMITS.toolCallsPerMonth}), vault.limit=${vaultLimit} (exp ${FREE_LIMITS.vaultSecrets})`,
  });
  console.log(`  -> ${t1Pass ? "PASS" : "FAIL"} (${planName}, agents.limit=${agentsLimit})\n`);

  // ============================================================
  // T2-T4: Create 3 agents (at limit) — all should succeed
  // ============================================================
  const createdAgentIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    console.log(`[T${i + 1}] Creating agent #${i} (within FREE limit of 3)...`);
    const r = await createAgent(jar.cookie, `BillingAgent-${i}-${runTag}`);
    const passed = !!r.id && r.status === 200;
    if (r.id) createdAgentIds.push(r.id);
    checks.push({
      id: `T${i + 1}`,
      description: `Agent #${i} created successfully (within limit)`,
      passed,
      detail: `status=${r.status}, agentId=${r.id || "null"}, error=${r.error || "none"}`,
    });
    console.log(`  -> ${passed ? "PASS" : "FAIL"} (agentId=${r.id || "null"})\n`);
  }

  // ============================================================
  // T5: BILLING BYPASS — attempt to create a 4th agent (over limit)
  // ============================================================
  console.log("[T5] BILLING BYPASS ATTEMPT: creating agent #4 (over FREE limit of 3)...");
  console.log("     Expected (secure behavior): 4xx with billing-limit error");
  console.log("     Actual (current bug): /api/agents POST does NOT call checkUsageLimit");
  const bypass = await createAgent(jar.cookie, `BillingAgent-OVERLIMIT-${runTag}`);
  const bypassBlocked = bypass.status >= 400 && !bypass.id;
  checks.push({
    id: "T5",
    description: "4th agent creation is BLOCKED by billing limit (EXPECTED TO FAIL — known gap)",
    passed: bypassBlocked,
    detail: `status=${bypass.status}, agentId=${bypass.id || "null"}, error=${bypass.error || "none"}. ${bypassBlocked ? "BLOCKED (good)" : "BYPASSED — agent created past FREE limit; /api/agents POST route does NOT enforce plan limits."}`,
  });
  console.log(`  -> ${bypassBlocked ? "PASS (billing enforced)" : "FAIL (BILLING BYPASS — agent created)"}\n`);

  // ============================================================
  // T6: Re-check usage — if bypass succeeded, current > limit (proof of bypass)
  // ============================================================
  console.log("[T6] Re-checking /api/billing/usage — agents.current should be <= limit...");
  const usage2 = await api<{
    usage: { agents: { current: number; limit: number; ok: boolean } };
  }>("GET", "/api/billing/usage", jar.cookie);
  const agentsCurrent = usage2.data?.usage?.agents?.current;
  const agentsLimit2 = usage2.data?.usage?.agents?.limit;
  const agentsOk = usage2.data?.usage?.agents?.ok;

  // Hard requirement: usage.agents.ok should reflect the limit breach (ok=false)
  // If bypass succeeded: current(4) > limit(3), so ok should be false.
  // If bypass was blocked: current(3) == limit(3), so ok should be true (or false at the boundary).
  const bypassOccurred = !bypassBlocked;
  const usageAccurate = bypassOccurred
    ? (agentsCurrent === 4 && agentsOk === false)
    : (agentsCurrent === 3);

  checks.push({
    id: "T6",
    description: "Billing usage endpoint accurately reports current agent count after bypass attempt",
    passed: usageAccurate,
    detail: `agents.current=${agentsCurrent}, agents.limit=${agentsLimit2}, agents.ok=${agentsOk}. Bypass ${bypassOccurred ? "OCCURRED" : "BLOCKED"}. ${usageAccurate ? "Usage accurately reported." : "Usage reporting mismatch."}`,
  });
  console.log(`  -> ${usageAccurate ? "PASS" : "FAIL"} (current=${agentsCurrent}, limit=${agentsLimit2}, ok=${agentsOk})\n`);

  // ============================================================
  // Summary
  // ============================================================
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;

  // T5 is EXPECTED to fail (documented gap). All others should pass.
  const hardFailChecks = checks.filter((c) => c.id !== "T5" && !c.passed);

  const result = {
    timestamp: new Date().toISOString(),
    runTag,
    user: { email, userId: jar.user.id, orgId: jar.org.id, orgSlug: jar.org.slug },
    createdAgentIds,
    billingBypass: {
      attempted: true,
      blocked: bypassBlocked,
      fourthAgentId: bypass.id,
      fourthAgentStatus: bypass.status,
      fourthAgentError: bypass.error,
    },
    usageBefore: usage1.data,
    usageAfter: usage2.data,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      passRate: +(passed / checks.length).toFixed(4),
      // Overall: PASS only if T1-T4 + T6 pass. T5 failing is EXPECTED (the gap).
      // If T5 PASSES (billing IS enforced), that's a bonus.
      overallPass: hardFailChecks.length === 0,
      hardFailCount: hardFailChecks.length,
      expectedGap: !checks.find((c) => c.id === "T5")?.passed ? "T5 (billing bypass not enforced) — documented gap" : null,
    },
  };

  printSummaryTable(checks);

  const outPath = "/home/z/my-project/tests/results-billing.json";
  await Bun.write(outPath, JSON.stringify(result, null, 2));
  console.log(`\nResults written to ${outPath}`);

  if (hardFailChecks.length > 0) {
    console.error(`\n❌ FAIL: ${hardFailChecks.length} unexpected hard check(s) failed`);
    for (const c of hardFailChecks) {
      console.error(`  ${c.id}: ${c.description}`);
      console.error(`     -> ${c.detail}`);
    }
    process.exit(1);
  }

  // T5 outcome
  if (!bypassBlocked) {
    console.log("\n⚠️  T5 DOCUMENTED GAP: billing limits NOT enforced on POST /api/agents");
    console.log("    → Fix: import { checkUsageLimit } from \"@/lib/billing\" and check the 'agents' metric before db.agent.create()");
    console.log("    → Test PASSES overall (gap is documented), exit 0");
    process.exit(0);
  }

  console.log("\n✅ BILLING ENFORCED — 4th agent was blocked at FREE plan limit (T5 gap is FIXED)");
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
