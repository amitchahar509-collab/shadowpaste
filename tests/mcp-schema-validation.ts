// Regression tests for H-1 (tools/list ↔ validateToolInput parity) and M-2
// (NOT_IMPLEMENTED reporting). Pure unit tests — no server or DB required.
//
// Run: bun run tests/mcp-schema-validation.ts

import { buildToolList, validateToolInput } from "../src/lib/mcp/server"
import { TOOL_REGISTRY } from "../src/lib/tool-registry"
import { isToolImplemented, IMPLEMENTED_TOOLS } from "../src/lib/tools/adapters"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`) }
}

const tools = buildToolList()

console.log("\n=== H-1: tools/list required[] matches the validator exactly ===")
check("tools/list returns all registered tools", tools.length === TOOL_REGISTRY.length, `${tools.length}/${TOOL_REGISTRY.length}`)

let parityFailures = 0
for (const def of TOOL_REGISTRY) {
  const listed = tools.find((t) => t.name === def.name)!
  const advertised = (listed.inputSchema.required as string[]) || []
  // 1. The advertised required[] IS the registry's required[] (single source).
  if (JSON.stringify([...advertised].sort()) !== JSON.stringify([...def.required].sort())) {
    parityFailures++
    console.log(`    mismatch on ${def.name}: advertised=${JSON.stringify(advertised)} registry=${JSON.stringify(def.required)}`)
    continue
  }
  // 2. Every advertised required key exists in properties.
  const props = Object.keys(listed.inputSchema.properties as Record<string, unknown>)
  for (const r of advertised) {
    if (!props.includes(r)) { parityFailures++; console.log(`    ${def.name}: required '${r}' missing from properties`) }
  }
}
check("advertised required[] === registry required[] for all tools", parityFailures === 0, `${parityFailures} mismatch(es)`)

console.log("\n=== H-1: missing REQUIRED parameter → rejected (-32602 message) ===")
for (const def of TOOL_REGISTRY) {
  if (def.required.length === 0) continue
  const missing = def.required[0]
  // Supply every required param EXCEPT one.
  const input: Record<string, unknown> = {}
  for (const r of def.required) {
    if (r === missing) continue
    input[r] = sampleFor(def.inputSchema[r])
  }
  const err = validateToolInput(def.inputSchema, input, def.required)
  if (!err || !err.includes(missing)) {
    check(`${def.name}: missing '${missing}' rejected`, false, `got: ${err ?? "null"}`)
  } else { pass++ }
}
console.log(`  (checked ${TOOL_REGISTRY.filter((t) => t.required.length > 0).length} tools with required params)`)

console.log("\n=== H-1: missing OPTIONAL parameter → accepted ===")
let optionalChecked = 0
for (const def of TOOL_REGISTRY) {
  const optional = Object.keys(def.inputSchema).filter((k) => !def.required.includes(k))
  if (optional.length === 0) continue
  optionalChecked++
  // Supply ONLY the required params; omit every optional one.
  const input: Record<string, unknown> = {}
  for (const r of def.required) input[r] = sampleFor(def.inputSchema[r])
  const err = validateToolInput(def.inputSchema, input, def.required)
  check(`${def.name}: omitting optional [${optional.join(", ")}] accepted`, err === null, err ?? "")
}
check("at least one tool has optional params (regression guard)", optionalChecked > 0, `${optionalChecked} tools`)

console.log("\n=== H-1: the exact defects found in runtime validation ===")
// shadowpaste.scan {repo} previously failed with "Missing required parameter 'token'"
const scan = TOOL_REGISTRY.find((t) => t.name === "shadowpaste.scan")!
check("shadowpaste.scan accepts {repo} without token", validateToolInput(scan.inputSchema, { repo: "octocat/Hello-World" }, scan.required) === null)
// shadowpaste.audit {limit} previously failed with "Missing required parameter 'action'"
const audit = TOOL_REGISTRY.find((t) => t.name === "shadowpaste.audit")!
check("shadowpaste.audit accepts {limit} without action", validateToolInput(audit.inputSchema, { limit: 3 }, audit.required) === null)
check("shadowpaste.audit accepts {} (all optional)", validateToolInput(audit.inputSchema, {}, audit.required) === null)

console.log("\n=== Type + unknown-parameter validation still enforced ===")
const fsRead = TOOL_REGISTRY.find((t) => t.name === "fs.read")!
check("fs.read rejects wrong type (path=number)", validateToolInput(fsRead.inputSchema, { path: 123 }, fsRead.required) !== null)
check("fs.read rejects empty string path", validateToolInput(fsRead.inputSchema, { path: "  " }, fsRead.required) !== null)
check("fs.read rejects unknown parameter", validateToolInput(fsRead.inputSchema, { path: "a.txt", bogus: 1 }, fsRead.required) !== null)
check("fs.read accepts valid input", validateToolInput(fsRead.inputSchema, { path: "a.txt" }, fsRead.required) === null)
const fsExec = TOOL_REGISTRY.find((t) => t.name === "fs.execute")!
check("fs.execute accepts string[] args", validateToolInput(fsExec.inputSchema, { path: "x", args: ["a", "b"] }, fsExec.required) === null)
check("fs.execute rejects non-array args", validateToolInput(fsExec.inputSchema, { path: "x", args: "nope" }, fsExec.required) !== null)

console.log("\n=== Schema shape (no regressions) ===")
let shapeBad = 0
for (const t of tools) {
  const s = t.inputSchema as Record<string, unknown>
  if (s.type !== "object") { shapeBad++; console.log(`    ${t.name}: type !== object`) }
  if (typeof s.properties !== "object" || s.properties === null) { shapeBad++; console.log(`    ${t.name}: properties not an object`) }
  if (!Array.isArray(s.required)) { shapeBad++; console.log(`    ${t.name}: required not an array`) }
  for (const [k, v] of Object.entries(s.properties as Record<string, unknown>)) {
    const ps = v as Record<string, unknown>
    if (typeof ps !== "object" || ps === null || typeof ps.type !== "string") { shapeBad++; console.log(`    ${t.name}.${k}: property is not a JSON Schema object`) }
  }
}
check("all 28 inputSchemas are valid JSON Schema", shapeBad === 0, `${shapeBad} problem(s)`)

console.log("\n=== M-2: unimplemented tools are reported, not silent ===")
const unimplemented = TOOL_REGISTRY.filter((t) => !isToolImplemented(t.name)).map((t) => t.name)
check("IMPLEMENTED_TOOLS is non-empty", IMPLEMENTED_TOOLS.size > 0, `${IMPLEMENTED_TOOLS.size} implemented`)
check("tools/list annotates implemented status", tools.every((t) => typeof (t.annotations as Record<string, unknown>).implemented === "boolean"))
check("annotation matches isToolImplemented()", tools.every((t) => (t.annotations as { implemented: boolean }).implemented === isToolImplemented(t.name)))
console.log(`  unimplemented (${unimplemented.length}): ${unimplemented.join(", ")}`)

console.log(`\nRESULT ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)

function sampleFor(shorthand: unknown): unknown {
  const t = String(shorthand ?? "string")
  if (t.endsWith("[]")) return ["x"]
  switch (t) {
    case "number": return 1
    case "integer": return 1
    case "boolean": return true
    case "object": return { k: 1 }
    default: return "x"
  }
}
