// Unit tests for the newly-implemented adapters — pure logic, no server/DB/network.
// Run: bun run tests/mcp-adapters-unit.ts

import { isPrivateAddress, assertSafeUrl, validateWriteQuery } from "../src/lib/tools/adapters"

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`) }
}
async function throws(fn: () => Promise<unknown>, mustMatch: RegExp): Promise<boolean> {
  try { await fn(); return false } catch (e) { return mustMatch.test((e as Error).message) }
}

console.log("\n=== SSRF: private / loopback / metadata address detection ===")
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.5", "172.31.255.1", "192.168.0.1", "169.254.169.254", "0.0.0.0", "::1", "fe80::1", "fd00::1"]) {
  check(`isPrivateAddress(${ip}) === true`, isPrivateAddress(ip) === true)
}
for (const ip of ["8.8.8.8", "140.82.112.3", "172.15.0.1", "172.32.0.1", "192.169.0.1", "1.1.1.1"]) {
  check(`isPrivateAddress(${ip}) === false (public)`, isPrivateAddress(ip) === false)
}

console.log("\n=== SSRF: assertSafeUrl rejects dangerous URLs (no network needed) ===")
check("file:// blocked", await throws(() => assertSafeUrl("file:///etc/passwd"), /protocol|file/i))
check("ftp:// blocked", await throws(() => assertSafeUrl("ftp://ftp.example.com/x"), /protocol/i))
check("gopher:// blocked", await throws(() => assertSafeUrl("gopher://evil/x"), /protocol/i))
check("http://localhost blocked", await throws(() => assertSafeUrl("http://localhost:3000/api"), /localhost/i))
check("http://127.0.0.1 blocked", await throws(() => assertSafeUrl("http://127.0.0.1/api"), /private|loopback/i))
check("http://169.254.169.254 (metadata) blocked", await throws(() => assertSafeUrl("http://169.254.169.254/latest/meta-data"), /private|loopback|metadata/i))
check("http://10.0.0.5 blocked", await throws(() => assertSafeUrl("http://10.0.0.5/x"), /private/i))
check("non-allowlisted public host blocked", await throws(() => assertSafeUrl("https://evil.example.net/x"), /allowlist/i))
check("garbage URL blocked", await throws(() => assertSafeUrl("not a url"), /invalid/i))

console.log("\n=== db.write SQL validation ===")
const okQ = ["INSERT INTO t(a) VALUES(1)", "UPDATE t SET a=1 WHERE id=2", "update t set a=1 where id=2"]
for (const q of okQ) check(`accepts: ${q}`, validateWriteQuery(q) === null, validateWriteQuery(q) ?? "")
// Every entry must be REJECTED. The message may be the allowlist message
// (statement doesn't start with INSERT/UPDATE) or a more specific one — both
// are correct rejections.
const badQ: Array<[string, RegExp]> = [
  ["DELETE FROM t", /DELETE|INSERT or UPDATE/i],
  ["UPDATE t SET a=1", /WHERE/i],
  ["DROP TABLE t", /DDL|destructive|INSERT or UPDATE/i],
  ["TRUNCATE t", /DDL|destructive|INSERT or UPDATE/i],
  ["ALTER TABLE t ADD c int", /DDL|destructive|INSERT or UPDATE/i],
  ["INSERT INTO t VALUES(1); DROP TABLE t", /multiple statements/i],
  ["SELECT * FROM t", /INSERT or UPDATE/i],
  ["", /empty/i],
]
for (const [q, re] of badQ) {
  const msg = validateWriteQuery(q)
  check(`rejects: ${q || "(empty)"}`, msg !== null && re.test(msg), msg ?? "accepted!")
}

console.log(`\nRESULT ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
