import { createHash, randomBytes } from "crypto"
const B = "https://shadowpaste-xi.vercel.app"
const RU = "https://claude.ai/api/mcp/auth_callback"
const log = (...a: unknown[]) => console.log(...a)

// 1. throwaway account (explicitly authorized by the repo owner)
const email = `verify+${Date.now()}@example.com`
const password = "Verify-Live-9x!" + randomBytes(4).toString("hex")
const su = await fetch(`${B}/api/auth/signup`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password, name: "Live Verify" }),
})
const suBody = await su.json() as { ok?: boolean; user?: { id: string }; org?: { id: string } }
const cookie = (su.headers.get("set-cookie") || "").match(/sp_session=([^;]+)/)?.[1]
log(`1. signup           http=${su.status} ok=${suBody.ok} session=${cookie ? "yes" : "NO"}`)
if (!cookie) { log("   cannot continue without a session"); process.exit(1) }

// 2. register an OAuth client
const reg = await fetch(`${B}/oauth/register`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "Live Telemetry Verify", redirect_uris: [RU] }),
})
const { client_id } = await reg.json() as { client_id: string }
log(`2. register client  http=${reg.status} client_id=${client_id.slice(0, 18)}…`)

// 3. authorize WITH the session -> must now issue a code
const verifier = randomBytes(48).toString("base64url")
const challenge = createHash("sha256").update(verifier).digest("base64url")
const q = new URLSearchParams({ client_id, redirect_uri: RU, response_type: "code",
  code_challenge: challenge, code_challenge_method: "S256", state: "live", scope: "mcp" })
const az = await fetch(`${B}/oauth/authorize?${q}`, { redirect: "manual", headers: { cookie: `sp_session=${cookie}` } })
const loc = az.headers.get("location") || ""
const code = new URL(loc).searchParams.get("code")
log(`3. authorize        http=${az.status} code=${code ? "ISSUED" : "none"}`)
if (!code) { log("   loc:", loc.slice(0, 120)); process.exit(1) }

// 4. exchange for a real access token
const tk = await fetch(`${B}/oauth/token`, {
  method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "authorization_code", client_id, code, redirect_uri: RU, code_verifier: verifier }).toString(),
})
const tok = await tk.json() as { access_token?: string; error?: string }
log(`4. token            http=${tk.status} access_token=${tok.access_token ? "ISSUED" : tok.error}`)
if (!tok.access_token) process.exit(1)

// 5. FIX 1 — SSRF telemetry through the real gateway
const call = async (name: string, args: Record<string, unknown>) => {
  const r = await fetch(`${B}/api/mcp`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  })
  const j = await r.json() as { result?: { content?: Array<{ text: string }> }; error?: unknown }
  if (!j.result) return { err: JSON.stringify(j.error).slice(0, 90) }
  return JSON.parse(j.result.content![0].text) as Record<string, unknown>
}
log("\n5. FIX 1 — SSRF risk-score sync (live gateway):")
for (const u of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:9999/x", "http://10.0.0.5/x"]) {
  const c = await call("network.fetch", { url: u })
  const o = (c.output || {}) as { code?: string }
  log(`   ${String(c.decision ?? c.err).padEnd(9)} score=${String(c.riskScore ?? "-").padStart(3)} level=${String(c.riskLevel ?? "-").padEnd(9)} ${o.code ?? ""}`)
}
const ctl = await call("network.fetch", { url: "https://api.github.com/rate_limit" })
log(`   control: ${ctl.decision} score=${ctl.riskScore} level=${ctl.riskLevel} executed=${ctl.executed}`)

// 6. FIX 2 — audit trail
log("\n6. FIX 2 — audit trail (authenticated read):")
const au = await fetch(`${B}/api/audit?limit=40`, { headers: { cookie: `sp_session=${cookie}` } })
const audit = await au.json() as { logs?: Array<{ action: string; target: string; metadata: string }>; events?: unknown[] }
const rows = audit.logs || []
log(`   http=${au.status} events=${rows.length}`)
const want = ["tool.invoke", "auth.denied", "auth.login_failed", "mcp.token_invalid", "mcp.unauthenticated"]
for (const r of rows.filter((r) => want.includes(r.action)).slice(0, 6)) {
  const m = JSON.parse(r.metadata || "{}")
  log(`   ${r.action.padEnd(20)} ${String(r.target).padEnd(18)} decision=${m.decision} riskScore=${m.riskScore}${m.escalationCode ? " esc=" + m.escalationCode : ""}`)
}
log(`\n   test account: ${email} (user ${suBody.user?.id})`)
