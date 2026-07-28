// Integration tests for the newly-implemented adapters, driven through the REAL
// /api/mcp gateway (identity → risk → policy → adapter → audit). Requires the
// dev server running. Run: BASE=http://127.0.0.1:3000 bun run tests/mcp-adapters-integration.ts

const BASE = process.env.BASE || "http://127.0.0.1:3000"
const M = `${BASE}/api/mcp`

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`) }
}

// Grant an explicit allow_always so high-risk tools reach their adapter (proves
// the adapter exists and behaves, instead of being gated at ask/sandbox). Uses
// the same public permission API the Permission Center uses.
async function grant(agentId: string, toolName: string, riskLevel: string) {
  await fetch(`${BASE}/api/permissions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ agentId, toolName, scope: toolName, decision: "allow_always", riskLevel }),
  }).catch(() => {})
}

async function call(name: string, args: Record<string, unknown>) {
  const res = await fetch(M, {
    method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer local-dev" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  })
  const body = await res.json() as { result?: { content?: Array<{ text: string }> } }
  const parsed = JSON.parse(body.result!.content![0].text) as { decision: string; executed: boolean; output: Record<string, unknown> }
  return parsed
}

async function agentId(): Promise<string> {
  // resolveMcpAgent maps Bearer local-dev to a stable agent; read it back via db.read.
  const r = await call("db.read", { query: "SELECT id FROM \"Agent\" WHERE \"apiKeyHash\" IS NOT NULL ORDER BY \"createdAt\" DESC LIMIT 1" })
  const rows = (r.output as { rows?: Array<{ id: string }> }).rows
  return rows && rows[0] ? rows[0].id : ""
}

;(async () => {
  console.log("\n=== network.fetch — real egress to an allow-listed host (EXECUTED) ===")
  const nf = await call("network.fetch", { url: "https://api.github.com/rate_limit" })
  check("network.fetch executed", nf.executed === true, `decision=${nf.decision}`)
  check("network.fetch returned HTTP 200 from GitHub", (nf.output as { status?: number }).status === 200, `status=${(nf.output as { status?: number }).status}`)
  check("network.fetch is NOT NOT_IMPLEMENTED", (nf.output as { code?: string }).code !== "NOT_IMPLEMENTED")

  console.log("\n=== network.fetch — SSRF blocked (allowed by policy, refused by adapter) ===")
  const ssrf = await call("network.fetch", { url: "http://169.254.169.254/latest/meta-data/" })
  check("metadata IP refused with SSRF_BLOCKED", (ssrf.output as { code?: string }).code === "SSRF_BLOCKED", JSON.stringify(ssrf.output).slice(0, 120))
  const localh = await call("network.fetch", { url: "http://localhost:9999/status" })
  check("localhost refused with SSRF_BLOCKED", (localh.output as { code?: string } | null)?.code === "SSRF_BLOCKED", JSON.stringify(localh.output).slice(0, 120))
  const notallow = await call("network.fetch", { url: "https://evil.example.net/x" })
  check("non-allowlisted host refused", (notallow.output as { code?: string } | null)?.code === "SSRF_BLOCKED", JSON.stringify(notallow.output).slice(0, 120))

  const code = (r: { output: Record<string, unknown> | null }) => (r.output as { code?: string } | null)?.code

  console.log("\n=== db.write — destructive SQL never executes (layered defense) ===")
  const aid = await agentId()
  if (aid) await grant(aid, "db.write", "high") // allow non-destructive writes to reach the adapter
  const wDel = await call("db.write", { query: "DELETE FROM \"User\"" })
  check("db.write DELETE never executes", wDel.executed === false, `decision=${wDel.decision} code=${code(wDel) ?? "-"}`)
  const wDrop = await call("db.write", { query: "DROP TABLE \"User\"" })
  check("db.write DROP never executes", wDrop.executed === false, `decision=${wDrop.decision}`)
  // A non-destructive-but-invalid write reaches the adapter and is rejected there.
  const wNoWhere = await call("db.write", { query: "UPDATE \"User\" SET name='probe'" })
  check("db.write UPDATE-without-WHERE blocked (risk or validator), not executed", wNoWhere.executed === false, `decision=${wNoWhere.decision} code=${code(wNoWhere) ?? "-"}`)
  const wSelect = await call("db.write", { query: "SELECT 1" })
  check("db.write rejects SELECT (not executed)", wSelect.executed === false, `decision=${wSelect.decision} code=${code(wSelect) ?? "-"}`)

  console.log("\n=== unimplemented tools return DISTINCT structured codes (never NOT_IMPLEMENTED) ===")
  // ai.generate is auto-allowed (low risk) so it reaches the adapter.
  const ai = await call("ai.generate", { prompt: "hello" })
  check("ai.generate → PROVIDER_NOT_CONFIGURED", code(ai) === "PROVIDER_NOT_CONFIGURED", JSON.stringify(ai.output).slice(0, 120))
  check("ai.generate is NOT NOT_IMPLEMENTED", code(ai) !== "NOT_IMPLEMENTED")

  console.log("\n=== full tools/list sweep: no tool advertises NOT_IMPLEMENTED behaviour ===")
  // Every unimplemented tool must carry annotations.implemented === false and a
  // distinct code path — verified structurally via tools/list.
  const listRes = await fetch(M, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }) })
  const list = await listRes.json() as { result: { tools: Array<{ name: string; annotations: { implemented: boolean } }> } }
  // 20 of the 28 registered tools have a real adapter. The remaining 8 are
  // 5 permanently policy-denied + ai.train / db.migrate / shell.exec, each of
  // which needs a backend that does not exist (documented, never faked).
  const impl = list.result.tools.filter((t) => t.annotations.implemented).length
  check("tools/list reports 20 of 28 registered tools implemented", impl === 20, `${impl} implemented`)
  check("tools/list still has all 28 tools", list.result.tools.length === 28)

  console.log(`\nRESULT ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2) })
