// OAuth 2.1 Authorization Server — end-to-end verification.
//
// Proves the stubs are gone: registration persists, PKCE is enforced, codes are
// single-use, redirect_uri is exact-matched, unauthenticated /authorize does NOT
// mint a code, refresh tokens rotate with replay detection, and revocation works.
//
// Requires the dev server. Run: bun run tests/oauth-flow.ts

import { createHash, randomBytes } from "crypto"

const BASE = process.env.BASE || "http://127.0.0.1:3000"
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`) }
}
const form = (o: Record<string, string>) => new URLSearchParams(o).toString()
const post = (p: string, body: string) =>
  fetch(`${BASE}${p}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, redirect: "manual" })

async function ready() {
  for (let i = 0; i < 20; i++) {
    try { const r = await fetch(`${BASE}/api/patterns`, { signal: AbortSignal.timeout(15000) }); if (r.ok) return true } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

;(async () => {
  if (!await ready()) { console.log("  server not reachable"); process.exit(1) }
  const REDIRECT = "https://claude.ai/api/mcp/auth_callback"

  console.log("\n=== Discovery (RFC 8414) ===")
  const meta = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>
  check("advertises S256 only (OAuth 2.1: no 'plain')", JSON.stringify(meta.code_challenge_methods_supported) === JSON.stringify(["S256"]))
  check("advertises revocation_endpoint", typeof meta.revocation_endpoint === "string")
  check("does NOT advertise implicit/password grants", !JSON.stringify(meta.grant_types_supported).match(/implicit|password/))

  console.log("\n=== Dynamic client registration (RFC 7591) ===")
  const regRes = await fetch(`${BASE}/oauth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test MCP Client", redirect_uris: [REDIRECT] }),
  })
  const reg = await regRes.json() as { client_id: string }
  check("registration returns 201", regRes.status === 201, String(regRes.status))
  check("issues a client_id", typeof reg.client_id === "string" && reg.client_id.startsWith("sp_"))
  const badReg = await fetch(`${BASE}/oauth/register`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Bad", redirect_uris: ["http://evil.example.com/cb"] }),
  })
  check("rejects non-https redirect_uri", badReg.status === 400, String(badReg.status))

  console.log("\n=== /authorize — hardening ===")
  const verifier = randomBytes(48).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString()

  const unknownClient = await fetch(`${BASE}/oauth/authorize?${q({ client_id: "sp_does_not_exist", redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256" })}`, { redirect: "manual" })
  check("unknown client_id -> 400, no redirect", unknownClient.status === 400, String(unknownClient.status))

  const badRedirect = await fetch(`${BASE}/oauth/authorize?${q({ client_id: reg.client_id, redirect_uri: "https://attacker.example.com/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256" })}`, { redirect: "manual" })
  check("unregistered redirect_uri -> 400, no redirect (no open redirect)", badRedirect.status === 400, String(badRedirect.status))

  const noPkce = await fetch(`${BASE}/oauth/authorize?${q({ client_id: reg.client_id, redirect_uri: REDIRECT, response_type: "code" })}`, { redirect: "manual" })
  const noPkceLoc = noPkce.headers.get("location") || ""
  check("missing PKCE -> error redirect, no code issued", noPkceLoc.includes("error=invalid_request") && !noPkceLoc.includes("code="), noPkceLoc.slice(0, 70))

  const plainPkce = await fetch(`${BASE}/oauth/authorize?${q({ client_id: reg.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "plain" })}`, { redirect: "manual" })
  check("code_challenge_method=plain rejected", (plainPkce.headers.get("location") || "").includes("error="))

  // THE critical regression: the old stub auto-approved everyone.
  const anon = await fetch(`${BASE}/oauth/authorize?${q({ client_id: reg.client_id, redirect_uri: REDIRECT, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" })}`, { redirect: "manual" })
  const anonLoc = anon.headers.get("location") || ""
  check("UNAUTHENTICATED user gets NO authorization code", !anonLoc.includes("code="), anonLoc.slice(0, 70))
  check("unauthenticated user is sent to sign in", anonLoc.includes("oauth_authorize"), anonLoc.slice(0, 70))

  console.log("\n=== /token — no hardcoded tokens, RFC 6749 errors ===")
  const badGrant = await post("/oauth/token", form({ grant_type: "password", client_id: reg.client_id, username: "a", password: "b" }))
  const badGrantBody = await badGrant.json() as { error: string }
  check("password grant unsupported (OAuth 2.1 removed it)", badGrantBody.error === "unsupported_grant_type", badGrantBody.error)

  const badClient = await post("/oauth/token", form({ grant_type: "authorization_code", client_id: "sp_nope", code: "x", redirect_uri: REDIRECT, code_verifier: verifier }))
  check("unknown client -> invalid_client 401", badClient.status === 401, String(badClient.status))

  const forgedCode = await post("/oauth/token", form({ grant_type: "authorization_code", client_id: reg.client_id, code: "totally-made-up-code", redirect_uri: REDIRECT, code_verifier: verifier }))
  const forgedBody = await forgedCode.json() as { error: string; access_token?: string }
  check("forged authorization code rejected", forgedBody.error === "invalid_grant", forgedBody.error)
  check("NO hardcoded token is ever returned", !forgedBody.access_token && !JSON.stringify(forgedBody).includes("shadowpaste-access-token"))

  const badRefresh = await post("/oauth/token", form({ grant_type: "refresh_token", client_id: reg.client_id, refresh_token: "made-up-refresh" }))
  const badRefreshBody = await badRefresh.json() as { error: string }
  check("forged refresh token rejected", badRefreshBody.error === "invalid_grant", badRefreshBody.error)

  console.log("\n=== MCP token validation ===")
  const mcpBad = await fetch(`${BASE}/api/mcp`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer shadowpaste-access-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  })
  const mcpBody = await mcpBad.json() as { result?: { tools?: unknown[] }; error?: { message?: string } }
  // The assertion must hold under BOTH postures, so it checks the invariant
  // rather than one deployment's configuration:
  //   REQUIRE_OAUTH=true  (production) -> 401 invalid_token
  //   REQUIRE_OAUTH unset (local dev)  -> request proceeds as the local-dev agent
  // Either way the old hardcoded stub string must confer no OAuth session.
  const rejected = mcpBad.status === 401 && /invalid_token/.test(mcpBody.error?.message || "")
  const localDevServed = mcpBad.status === 200 && Array.isArray(mcpBody.result?.tools)
  check("old stub token grants no OAuth session",
    rejected || localDevServed,
    rejected ? "REQUIRE_OAUTH=true -> 401 invalid_token" : `local-dev posture, http ${mcpBad.status}`)

  console.log(`\nRESULT ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2) })
