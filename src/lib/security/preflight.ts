// ShadowPaste — pre-flight input inspection.
//
// THE GAP THIS CLOSES
// -------------------
// The security classifiers that recognise an attack (SSRF target, path
// traversal, forbidden table/column, shell metacharacters) lived exclusively
// INSIDE the tool adapters. Adapters only run when the policy engine allows a
// call. So an attack aimed at a tool the policy stops earlier was contained —
// nothing executed — but never classified:
//
//   network.fetch http://169.254.169.254/...  ->  "ask", risk 38/medium
//                                                 no SSRF_BLOCKED, no alert
//   fs.read ../../../../etc/passwd            ->  contained, recorded as a
//                                                 routine low-risk read
//
// Observed live through an MCP client. The inversion it produces is the wrong
// way round: the MORE trusted an agent is, the better the security telemetry,
// because only trusted agents get far enough to trip the real classifier. A
// low-trust attacker's probes look like ordinary approval requests.
//
// This module runs the SAME checks against the raw input, before policy. It
// executes nothing and reaches nothing on the network or filesystem.
//
// WHY IT REUSES THE ADAPTERS' OWN PREDICATES
// ------------------------------------------
// Every check here imports the exact function or pattern the adapter enforces.
// A re-implementation would drift, and a pre-flight that disagrees with the
// adapter is worse than no pre-flight: it would either cry wolf on calls that
// are actually fine, or clear calls the adapter later blocks.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// No DNS resolution. assertSafeUrl() resolves hostnames to catch DNS-rebinding,
// which is correct at execution time but would make every rejected call perform
// a lookup — attacker-controlled latency and a request amplifier. Pre-flight
// judges the literal input only. A hostname that resolves to a private address
// still passes here and is still caught by the adapter, so this only ever ADDS
// detection.

import {
  isPrivateAddress,
  isPathEscape,
  assertNoDeniedTable,
  DB_READ_COLUMN_DENYLIST,
  SHELL_METACHARS,
} from "@/lib/tools/adapters";

export interface PreflightFinding {
  /** Escalation code, identical to the one the adapter would report. */
  code: string;
  /** Human detail for the audit row and alert body. */
  detail: string;
}

/** Hosts the network tools may always reach; mirrors the adapter's allowlist. */
function isAllowedHost(hostname: string): boolean {
  const extra = (process.env.NETWORK_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const always = ["api.github.com", "api.stripe.com"];
  const h = hostname.toLowerCase();
  return always.includes(h) || extra.includes(h);
}

function inspectUrl(raw: unknown): PreflightFinding | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    // Unparseable input is not an attack signal on its own — the adapter will
    // reject it as a validation error.
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { code: "SSRF_BLOCKED", detail: `non-http(s) protocol: ${url.protocol}` };
  }
  if (isPrivateAddress(url.hostname)) {
    return { code: "SSRF_BLOCKED", detail: `private, loopback or metadata address: ${url.hostname}` };
  }
  if (!isAllowedHost(url.hostname)) {
    return { code: "SSRF_BLOCKED", detail: `host not on the egress allowlist: ${url.hostname}` };
  }
  return null;
}

function inspectSql(raw: unknown): PreflightFinding | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  if (DB_READ_COLUMN_DENYLIST.test(raw)) {
    return { code: "SQL_FORBIDDEN_COLUMN", detail: "query references a credential column" };
  }
  const denied = assertNoDeniedTable(raw);
  if (denied) {
    return { code: "SQL_FORBIDDEN_TABLE", detail: `query references the "${denied}" table` };
  }
  return null;
}

/**
 * Classify a tool call from its input alone.
 *
 * Returns the escalation code the adapter would have produced, or null when the
 * input carries no attack signal. Never throws: a pre-flight that can fail the
 * request it is inspecting would be a denial-of-service on the gateway itself.
 */
export function inspectToolInput(toolName: string, input: unknown): PreflightFinding | null {
  try {
    const args = (input ?? {}) as Record<string, unknown>;

    switch (toolName) {
      case "network.fetch":
      case "network.webhook":
        return inspectUrl(args.url);

      case "fs.read":
      case "fs.write":
      case "fs.delete":
      case "fs.execute":
        // Only a SUPPLIED path can be an escape attempt. isPathEscape() returns
        // true for a missing or non-string path because safePath() must reject
        // those, but a call that omits `path` entirely is a malformed request,
        // not an attack — classifying it would page on-call for typos.
        return typeof args.path === "string" && isPathEscape(args.path)
          ? { code: "FS_PATH_ESCAPE", detail: `path escapes the workspace sandbox: ${args.path.slice(0, 120)}` }
          : null;

      case "db.read":
      case "db.export":
        return inspectSql(args.query);

      case "shell.exec":
      case "shell.read":
        return typeof args.command === "string" && SHELL_METACHARS.test(args.command)
          ? { code: "COMMAND_REJECTED", detail: "shell metacharacters in command" }
          : null;

      default:
        return null;
    }
  } catch {
    // Inspection is best-effort telemetry. If it cannot classify the input, the
    // adapter's own check remains the enforcing control.
    return null;
  }
}
