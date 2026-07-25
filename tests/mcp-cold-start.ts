// Regression test for M-1 — the cold-start initialization race.
//
// Before the fix, the VERY FIRST tools/call after boot could fail with
// "agent resolution failed: Invalid ...lib/db.ts invocation" because Prisma
// connects lazily and the engine was not ready yet. dbReady() now makes the
// connection explicit, idempotent and retried.
//
// This test issues the first request against a freshly-started server and
// asserts it succeeds. It does NOT warm anything up first — that is the point.
//
// Usage:
//   BASE=http://127.0.0.1:3000 bun run tests/mcp-cold-start.ts
// The server must have been started immediately before running this.

const BASE = process.env.BASE || "http://127.0.0.1:3000"
const URL_MCP = `${BASE}/api/mcp`

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`) }
}

async function rpc(method: string, params?: Record<string, unknown>) {
  const started = Date.now()
  const res = await fetch(URL_MCP, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer local-dev" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  const body = await res.json().catch(() => null) as Record<string, unknown> | null
  return { http: res.status, ms: Date.now() - started, body }
}

// Wait until the port accepts connections, but do NOT exercise /api/mcp —
// the first call to it must be the assertion itself.
async function waitForPort(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const c = new AbortController()
      const t = setTimeout(() => c.abort(), 5000)
      await fetch(`${BASE}/api/health`, { signal: c.signal })
      clearTimeout(t)
      return true
    } catch { await new Promise((r) => setTimeout(r, 1000)) }
  }
  return false
}

;(async () => {
  console.log("\n=== M-1: first MCP request after cold start ===")
  const up = await waitForPort()
  if (!up) { console.log("  FAIL  server never became reachable"); process.exit(1) }

  // THE assertion: the very first /api/mcp call must succeed.
  const first = await rpc("tools/call", { name: "shadowpaste.audit", arguments: { limit: 1 } })
  const err = (first.body as { error?: { code: number; message: string } } | null)?.error
  check("first tools/call returns HTTP 200", first.http === 200, `${first.http}`)
  check("first tools/call has no JSON-RPC error", !err, err ? `${err.code}: ${err.message.slice(0, 120)}` : "")
  check("no agent-resolution failure", !err || !/agent resolution failed/i.test(err.message))
  check("no Prisma init failure", !err || !/Invalid .*db\.ts|PrismaClient/i.test(err.message))
  console.log(`  (first call took ${first.ms}ms)`)

  // Follow-ups must also be clean (proves dbReady() memo is not caching a bad state).
  for (let i = 0; i < 3; i++) {
    const r = await rpc("tools/list")
    const tools = (r.body as { result?: { tools?: unknown[] } } | null)?.result?.tools
    check(`follow-up tools/list #${i + 1} returns 28 tools`, Array.isArray(tools) && tools.length === 28, `${Array.isArray(tools) ? tools.length : "n/a"}`)
  }

  console.log(`\nRESULT ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})()
