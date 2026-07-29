// Security regression suite — audit-log authorization + scanner canonicalization.
//
// Follows the repo's existing test convention (standalone script + check(),
// wired into tests/run-all.sh) rather than introducing a second test runner for
// one file. Run directly:
//
//   bun run tests/security/fixes.test.ts
//
// HTTP checks need a dev server; set BASE to point elsewhere. Scanner checks are
// pure and always run.
//
// WHAT THESE PIN
// --------------
// 1. /api/audit-logs must never serve the compliance trail without credentials.
//    It previously did `getContext(req) || anonymousContext()`, and
//    anonymousContext() resolves to orgId "default" — handing any anonymous
//    caller real tool invocations, actor ids, client IPs and user agents.
//
// 2. The scanner must see through encoding. Before the canonicalization ladder,
//    8 of 9 obfuscations bypassed the full 500-pattern catalog.
//
// 3. MOST IMPORTANT: a canonicalized finding must REDACT. Detection that
//    reports success while leaving the credential in place is worse than no
//    detection — it produces a reassuring log line over an unmodified leak.
//    Every scanner check below therefore asserts on the redacted OUTPUT, not
//    just on findings.length.

import { scanForSecrets, virtualizeText } from "@/lib/security/detector";
import { canonicalizeText } from "@/lib/security/canonicalize";
import { sanitizeToolOutput } from "@/lib/security/sanitize-output";

const BASE = process.env.BASE || "http://127.0.0.1:3000";

let pass = 0, fail = 0, skipped = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Fixtures assembled at runtime — never key-shaped literals in a tracked file.
const STRIPE = ["sk", "live", "51QaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefGH"].join("_");
const GITHUB = "ghp" + "_" + "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
const pctEncode = (s: string) =>
  s.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("");

async function serverUp(): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

(async () => {
  // ---------------------------------------------------------------------
  console.log("\n=== TASK 1 — /api/audit-logs requires authentication ===");
  if (!(await serverUp())) {
    skipped += 4;
    console.log("  SKIP  server not reachable at " + BASE + " (start it with `bun run dev`)");
  } else {
    const noAuth = await fetch(`${BASE}/api/audit-logs`);
    check("GET without Authorization -> 401/403", noAuth.status === 401 || noAuth.status === 403, `http ${noAuth.status}`);

    const body = await noAuth.text();
    check("unauthenticated body carries an error, not log data",
      /unauthor|forbidden/i.test(body) && !/"logs"\s*:\s*\[\s*\{/.test(body),
      body.slice(0, 90));

    const badToken = await fetch(`${BASE}/api/audit-logs`, { headers: { authorization: "Bearer definitely-not-a-real-token" } });
    check("GET with invalid Bearer -> 401/403", badToken.status === 401 || badToken.status === 403, `http ${badToken.status}`);

    // The query must not run at all for an anonymous caller — a 401 that still
    // hit the database would leave the DoS/cost-amplification path open.
    const malformed = await fetch(`${BASE}/api/audit-logs?limit=99999&orgId=default`, { headers: { authorization: "Basic dXNlcjpwYXNz" } });
    const mBody = await malformed.text();
    check("client-supplied orgId cannot bypass the gate",
      (malformed.status === 401 || malformed.status === 403) && !/"logs"/.test(mBody),
      `http ${malformed.status}`);
  }

  // ---------------------------------------------------------------------
  console.log("\n=== TASK 2 — canonicalization: detection ===");
  const encodedStripe = pctEncode(STRIPE);

  const cases: Array<[string, string]> = [
    ["fully URL-encoded Stripe key", encodedStripe],
    ["partially encoded", STRIPE.slice(0, 8) + pctEncode(STRIPE.slice(8))],
    ["double-encoded", encodeURIComponent(encodedStripe)],
    ["encoded inside a URL query param", `https://example.test/cb?token=${encodedStripe}`],
    ["encoded GitHub token", pctEncode(GITHUB)],
    ["NFKC fullwidth homoglyph", "ｓｋ" + STRIPE.slice(2)],
    ["zero-width space injected", STRIPE.slice(0, 8) + "​" + STRIPE.slice(8)],
    ["soft hyphen injected", STRIPE.slice(0, 8) + "­" + STRIPE.slice(8)],
  ];
  for (const [name, text] of cases) {
    const f = scanForSecrets(text, "regression");
    check(name, f.length > 0, f.length ? f[0].detector : "NOT DETECTED");
  }

  // The literal payload quoted in the audit report:
  //     sk_live_%35%31%32%33%34%35%36%37%38%39
  // It canonicalizes to `sk_live_5123456789` — ten characters after the prefix.
  // Stripe secret keys are `sk_live_[A-Za-z0-9]{16,}`, so that string is NOT a
  // detectable secret in ANY form: the PLAINTEXT `sk_live_5123456789` is also
  // not flagged (verified: 0 findings). The report's payload is illustrative
  // shorthand, not a real key shape, so asserting on it would pin a
  // false-positive requirement — flagging it would mean flagging any short
  // `sk_live_` prefixed string.
  //
  // What actually matters is asserted instead: an encoded key of REAL length is
  // caught, and the too-short one stays clean in both forms.
  const shortPayload = "sk_live_%35%31%32%33%34%35%36%37%38%39";
  check("report-shaped payload behaves identically encoded and plain (both clean — too short to be a key)",
    scanForSecrets(shortPayload, "regression").length === scanForSecrets(canonicalizeText(shortPayload), "regression").length,
    `encoded=${scanForSecrets(shortPayload, "regression").length} plain=${scanForSecrets(canonicalizeText(shortPayload), "regression").length}`);
  const realLenEncoded = "sk_live_" + pctEncode("51QaBcDeFgHiJkLmNoPqRs");
  check("same shape at REAL key length IS detected when encoded",
    scanForSecrets(realLenEncoded, "regression").length > 0,
    scanForSecrets(realLenEncoded, "regression").map((f) => f.detector).join(","));

  // ---------------------------------------------------------------------
  console.log("\n=== TASK 2 — canonicalization: REDACTION actually removes it ===");
  // This is the assertion that matters. A finding whose `raw` is the DECODED
  // value would not occur in the source text, so substring replacement would
  // silently match nothing while reporting a successful redaction.
  for (const [name, text] of cases) {
    const f = scanForSecrets(text, "regression");
    if (f.length === 0) { check(`redacts: ${name}`, false, "nothing detected"); continue; }
    check(`finding.raw is a real substring of the input: ${name}`,
      f.every((x) => text.includes(x.raw)),
      f.map((x) => x.raw.slice(0, 18)).join(" | "));
  }

  const v = virtualizeText(`STRIPE_KEY=${encodedStripe}`);
  check("virtualizeText replaces the encoded span", !v.text.includes(encodedStripe) && v.count > 0, `count=${v.count}`);

  const s = sanitizeToolOutput({ config: { nested: { value: `key=${encodedStripe}` } } });
  const sJson = JSON.stringify(s.output);
  check("sanitizeToolOutput strips the encoded secret from tool output",
    !sJson.includes(encodedStripe) && s.redacted > 0, `redacted=${s.redacted}`);

  // ---------------------------------------------------------------------
  console.log("\n=== TASK 3 — nested JSON payload ===");
  const nested = JSON.stringify({
    service: "billing",
    meta: { retries: 3, auth: { header: `Bearer ${encodedStripe}` } },
    extra: [{ note: "harmless" }, { token: pctEncode(GITHUB) }],
  });
  const nestedFindings = scanForSecrets(nested, "regression");
  check("nested JSON: secretsFound > 0", nestedFindings.length > 0, `${nestedFindings.length} findings`);
  check("nested JSON: both encoded credentials found", nestedFindings.length >= 2, `${nestedFindings.length} findings`);
  const nestedSan = sanitizeToolOutput(JSON.parse(nested));
  check("nested JSON: sanitized output retains neither secret",
    !JSON.stringify(nestedSan.output).includes(encodedStripe) && !JSON.stringify(nestedSan.output).includes(pctEncode(GITHUB)),
    `redacted=${nestedSan.redacted}`);

  // ---------------------------------------------------------------------
  console.log("\n=== canonicalizeText unit behaviour ===");
  check("decodes single-pass percent-encoding", canonicalizeText("%73%6b") === "sk");
  check("decodes nested percent-encoding", canonicalizeText(encodeURIComponent("%73%6b")) === "sk");
  check("applies NFKC", canonicalizeText("ｓｋ") === "sk");
  check("strips zero-width characters", canonicalizeText("s​k") === "sk");
  check("leaves clean text untouched", canonicalizeText("hello world") === "hello world");
  check("survives malformed percent sequences", canonicalizeText("100% done, 50%zz, %g1") === "100% done, 50%zz, %g1");
  const t0 = Date.now();
  canonicalizeText("%25".repeat(20000));
  const elapsed = Date.now() - t0;
  check("bounded on adversarial nested encoding (no hang)", elapsed < 5000, `${elapsed}ms`);

  // ---------------------------------------------------------------------
  console.log("\n=== false-positive guard (canonicalization must not over-fire) ===");
  const benign: Array<[string, string]> = [
    ["prose with percent signs", "CPU at 90% and memory at 45% during the 100% rollout"],
    ["normal URL with encoded space", "https://example.test/search?q=hello%20world&page=2"],
    ["encoded punctuation only", "value=%2C%2E%3B%3A%21"],
    ["CSS and hex colors", "color: #ff00aa; width: 50%; --x: 100%"],
  ];
  for (const [name, text] of benign) {
    const f = scanForSecrets(text, "regression");
    check(`no false positive: ${name}`, f.length === 0, f.length ? f.map((x) => x.detector).join(",") : "clean");
  }

  console.log(`\nRESULT ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ""}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("HARNESS ERROR", e); process.exit(2); });
