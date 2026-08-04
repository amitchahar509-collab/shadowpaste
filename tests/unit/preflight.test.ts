// Pre-flight input inspection — pins the ask-gate ordering fix.
//
// Security classifiers lived only inside the tool adapters, and adapters only
// run when policy allows a call. So an attack aimed at a tool policy stopped
// earlier was contained but never CLASSIFIED. Observed live via MCP:
//
//   network.fetch http://169.254.169.254/  ->  "ask", risk 38/medium, no alert
//   fs.read ../../../../etc/passwd         ->  "allow_once", risk 5/low
//
// The inversion: the more trusted an agent, the better the telemetry, because
// only trusted agents got far enough to trip the real classifier.

import { describe, expect, test } from "bun:test";
import { inspectToolInput } from "@/lib/security/preflight";
import { GATEWAY_ESCALATION_CODES } from "@/lib/gateway";

describe("pre-flight classifies attacks from input alone", () => {
  test("SSRF targets", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1:3000/api/health",
      "http://10.0.0.5/internal",
      "http://192.168.1.1/",
      "http://[::1]/",
      "http://2852039166/", // decimal-encoded 169.254.169.254
    ]) {
      const r = inspectToolInput("network.fetch", { url });
      expect(r?.code).toBe("SSRF_BLOCKED");
    }
  });

  test("non-http protocols and non-allowlisted hosts", () => {
    expect(inspectToolInput("network.fetch", { url: "file:///etc/passwd" })?.code).toBe("SSRF_BLOCKED");
    expect(inspectToolInput("network.fetch", { url: "https://evil.example.com/x" })?.code).toBe("SSRF_BLOCKED");
  });

  test("path traversal", () => {
    for (const p of ["../../../../etc/passwd", "..\\..\\windows\\system32", "a/../../../b"]) {
      expect(inspectToolInput("fs.read", { path: p })?.code).toBe("FS_PATH_ESCAPE");
    }
    // An ABSOLUTE path is NOT an escape: safePath() strips the leading slash and
    // re-roots it inside the workspace, so "/etc/shadow" reads
    // <workspace>/etc/shadow and never the real file. Pre-flight has to agree
    // with the adapter here, or it would alert on every absolute path typed.
    expect(inspectToolInput("fs.read", { path: "/etc/shadow" })).toBeNull();
  });

  test("forbidden tables and credential columns", () => {
    expect(inspectToolInput("db.read", { query: 'SELECT email, "passwordHash" FROM "User"' })?.code).toBe("SQL_FORBIDDEN_COLUMN");
    expect(inspectToolInput("db.read", { query: 'SELECT u.email FROM "Agent", "User" u' })?.code).toBe("SQL_FORBIDDEN_TABLE");
  });

  test("shell metacharacters", () => {
    expect(inspectToolInput("shell.exec", { command: "cat /etc/passwd; rm -rf /" })?.code).toBe("COMMAND_REJECTED");
    expect(inspectToolInput("shell.exec", { command: "ls && whoami" })?.code).toBe("COMMAND_REJECTED");
  });
});

describe("pre-flight does not cry wolf", () => {
  test("legitimate inputs produce no finding", () => {
    expect(inspectToolInput("fs.read", { path: "package.json" })).toBeNull();
    expect(inspectToolInput("fs.read", { path: "src/lib/index.ts" })).toBeNull();
    expect(inspectToolInput("network.fetch", { url: "https://api.github.com/repos/a/b" })).toBeNull();
    expect(inspectToolInput("network.fetch", { url: "https://api.stripe.com/v1/charges" })).toBeNull();
    expect(inspectToolInput("db.read", { query: 'SELECT COUNT(*) FROM "AuditLog"' })).toBeNull();
    expect(inspectToolInput("shell.exec", { command: "ls -la" })).toBeNull();
  });

  test("unknown tools and junk input never throw", () => {
    for (const [tool, input] of [
      ["some.unknown.tool", { anything: 1 }],
      ["network.fetch", {}],
      ["network.fetch", { url: "not a url" }],
      ["fs.read", { path: 123 }],
      ["db.read", {}],
      ["shell.exec", { command: null }],
    ] as Array<[string, unknown]>) {
      expect(() => inspectToolInput(tool, input)).not.toThrow();
    }
    expect(inspectToolInput("network.fetch", null)).toBeNull();
    expect(inspectToolInput("fs.read", undefined)).toBeNull();
  });
});

describe("pre-flight agrees with the gateway", () => {
  test("every code it can emit is a known gateway escalation", () => {
    const emitted = [
      inspectToolInput("network.fetch", { url: "http://169.254.169.254/" })?.code,
      inspectToolInput("fs.read", { path: "../../etc/passwd" })?.code,
      inspectToolInput("db.read", { query: 'SELECT * FROM "User"' })?.code,
      inspectToolInput("db.read", { query: "SELECT password FROM x" })?.code,
      inspectToolInput("shell.exec", { command: "a; b" })?.code,
    ].filter(Boolean) as string[];
    expect(emitted.length).toBe(5);
    for (const code of emitted) {
      // An unmapped code would escalate nothing and page nobody — the exact
      // failure this module exists to remove.
      expect(GATEWAY_ESCALATION_CODES).toContain(code);
    }
  });

  test("it reuses the adapter's own predicates rather than copying them", async () => {
    const src = await Bun.file("src/lib/security/preflight.ts").text();
    expect(src).toContain('from "@/lib/tools/adapters"');
    for (const fn of ["isPrivateAddress", "isPathEscape", "assertNoDeniedTable", "DB_READ_COLUMN_DENYLIST", "SHELL_METACHARS"]) {
      expect(src).toContain(fn);
    }
    // No DNS in pre-flight: it must not turn a rejected call into a lookup.
    // Anchored on the import list — the header comment explains WHY assertSafeUrl
    // is excluded, so a naive substring check matches its own rationale.
    const importBlock = src.slice(src.indexOf("import {"), src.indexOf('from "@/lib/tools/adapters"'));
    expect(importBlock).not.toContain("assertSafeUrl");
  });
});
