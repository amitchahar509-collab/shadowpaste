// ShadowPaste V19 — Phase 11 War Test: Stolen/Revoked Token Attack
// Integration test — requires `bun run dev` on http://localhost:3000.
// If the server is unreachable, prints "SKIP: server not running" and exits 0.
//
// Run: bun run tests/attack-stolen-token.ts
//
// What it does:
//   1. Creates an active agent, confirms it CAN make tool calls (control)
//   2. Revokes the agent (PATCH /api/agents/[id] { status: "revoked" })
//   3. Attempts a tool call with the revoked agent — MUST be denied with "Agent is revoked"
//   4. Creates a second agent, suspends it, attempts call — MUST be denied with "Agent is suspended"
//   5. Creates a third agent, quarantines it, attempts call — MUST be denied with "Agent is quarantined"
//   6. Restores one agent to active, confirms calls succeed again (recovery check)
//
// Output: results-token.json + stdout summary.

import { authCookie, resetOwnAgents } from "./_auth";

const BASE = "http://localhost:3000";
// 10s was too tight and made this suite intermittently red. The FIRST POST to
// /api/mcp/call pays for Next dev route compilation plus a cold Prisma connect to
// a remote (Neon) database, which together exceeded the budget on a loaded
// machine. The symptom was the control check C0 reporting `status=0` — the fetch
// itself throwing — while T5, the identical "active agent calls a tool"
// operation, passed later in the same run once the route was warm.
//
// Observed across runs of IDENTICAL code: 4/6, 5/6, 6/6. Confirmed pre-existing
// by stashing unrelated edits and re-running.
const REQUEST_TIMEOUT_MS = 30_000;
// Transport failures only (status 0). A wrong DECISION is never retried — that
// would let a genuine authorization regression hide behind a retry.
const TRANSPORT_RETRIES = 3;
// Set once in main() — mutating endpoints require an authenticated session.
let SESSION = "";

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
): Promise<{ status: number; data: T; ok: boolean }> {
  let lastError = "";
  for (let attempt = 1; attempt <= TRANSPORT_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "content-type": "application/json", ...(SESSION ? { cookie: SESSION } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      // Any HTTP response — including 4xx/5xx — is a real answer from the
      // server and is returned as-is. Only a thrown fetch is retried.
      return { status: res.status, data, ok: res.ok };
    } catch (e) {
      lastError = (e as Error).message;
      if (attempt < TRANSPORT_RETRIES) {
        console.log(`  (transport failure on ${method} ${path}: ${lastError} — retry ${attempt}/${TRANSPORT_RETRIES - 1})`);
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return { status: 0, data: { error: lastError } as any, ok: false };
}

/**
 * Compile the routes this suite hits before any check is measured.
 *
 * Next dev compiles a route on first request, and the first DB-touching call
 * also pays for a cold Prisma connect. Paying that inside the control check made
 * C0 fail on timeout and reported it as "an active agent cannot call tools" — a
 * security-looking failure with an infrastructure cause. Results are discarded;
 * this only moves the cost outside the assertions.
 */
async function warmRoutes(): Promise<void> {
  await api("GET", "/api/agents");
  await api("POST", "/api/mcp/call", { agentId: "warmup-nonexistent", toolName: "fs.read", input: { path: "package.json" } });
}

async function createAgent(name: string, trustScore = 50): Promise<string | null> {
  const res = await api<{ agent: { id: string } }>("POST", "/api/agents", {
    name,
    provider: "Claude",
    description: "Auto-seeded by attack-stolen-token war test",
    trustScore,
    modelVersion: "stolen-token-test-v1",
    avatarColor: "#ef4444",
  });
  return res.data?.agent?.id || null;
}

async function setStatus(agentId: string, status: string) {
  return api<{ agent: { id: string; status: string } }>("PATCH", `/api/agents/${agentId}`, { status });
}

async function callTool(agentId: string, toolName = "fs.read", input: Record<string, unknown> = { path: "package.json" }) {
  return api("POST", "/api/mcp/call", { agentId, toolName, input });
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

  console.log("=== ShadowPaste V19 — Stolen/Revoked Token Attack ===\n");

  // Own identity/org per suite: a shared account is poisoned by
  // attack-billing-bypass, which deliberately fills its org to the FREE
  // plan's 3-agent limit. Per-suite labels keep plan budgets independent
  // while still signing up at most once per label per database.
  SESSION = await authCookie(BASE, "stolen-token");
  // Idempotency: clear any agents left in this org by a prior run, so the
  // FREE plan's 3-agent cap does not block this run's control agent.
  await resetOwnAgents(BASE, SESSION);

  // Pay route-compilation and cold-connect costs before anything is asserted.
  await warmRoutes();

  const runTag = Date.now().toString(36);
  const checks: CheckResult[] = [];

  // ---- CONTROL: active agent CAN call tools ----
  console.log("[C0] Creating an ACTIVE agent and confirming it CAN call fs.read...");
  const activeAgentId = await createAgent(`WarTest-Active-${runTag}`, 80);
  if (!activeAgentId) {
    console.error("❌ Could not create active agent — aborting");
    process.exit(1);
  }
  const controlCall = await callTool(activeAgentId);
  const controlDecision = (controlCall.data as any)?.decision;
  const controlAllowed = controlDecision === "allow_always" || controlDecision === "allow_once";
  checks.push({
    id: "C0",
    description: "Active agent can make tool calls (control)",
    passed: controlAllowed,
    detail: `decision=${controlDecision}, status=${controlCall.status}, reason=${(controlCall.data as any)?.reason || ""}`,
  });
  console.log(`  -> decision=${controlDecision} ${controlAllowed ? "PASS" : "FAIL"}\n`);

  // ---- T1: REVOKED agent is blocked ----
  console.log("[T1] Revoking the agent, then attempting a tool call — MUST be denied...");
  const revokeRes = await setStatus(activeAgentId, "revoked");
  const revokedStatus = revokeRes.data?.agent?.status;
  const revokeCall = await callTool(activeAgentId);
  const revokeData: any = revokeCall.data;
  const revokeBlocked = revokeData?.decision === "deny" && /revoked/i.test(revokeData?.reason || "");
  checks.push({
    id: "T1",
    description: "Revoked agent is denied with 'Agent is revoked' message",
    passed: revokeBlocked,
    detail: `agentStatus=${revokedStatus}, decision=${revokeData?.decision}, reason="${revokeData?.reason}"`,
  });
  console.log(`  -> decision=${revokeData?.decision}, reason="${revokeData?.reason}" ${revokeBlocked ? "PASS" : "FAIL"}\n`);

  // ---- T2: SUSPENDED agent is blocked ----
  console.log("[T2] Creating a second agent, suspending it, then attempting a tool call...");
  const suspendedAgentId = await createAgent(`WarTest-Suspended-${runTag}`, 60);
  if (!suspendedAgentId) {
    console.error("❌ Could not create suspended test agent — aborting");
    process.exit(1);
  }
  const suspendRes = await setStatus(suspendedAgentId, "suspended");
  const suspendedStatus = suspendRes.data?.agent?.status;
  const suspendCall = await callTool(suspendedAgentId);
  const suspendData: any = suspendCall.data;
  const suspendBlocked = suspendData?.decision === "deny" && /suspended/i.test(suspendData?.reason || "");
  checks.push({
    id: "T2",
    description: "Suspended agent is denied with 'Agent is suspended' message",
    passed: suspendBlocked,
    detail: `agentStatus=${suspendedStatus}, decision=${suspendData?.decision}, reason="${suspendData?.reason}"`,
  });
  console.log(`  -> decision=${suspendData?.decision}, reason="${suspendData?.reason}" ${suspendBlocked ? "PASS" : "FAIL"}\n`);

  // ---- T3: QUARANTINED agent is blocked ----
  console.log("[T3] Creating a third agent, quarantining it, then attempting a tool call...");
  const quarantinedAgentId = await createAgent(`WarTest-Quarantined-${runTag}`, 40);
  if (!quarantinedAgentId) {
    console.error("❌ Could not create quarantined test agent — aborting");
    process.exit(1);
  }
  const quarantineRes = await setStatus(quarantinedAgentId, "quarantined");
  const quarantinedStatus = quarantineRes.data?.agent?.status;
  const quarantineCall = await callTool(quarantinedAgentId);
  const quarantineData: any = quarantineCall.data;
  const quarantineBlocked = quarantineData?.decision === "deny" && /quarantined/i.test(quarantineData?.reason || "");
  checks.push({
    id: "T3",
    description: "Quarantined agent is denied with 'Agent is quarantined' message",
    passed: quarantineBlocked,
    detail: `agentStatus=${quarantinedStatus}, decision=${quarantineData?.decision}, reason="${quarantineData?.reason}"`,
  });
  console.log(`  -> decision=${quarantineData?.decision}, reason="${quarantineData?.reason}" ${quarantineBlocked ? "PASS" : "FAIL"}\n`);

  // ---- T4: REVOKED agent CANNOT bypass with a high-risk destructive tool ----
  console.log("[T4] Revoked agent attempts a destructive db.schema.drop — must STILL be blocked at agent layer...");
  const destructiveCall = await callTool(activeAgentId, "db.schema.drop", { table: "users" });
  const destructiveData: any = destructiveCall.data;
  // Must be denied with "revoked" reason — NOT the policy hard-deny reason
  const blockedAtAgentLayer = destructiveData?.decision === "deny" && /revoked/i.test(destructiveData?.reason || "");
  checks.push({
    id: "T4",
    description: "Revoked agent is blocked before policy even for destructive tools",
    passed: blockedAtAgentLayer,
    detail: `decision=${destructiveData?.decision}, reason="${destructiveData?.reason}"`,
  });
  console.log(`  -> decision=${destructiveData?.decision}, reason="${destructiveData?.reason}" ${blockedAtAgentLayer ? "PASS" : "FAIL"}\n`);

  // ---- T5: RECOVERY — restoring an agent to active allows calls again ----
  console.log("[T5] Restoring the suspended agent to 'active' and confirming calls succeed again...");
  const restoreRes = await setStatus(suspendedAgentId, "active");
  const restoredStatus = restoreRes.data?.agent?.status;
  const restoreCall = await callTool(suspendedAgentId);
  const restoreData: any = restoreCall.data;
  const restoreDecision = restoreData?.decision;
  const restoreAllowed = restoreDecision === "allow_always" || restoreDecision === "allow_once";
  checks.push({
    id: "T5",
    description: "Restored agent can make tool calls again",
    passed: restoredStatus === "active" && restoreAllowed,
    detail: `agentStatus=${restoredStatus}, decision=${restoreDecision}, reason="${restoreData?.reason}"`,
  });
  console.log(`  -> agentStatus=${restoredStatus}, decision=${restoreDecision} ${restoreAllowed ? "PASS" : "FAIL"}\n`);

  // ---- Summary ----
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;

  const result = {
    timestamp: new Date().toISOString(),
    agents: {
      active: activeAgentId,
      suspended: suspendedAgentId,
      quarantined: quarantinedAgentId,
    },
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      passRate: +(passed / checks.length).toFixed(4),
      overallPass: failed === 0,
    },
  };

  // ---- Print summary ----
  console.log("┌──────┬────────────────────────────────────────────────────────────┬──────┐");
  console.log("│ ID   │ Check                                                      │ Res  │");
  console.log("├──────┼────────────────────────────────────────────────────────────┼──────┤");
  for (const c of checks) {
    const desc = c.description.slice(0, 58).padEnd(58);
    const res = c.passed ? "PASS" : "FAIL";
    console.log(`│ ${c.id.padEnd(4)} │ ${desc} │ ${res.padEnd(4)} │`);
  }
  console.log("└──────┴────────────────────────────────────────────────────────────┴──────┘");
  console.log(`\n${passed}/${checks.length} checks passed`);

  if (failed > 0) {
    console.log("\nFailed checks:");
    for (const c of checks.filter((c) => !c.passed)) {
      console.log(`  ${c.id}: ${c.description}`);
      console.log(`     -> ${c.detail}`);
    }
  }

  const outPath = "tests/results-token.json";
  await Bun.write(outPath, JSON.stringify(result, null, 2));
  console.log(`\nResults written to ${outPath}`);

  if (failed > 0) {
    console.error(`\n❌ FAIL: ${failed} token-revocation check(s) failed`);
    process.exit(1);
  }
  console.log("\n✅ STOLEN-TOKEN DEFENSE HOLDS — revoked/suspended/quarantined agents are blocked");
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(2);
});
