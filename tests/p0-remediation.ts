// P0 remediation regression suite.
//
// Each check below corresponds to a defect that was confirmed exploitable by
// execution, not by reading code. They are pinned here so a refactor cannot
// quietly reopen them.
//
//   P0-1  fs.read returned plaintext credentials to the agent AND wrote them
//         raw into the audit table. Proof before the fix:
//           agent-visible output contains RAW secret : YES
//           DB audit copy   contains RAW secret      : YES
//   FIX-5 stripe.customer.delete was documented as a hard block but resolved to
//         ASK, so one approval click destroyed a billing record.
//   P0-5  MCP_PACKAGES shipped invented adoption metrics (installs: 18420,
//         verified: true) and three bundles with no backing tools.
//   P0-4  The rate limiter was in-memory with no way to tell from the outside.
//
// Runs without a dev server. Requires DATABASE_URL.
//   bun run tests/p0-remediation.ts
import { invokeTool } from "@/lib/gateway";
import { assessRisk } from "@/lib/risk";
import { evaluatePolicy } from "@/lib/policy";
import { executeTool } from "@/lib/tools/adapters";
import { sanitizeToolOutput } from "@/lib/security/sanitize-output";
import { MCP_PACKAGES } from "@/lib/tool-registry";
import { rateLimitMode } from "@/lib/rate-limit";
import { db } from "@/lib/db";

// Test fixtures are ASSEMBLED AT RUNTIME, never written as literals.
//
// These are invented values — no real credential exists behind them — but a
// provider-shaped literal in a tracked file trips GitHub push protection and
// every other secret scanner, and it trains readers of a security repo that
// pasting key-shaped strings into source is normal. It is not. The detector
// sees the identical string once assembled, so the test loses nothing.
const SECRET = ["sk", "live", "51QaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefGH"].join("_");
const AWS = "AKIA" + "IOSFODNN7" + "EXAMPLE";
let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}${d ? ` — ${d}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
};

(async () => {
  console.log("=== P0-1: response-side sanitization ===");
  await executeTool("fs.write", { path: "p0-verify.txt", content: `STRIPE=${SECRET}\nAWS=${AWS}\n` }, { sessionId: "v", orgId: "default" });

  // Unit level
  const s = sanitizeToolOutput({ content: `key=${SECRET}`, nested: { deep: [`aws=${AWS}`] } });
  check("sanitizer strips secrets from nested structures", !JSON.stringify(s.output).includes(SECRET) && !JSON.stringify(s.output).includes(AWS), `${s.redacted} redacted`);
  check("sanitizer output is valid parseable JSON", typeof s.output === "object" && s.output !== null);
  check("sanitizer leaves a named marker", JSON.stringify(s.output).includes("SHADOW_REDACTED"));

  // Full gateway path — the one an MCP agent actually takes
  // Must be an ACTIVE agent: the gateway blocks revoked/suspended/quarantined
  // ones outright, and a non-executing call would make the leak assertions pass
  // vacuously — the test would go green without ever exercising the fix.
  const agent = await db.agent.findFirst({ where: { orgId: "default", status: "active" } });
  check("an active agent exists to exercise the gateway path", !!agent, agent ? agent.id : "none — seed the database first");
  if (agent) {
    const r = await invokeTool({ agentId: agent.id, toolName: "fs.read", input: { path: "p0-verify.txt" }, orgId: "default" });
    const agentSees = JSON.stringify(r.output ?? {});
    // Guard against a vacuous pass: the read must actually have happened.
    check("GATEWAY: the read actually executed", r.executed === true, `executed=${r.executed} decision=${r.decision}`);
    check("GATEWAY: agent-visible output has NO raw secret", !agentSees.includes(SECRET) && !agentSees.includes(AWS), agentSees.slice(0, 90));
    check("GATEWAY: reports secretsRedacted", (r.secretsRedacted ?? 0) > 0, String(r.secretsRedacted));
    check("GATEWAY: risk escalated for a leaking read", r.riskScore >= 70, `score=${r.riskScore} level=${r.riskLevel}`);

    const tc = await db.toolCall.findUnique({ where: { id: r.toolCallId } });
    const persisted = tc?.output ?? "";
    check("AUDIT: persisted output has NO raw secret", !!tc && !persisted.includes(SECRET) && !persisted.includes(AWS), persisted.slice(0, 90));
  }

  console.log("\n=== FIX 5: stripe.customer.delete hard block ===");
  for (const t of ["stripe.customer.delete", "db.schema.drop", "github.repo.delete"]) {
    const risk = assessRisk(t, { customerId: "cus_1", target: "x", repo: "o/r" }, 95);
    const p = await evaluatePolicy({ agentId: "x", sessionId: "", toolName: t, risk, agentTrustScore: 95 });
    check(`${t} -> DENY`, p.decision === "deny", `${p.decision} [${p.policy}]`);
  }

  console.log("\n=== P0-5: no fabricated marketplace metrics ===");
  const raw = JSON.stringify(MCP_PACKAGES);
  check("no 'installs' field declared in source", !raw.includes('"installs"'));
  check("no 'verified' field declared in source", !raw.includes('"verified"'));
  check("every package has >0 real backing tools", MCP_PACKAGES.every((p) => p.toolCount > 0), MCP_PACKAGES.map((p) => `${p.name}:${p.toolCount}`).join(" "));
  check("fictional bundles removed (slack/aws/vercel)", !raw.includes("slack") && !raw.includes("safe-aws") && !raw.includes("vercel"));

  console.log("\n=== P0-4: limiter posture is reported ===");
  const m = rateLimitMode();
  check("rateLimitMode() describes backend honestly", typeof m.durable === "boolean" && m.note.length > 20, `${m.backend} durable=${m.durable}`);

  console.log(`\nRESULT ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
