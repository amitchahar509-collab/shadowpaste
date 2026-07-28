// ShadowPaste V19 — Phase 11 War Test: Cross-Tenant Isolation Attack
// Integration test — requires `bun run dev` on http://localhost:3000.
// If the server is unreachable, prints "SKIP: server not running" and exits 0.
//
// Run: bun run tests/attack-tenant-isolation.ts
//
// What it does:
//   1. Signs up TWO users (each gets their own Organization via signup flow)
//      - userA@tenant1.test (Org A)
//      - userB@tenant2.test (Org B)
//   2. userA creates an agent + stores a vault secret in Org A
//   3. userB GETs /api/agents — must NOT see userA's agent
//   4. userB calls /api/mcp/call with userA's agentId — MUST get 403
//   5. userB GETs /api/vault — must NOT see userA's vault entries
//   6. userB creates an agent + vault secret in Org B; userA must NOT see them
//   7. Asserts isolation holds; reports per-check pass/fail
//
// Output: results-tenant.json + stdout summary.

const BASE = "http://localhost:3000";
const REQUEST_TIMEOUT_MS = 10_000;

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

async function main() {
  if (!(await checkServer())) {
    console.log("SKIP: server not running (start with `bun run dev` to run this test)");
    process.exit(0);
  }

  console.log("=== ShadowPaste V19 — Cross-Tenant Isolation Attack ===\n");

  // Use unique emails each run (signup enforces email uniqueness)
  const runTag = Date.now().toString(36);
  const userAEmail = `userA-${runTag}@tenant1.test`;
  const userBEmail = `userB-${runTag}@tenant2.test`;

  console.log(`Signing up user A: ${userAEmail}`);
  const userA = await signup(userAEmail, "WarTestA!Passw0rd", "User A", "Tenant One Workspace");
  if (!userA) {
    console.error("❌ Could not sign up user A — aborting");
    process.exit(1);
  }
  console.log(`  Org A: ${userA.org.id} (slug: ${userA.org.slug})`);

  console.log(`Signing up user B: ${userBEmail}`);
  const userB = await signup(userBEmail, "WarTestB!Passw0rd", "User B", "Tenant Two Workspace");
  if (!userB) {
    console.error("❌ Could not sign up user B — aborting");
    process.exit(1);
  }
  console.log(`  Org B: ${userB.org.id} (slug: ${userB.org.slug})\n`);

  if (userA.org.id === userB.org.id) {
    console.error("❌ FAIL: signup assigned both users to the same org — isolation impossible");
    process.exit(1);
  }

  const checks: CheckResult[] = [];

  // ---- Step 1: userA creates an agent in Org A ----
  console.log("[1] userA creates agent 'AgentA-Private' in Org A...");
  const agentACreate = await api<{ agent: { id: string; name: string } }>("POST", "/api/agents", userA.cookie, {
    name: `AgentA-Private-${runTag}`,
    provider: "Claude",
    description: "User A's private agent — should NOT be visible to user B",
    trustScore: 50,
    modelVersion: "tenant-test-v1",
  });
  const agentAId = agentACreate.data?.agent?.id;
  if (!agentAId) {
    checks.push({ id: "T1", description: "userA can create agent", passed: false, detail: `HTTP ${agentACreate.status}: ${JSON.stringify(agentACreate.data)}` });
  } else {
    checks.push({ id: "T1", description: "userA can create agent", passed: true, detail: `agentAId=${agentAId}` });
  }
  console.log(`  -> ${agentAId || "FAILED"}\n`);

  // ---- Step 2: userA stores a vault secret in Org A ----
  console.log("[2] userA stores vault secret 'sk_live_AAAA_tenant_a' in Org A...");
  const vaultAStore = await api("POST", "/api/vault", userA.cookie, {
    raw: `sk_live_tenantA_${runTag}_AAAAAAAAAAAAAAAA`,
    name: `TENANT_A_STRIPE_${runTag}`,
    contextHint: "stripe live key",
  });
  checks.push({
    id: "T2",
    description: "userA can store vault secret",
    passed: vaultAStore.ok,
    detail: `HTTP ${vaultAStore.status}`,
  });
  console.log(`  -> ${vaultAStore.ok ? "OK" : "FAIL"}\n`);

  // ---- Step 3: userB GETs /api/agents — must NOT see userA's agent ----
  console.log("[3] userB lists agents — must NOT see userA's agent...");
  const agentsB = await api<{ agents: Array<{ id: string; name: string }> }>("GET", "/api/agents", userB.cookie);
  const bSeesA = (agentsB.data?.agents || []).some((a) => a.id === agentAId);
  checks.push({
    id: "T3",
    description: "userB cannot see userA's agents",
    passed: !bSeesA,
    detail: bSeesA ? `LEAK: userB sees agentA ${agentAId}` : `userB sees ${agentsB.data?.agents?.length || 0} agents, none belonging to userA`,
  });
  console.log(`  -> ${!bSeesA ? "PASS (isolation holds)" : "FAIL (LEAK!)"}\n`);

  // ---- Step 4: userB attempts to call /api/mcp/call with userA's agentId — MUST get 403 ----
  console.log("[4] userB calls /api/mcp/call with userA's agentId — MUST get 403...");
  const crossCall = await api("POST", "/api/mcp/call", userB.cookie, {
    agentId: agentAId,
    toolName: "fs.read",
    input: { path: "package.json" },
  });
  checks.push({
    id: "T4",
    description: "userB cannot invoke tools via userA's agent (403)",
    passed: crossCall.status === 403,
    detail: `HTTP ${crossCall.status} — ${(crossCall.data as any)?.error || "no error msg"}`,
  });
  console.log(`  -> HTTP ${crossCall.status} ${crossCall.status === 403 ? "PASS" : "FAIL"}\n`);

  // ---- Step 5: userB GETs /api/vault — must NOT see userA's vault entries ----
  console.log("[5] userB lists vault — must NOT see userA's vault entries...");
  const vaultB = await api<{ secrets: Array<{ id: string; name: string; provider: string }>; count: number }>("GET", "/api/vault", userB.cookie);
  const bSeesAvault = (vaultB.data?.secrets || []).some((s) => s.name?.includes(runTag) && s.name?.includes("TENANT_A"));
  checks.push({
    id: "T5",
    description: "userB cannot see userA's vault secrets",
    passed: !bSeesAvault,
    detail: bSeesAvault ? "LEAK: userB sees userA's vault secret" : `userB vault has ${vaultB.data?.count || 0} entries, none from userA`,
  });
  console.log(`  -> ${!bSeesAvault ? "PASS (isolation holds)" : "FAIL (LEAK!)"}\n`);

  // ---- Step 6: userB creates their own agent + vault secret ----
  console.log("[6] userB creates agent 'AgentB-Private' in Org B...");
  const agentBCreate = await api<{ agent: { id: string; name: string } }>("POST", "/api/agents", userB.cookie, {
    name: `AgentB-Private-${runTag}`,
    provider: "OpenAI",
    description: "User B's private agent",
    trustScore: 50,
  });
  const agentBId = agentBCreate.data?.agent?.id;
  checks.push({
    id: "T6",
    description: "userB can create agent in their own org",
    passed: !!agentBId,
    detail: agentBId ? `agentBId=${agentBId}` : `HTTP ${agentBCreate.status}`,
  });
  console.log(`  -> ${agentBId || "FAILED"}\n`);

  // userB stores a vault secret in Org B
  console.log("[7] userB stores vault secret in Org B...");
  const vaultBStore = await api("POST", "/api/vault", userB.cookie, {
    raw: `ghp_BtenantB_${runTag}_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB`,
    name: `TENANT_B_GITHUB_${runTag}`,
    contextHint: "github token",
  });
  checks.push({
    id: "T7",
    description: "userB can store vault secret in their own org",
    passed: vaultBStore.ok,
    detail: `HTTP ${vaultBStore.status}`,
  });
  console.log(`  -> ${vaultBStore.ok ? "OK" : "FAIL"}\n`);

  // ---- Step 8: userA lists agents — must NOT see userB's agent ----
  console.log("[8] userA lists agents — must NOT see userB's agent...");
  const agentsA = await api<{ agents: Array<{ id: string; name: string }> }>("GET", "/api/agents", userA.cookie);
  const aSeesB = (agentsA.data?.agents || []).some((a) => a.id === agentBId);
  checks.push({
    id: "T8",
    description: "userA cannot see userB's agents",
    passed: !aSeesB,
    detail: aSeesB ? "LEAK: userA sees agentB" : `userA sees ${agentsA.data?.agents?.length || 0} agents, none belonging to userB`,
  });
  console.log(`  -> ${!aSeesB ? "PASS (isolation holds)" : "FAIL (LEAK!)"}\n`);

  // ---- Step 9: userA attempts to call /api/mcp/call with userB's agentId — MUST get 403 ----
  console.log("[9] userA calls /api/mcp/call with userB's agentId — MUST get 403...");
  const crossCall2 = await api("POST", "/api/mcp/call", userA.cookie, {
    agentId: agentBId,
    toolName: "fs.read",
    input: { path: "package.json" },
  });
  checks.push({
    id: "T9",
    description: "userA cannot invoke tools via userB's agent (403)",
    passed: crossCall2.status === 403,
    detail: `HTTP ${crossCall2.status} — ${(crossCall2.data as any)?.error || "no error msg"}`,
  });
  console.log(`  -> HTTP ${crossCall2.status} ${crossCall2.status === 403 ? "PASS" : "FAIL"}\n`);

  // ---- Step 10: userA GETs /api/vault — must NOT see userB's vault entries ----
  console.log("[10] userA lists vault — must NOT see userB's vault entries...");
  const vaultA = await api<{ secrets: Array<{ id: string; name: string }>; count: number }>("GET", "/api/vault", userA.cookie);
  const aSeesBvault = (vaultA.data?.secrets || []).some((s) => s.name?.includes(runTag) && s.name?.includes("TENANT_B"));
  checks.push({
    id: "T10",
    description: "userA cannot see userB's vault secrets",
    passed: !aSeesBvault,
    detail: aSeesBvault ? "LEAK: userA sees userB's vault secret" : `userA vault has ${vaultA.data?.count || 0} entries, none from userB`,
  });
  console.log(`  -> ${!aSeesBvault ? "PASS (isolation holds)" : "FAIL (LEAK!)"}\n`);

  // ---- Summary ----
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;

  const result = {
    timestamp: new Date().toISOString(),
    users: {
      A: { email: userAEmail, orgId: userA.org.id, orgSlug: userA.org.slug, agentId: agentAId },
      B: { email: userBEmail, orgId: userB.org.id, orgSlug: userB.org.slug, agentId: agentBId },
    },
    orgsAreDistinct: userA.org.id !== userB.org.id,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      passRate: +(passed / checks.length).toFixed(4),
      overallPass: failed === 0,
    },
  };

  // ---- Print summary table ----
  console.log("┌──────┬──────────────────────────────────────────────┬──────┐");
  console.log("│ ID   │ Check                                        │ Res  │");
  console.log("├──────┼──────────────────────────────────────────────┼──────┤");
  for (const c of checks) {
    const desc = c.description.slice(0, 44).padEnd(44);
    const res = c.passed ? "PASS" : "FAIL";
    console.log(`│ ${c.id.padEnd(4)} │ ${desc} │ ${res.padEnd(4)} │`);
  }
  console.log("└──────┴──────────────────────────────────────────────┴──────┘");
  console.log(`\n${passed}/${checks.length} checks passed`);

  if (failed > 0) {
    console.log("\nFailed checks:");
    for (const c of checks.filter((c) => !c.passed)) {
      console.log(`  ${c.id}: ${c.description}`);
      console.log(`     -> ${c.detail}`);
    }
  }

  const outPath = "tests/results-tenant.json";
  await Bun.write(outPath, JSON.stringify(result, null, 2));
  console.log(`\nResults written to ${outPath}`);

  if (failed > 0) {
    console.error(`\n❌ FAIL: ${failed} tenant-isolation check(s) failed — data leakage detected`);
    process.exit(1);
  }
  console.log("\n✅ TENANT ISOLATION HOLDS — no cross-tenant leakage detected");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
