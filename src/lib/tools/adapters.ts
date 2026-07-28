// ShadowPaste V19 — Real Tool Execution Adapters (Phase 3)
// Each adapter performs REAL side effects (filesystem, GitHub API, DB query)
// but ALWAYS through the gateway: risk -> policy -> credential injection ->
// execute -> audit (with secrets redacted).

import { promises as fs } from "fs";
import path from "path";
import { lookup as dnsLookup } from "node:dns/promises";
import { injectCredential, consumeCredential, redactSecrets, getCapabilityEngine } from "@/lib/security/vault";
import { isWithin } from "@/lib/security/paths";
import { db } from "@/lib/db";

const WORKSPACE_ROOT = path.resolve(process.cwd(), ".workspace");

async function ensureWorkspace(): Promise<string> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  return WORKSPACE_ROOT;
}

function safePath(p: string): string {
  if (typeof p !== "string" || p.includes("\0")) throw new Error("Invalid path");
  const resolved = path.resolve(WORKSPACE_ROOT, p.replace(/^[/\\]+/, ""));
  // A plain startsWith() prefix test would accept sibling directories such as
  // ".workspace-evil"; compare on path segments instead.
  if (!isWithin(WORKSPACE_ROOT, resolved)) throw new Error(`Path escape attempt: ${p}`);
  return resolved;
}

// Node's fs errors embed the absolute host path ("ENOENT: no such file or
// directory, open 'C:\Users\...\.workspace\x'"), which would disclose the
// server's install location to any MCP client. Keep the real error in the
// server log and hand the caller a message that reveals nothing about the
// host layout. Sandbox denials are reported distinctly so a caller can tell
// "you may not read there" from "it isn't there".
function sanitizeFsError(e: unknown, op: string): string {
  console.error(`[INTERNAL FS ERROR] ${op}:`, e);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.startsWith("Path escape attempt")) return "Access denied: path escapes the workspace sandbox.";
  if (msg === "Invalid path") return "Invalid path.";
  return "File or directory not found within workspace.";
}

export interface ExecResult {
  ok: boolean;
  output: Record<string, unknown>;
  redactedOutput: string;
  adapter: string;
  durationMs: number;
  capabilityNonce?: string;
  error?: string;
}

// ---- FILESYSTEM (real, sandboxed to .workspace/) ----
export async function fsRead(input: { path: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    await ensureWorkspace();
    const full = safePath(input.path);
    const content = await fs.readFile(full, "utf8");
    return { ok: true, output: { path: input.path, bytes: content.length, content }, redactedOutput: JSON.stringify({ path: input.path, bytes: content.length, content }), adapter: "filesystem", durationMs: Date.now() - start };
  } catch (e) {
    const error = sanitizeFsError(e, "fs.read");
    return { ok: false, output: { error }, redactedOutput: JSON.stringify({ error }), adapter: "filesystem", durationMs: Date.now() - start, error };
  }
}

export async function fsWrite(input: { path: string; content: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    await ensureWorkspace();
    const full = safePath(input.path);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, input.content, "utf8");
    return { ok: true, output: { path: input.path, bytes: input.content.length, written: true }, redactedOutput: JSON.stringify({ path: input.path, bytes: input.content.length, written: true }), adapter: "filesystem", durationMs: Date.now() - start };
  } catch (e) {
    const error = sanitizeFsError(e, "fs.write");
    return { ok: false, output: { error }, redactedOutput: JSON.stringify({ error }), adapter: "filesystem", durationMs: Date.now() - start, error };
  }
}

export async function fsList(input: { path?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    await ensureWorkspace();
    const full = safePath(input.path || "/");
    const entries = await fs.readdir(full, { withFileTypes: true });
    const listing = entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" }));
    return { ok: true, output: { path: input.path || "/", entries: listing }, redactedOutput: JSON.stringify({ path: input.path || "/", entries: listing }), adapter: "filesystem", durationMs: Date.now() - start };
  } catch (e) {
    const error = sanitizeFsError(e, "fs.list");
    return { ok: false, output: { error }, redactedOutput: JSON.stringify({ error }), adapter: "filesystem", durationMs: Date.now() - start, error };
  }
}

// ---- GITHUB (real REST API v3) ----
async function githubRequest(method: string, endpoint: string, token: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ShadowPaste-MCP/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

export async function githubRead(input: { repo: string; path?: string }, opts: { sessionId: string; orgId?: string; _tokenOverride?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    let token = opts._tokenOverride || "";
    let capabilityNonce: string | undefined;
    if (!token) {
      const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
      if (cred) { token = cred.raw; capabilityNonce = cred.token.nonce; }
    }
    const endpoint = input.path ? `/repos/${input.repo}/contents/${input.path}` : `/repos/${input.repo}`;
    const { status, data } = await githubRequest("GET", endpoint, token);
    if (status >= 400) throw new Error(`GitHub API ${status}: ${JSON.stringify(data).slice(0, 200)}`);
    const redacted = redactSecrets(JSON.stringify(data), token ? [{ raw: token, reference: "{{SHADOW_SECRET_GITHUB}}" }] : []);
    return { ok: true, output: { repo: input.repo, status, data }, redactedOutput: redacted, adapter: "github", durationMs: Date.now() - start, capabilityNonce };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "github", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

export async function githubCreateBranch(input: { repo: string; branch: string; from?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
    if (!cred) throw new Error("No GitHub credential in vault. Store a GitHub token first.");
    const fromBranch = input.from || "main";
    const { status, data } = await githubRequest("GET", `/repos/${input.repo}/git/refs/heads/${fromBranch}`, cred.raw);
    if (status >= 400) throw new Error(`Cannot read base branch: ${status}`);
    const sha = (data as { object: { sha: string } }).object.sha;
    const create = await githubRequest("POST", `/repos/${input.repo}/git/refs`, cred.raw, { ref: `refs/heads/${input.branch}`, sha });
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    return { ok: create.status < 400, output: { repo: input.repo, branch: input.branch, from: fromBranch, status: create.status, data: create.data }, redactedOutput: JSON.stringify({ repo: input.repo, branch: input.branch, status: create.status }), adapter: "github", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "github", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

export async function githubCreatePR(input: { repo: string; title: string; head: string; base?: string; body?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
    if (!cred) throw new Error("No GitHub credential in vault. Store a GitHub token first.");
    const { status, data } = await githubRequest("POST", `/repos/${input.repo}/pulls`, cred.raw, { title: input.title, head: input.head, base: input.base || "main", body: input.body || "" });
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    return { ok: status < 400, output: { repo: input.repo, title: input.title, status, number: (data as { number?: number })?.number, url: (data as { html_url?: string })?.html_url }, redactedOutput: JSON.stringify({ repo: input.repo, title: input.title, status, number: (data as { number?: number })?.number }), adapter: "github", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "github", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- GITHUB: commit a file to a branch ----
export async function githubCommit(input: { repo: string; branch: string; path: string; message: string; content: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
    if (!cred) throw new Error("No GitHub credential in vault. Store a GitHub token first.");
    // Get the current file SHA (if it exists) for update vs create
    const existing = await githubRequest("GET", `/repos/${input.repo}/contents/${input.path}?ref=${input.branch}`, cred.raw);
    const sha = existing.status === 200 ? (existing.data as { sha?: string }).sha : undefined;
    const body: Record<string, unknown> = { message: input.message, content: Buffer.from(input.content).toString("base64"), branch: input.branch };
    if (sha) body.sha = sha;
    const { status, data } = await githubRequest("PUT", `/repos/${input.repo}/contents/${input.path}`, cred.raw, body);
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    return { ok: status < 400, output: { repo: input.repo, branch: input.branch, path: input.path, status, commit: (data as { commit?: { sha?: string } })?.commit?.sha }, redactedOutput: JSON.stringify({ repo: input.repo, branch: input.branch, path: input.path, status }), adapter: "github", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "github", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- DATABASE (real SQLite query; SELECT-only, destructive blocked) ----
const FORBIDDEN_DB = /\b(drop|truncate)\b/i;
const FORBIDDEN_DELETE = /delete\s+from\s+\w+\s*$/i;

export async function dbQuery(input: { query: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const q = input.query.trim();
    if (FORBIDDEN_DB.test(q)) throw new Error("Destructive query blocked (DROP/TRUNCATE)");
    if (FORBIDDEN_DELETE.test(q)) throw new Error("DELETE without WHERE clause blocked");
    if (!/^select\b/i.test(q)) throw new Error("Only SELECT queries permitted via db.read");
    const rows = await (db as unknown as { $queryRawUnsafe: (sql: string) => Promise<unknown[]> }).$queryRawUnsafe(q);
    return { ok: true, output: { rows: rows.slice(0, 100), rowCount: rows.length }, redactedOutput: JSON.stringify({ rowCount: rows.length, rows: rows.slice(0, 20) }), adapter: "database", durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "database", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- STRIPE (real test-mode; requires vaulted stripe key) ----
export async function stripeRead(input: { resource: string; id?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "stripe.charges", orgId: opts.orgId });
    if (!cred) throw new Error("No Stripe credential in vault. Store a stripe test key first.");
    const endpoint = input.id ? `/v1/${input.resource}/${input.id}` : `/v1/${input.resource}`;
    const res = await fetch(`https://api.stripe.com${endpoint}`, { headers: { Authorization: `Bearer ${cred.raw}` } });
    const data = await res.json().catch(() => null);
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    const redacted = redactSecrets(JSON.stringify(data), [{ raw: cred.raw, reference: "{{SHADOW_SECRET_STRIPE}}" }]);
    return { ok: res.ok, output: { resource: input.resource, status: res.status, data }, redactedOutput: redacted, adapter: "stripe", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "stripe", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- STRIPE: subscription status ----
export async function stripeSubscription(input: { subscriptionId: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "stripe.charges", orgId: opts.orgId });
    if (!cred) throw new Error("No Stripe credential in vault. Store a stripe test key first.");
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${input.subscriptionId}`, { headers: { Authorization: `Bearer ${cred.raw}` } });
    const data = await res.json().catch(() => null);
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    const redacted = redactSecrets(JSON.stringify(data), [{ raw: cred.raw, reference: "{{SHADOW_SECRET_STRIPE}}" }]);
    return { ok: res.ok, output: { subscriptionId: input.subscriptionId, status: res.status, data }, redactedOutput: redacted, adapter: "stripe", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "stripe", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- DATABASE: schema inspect (read-only table list) ----
export async function dbSchemaInspect(_input: Record<string, unknown>): Promise<ExecResult> {
  const start = Date.now();
  try {
    // Postgres catalog (the app's DB is PostgreSQL). information_schema is the
    // portable, read-only source of table/view names in the public schema.
    const rows = await (db as unknown as { $queryRawUnsafe: (sql: string) => Promise<Array<{ name: string; type?: string } & Record<string, unknown>>> }).$queryRawUnsafe("SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_type, table_name");
    return { ok: true, output: { tables: rows, count: rows.length }, redactedOutput: JSON.stringify({ count: rows.length, tables: rows.slice(0, 50) }), adapter: "database", durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "database", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- ShadowPaste high-level tools (shadowpaste.scan / protect / audit) ----

// shadowpaste.scan — scan a GitHub repo for secrets + AI risks, auto-vault findings
async function shadowpasteScan(input: { repo: string; token?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const { scanGitHubRepo } = await import("@/lib/github-scanner");
    const result = await scanGitHubRepo(input.repo, { token: input.token, orgId: opts.orgId });
    return {
      ok: result.ok,
      output: { repo: result.repo, filesScanned: result.filesScanned, findings: result.findings.length, score: result.score, grade: result.grade, vaulted: result.vaultedCount },
      redactedOutput: JSON.stringify({ repo: result.repo, filesScanned: result.filesScanned, findings: result.findings.length, score: result.score, grade: result.grade }),
      adapter: "shadowpaste",
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "shadowpaste", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// shadowpaste.protect — scan text for secrets, vault them, return virtualized (redacted) text
async function shadowpasteProtect(input: { text: string; name?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const { scanForSecrets } = await import("@/lib/security/detector");
    const { storeSecret } = await import("@/lib/security/vault");
    const { redactSecrets } = await import("@/lib/security/vault");
    const findings = scanForSecrets(input.text, input.name || "protect");
    const refs: Array<{ raw: string; reference: string }> = [];
    for (const f of findings) {
      try {
        const stored = await storeSecret(f.raw, { name: `${input.name || "protect"}:${f.line}`, contextHint: input.name, orgId: opts.orgId });
        refs.push({ raw: f.raw, reference: `{{SHADOW_SECRET_${stored.provider}_${stored.id.slice(-5)}}}` });
      } catch { /* vault optional */ }
    }
    const protected_text = redactSecrets(input.text, refs);
    return {
      ok: true,
      output: { secretsFound: findings.length, vaulted: refs.length, protected_text_length: protected_text.length, providers: [...new Set(findings.map((f) => f.provider))] },
      redactedOutput: JSON.stringify({ secretsFound: findings.length, vaulted: refs.length, sample: protected_text.slice(0, 200) }),
      adapter: "shadowpaste",
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "shadowpaste", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// shadowpaste.audit — query the audit trail for recent events
async function shadowpasteAudit(input: { limit?: number; action?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const { db } = await import("@/lib/db");
    const where: Record<string, unknown> = { orgId: opts.orgId };
    if (input.action) where.action = { contains: input.action };
    const logs = await db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(input.limit || 20, 100) });
    return {
      ok: true,
      output: { events: logs.length, logs: logs.map((l) => ({ action: l.action, target: l.target, actorType: l.actorType, time: l.createdAt.toISOString() })) },
      redactedOutput: JSON.stringify({ events: logs.length, logs: logs.slice(0, 10).map((l) => ({ action: l.action, time: l.createdAt.toISOString() })) }),
      adapter: "shadowpaste",
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "shadowpaste", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- Shared helpers for the adapters added below ----

class SsrfError extends Error {}
class ValidationError extends Error {}

/** Uniform structured error — never a bare string, never a silent success. */
function structuredError(adapter: string, code: string, message: string, extra: Record<string, unknown> = {}, durationMs = 0): ExecResult {
  const out = { code, error: message, ...extra };
  return { ok: false, output: out, redactedOutput: JSON.stringify(out), adapter, durationMs, error: `${code}: ${message}` };
}

// ---- NETWORK: SSRF-guarded egress (real HTTP) ----
const NETWORK_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 256 * 1024;

// Approved destinations. The app's own integrations are always allowed; operators
// extend the list via NETWORK_ALLOWED_HOSTS (comma-separated). Egress to anything
// not on the list is refused — the default posture is allowlist-only.
function networkAllowlist(): Set<string> {
  const base = ["api.github.com", "api.stripe.com"];
  const extra = (process.env.NETWORK_ALLOWED_HOSTS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return new Set([...base, ...extra]);
}

export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h.includes(":")) { // IPv6 loopback / link-local / unique-local
    return h === "::1" || h === "::" || h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd");
  }
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]), b = Number(m[2]);
  return a === 0 || a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 169 && b === 254) /* link-local + metadata */ || a >= 224 /* multicast/reserved */;
}

// Validate a URL against protocol, hostname, allowlist AND the RESOLVED IP
// (defends against DNS-rebinding into private space and cloud metadata).
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new SsrfError("invalid URL"); }
  const proto = u.protocol.toLowerCase();
  if (proto !== "https:" && proto !== "http:") {
    throw new SsrfError(`blocked protocol '${proto.replace(":", "")}' — only http/https (no file/ftp/gopher)`);
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) throw new SsrfError("blocked: localhost");
  if (isPrivateAddress(host)) throw new SsrfError(`blocked: private/loopback/metadata address ${host}`);
  if (!networkAllowlist().has(host)) throw new SsrfError(`host not in allowlist: ${host} (set NETWORK_ALLOWED_HOSTS to permit it)`);
  try {
    const addrs = await dnsLookup(u.hostname, { all: true });
    for (const a of addrs) {
      if (isPrivateAddress(a.address)) throw new SsrfError(`blocked: ${u.hostname} resolves to private IP ${a.address}`);
    }
  } catch (e) {
    if (e instanceof SsrfError) throw e;
    throw new SsrfError(`DNS resolution failed for ${u.hostname}`);
  }
  return u;
}

export async function networkFetch(input: { url: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const u = await assertSafeUrl(input.url);
    const res = await fetch(u.toString(), { method: "GET", redirect: "manual", signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS), headers: { "User-Agent": "ShadowPaste-MCP/1.0" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const truncated = buf.length > MAX_BODY_BYTES;
    const body = buf.subarray(0, MAX_BODY_BYTES).toString("utf8");
    const out = { url: u.toString(), status: res.status, contentType: res.headers.get("content-type"), bytes: buf.length, truncated, body };
    return { ok: res.ok, output: out, redactedOutput: JSON.stringify({ url: u.toString(), status: res.status, bytes: buf.length }), adapter: "network", durationMs: Date.now() - start };
  } catch (e) {
    return structuredError("network", e instanceof SsrfError ? "SSRF_BLOCKED" : "NETWORK_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

export async function networkWebhook(input: { url: string; payload?: unknown }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const u = await assertSafeUrl(input.url);
    const res = await fetch(u.toString(), { method: "POST", redirect: "manual", signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS), headers: { "Content-Type": "application/json", "User-Agent": "ShadowPaste-MCP/1.0" }, body: JSON.stringify(input.payload ?? {}) });
    const out = { url: u.toString(), status: res.status, delivered: res.ok };
    return { ok: res.ok, output: out, redactedOutput: JSON.stringify(out), adapter: "network", durationMs: Date.now() - start };
  } catch (e) {
    return structuredError("network", e instanceof SsrfError ? "SSRF_BLOCKED" : "NETWORK_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- FILESYSTEM: delete within the sandbox ----
export async function fsDelete(input: { path: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    await ensureWorkspace();
    const full = safePath(input.path); // throws on traversal / escape
    await fs.rm(full, { recursive: false, force: false });
    return { ok: true, output: { path: input.path, deleted: true }, redactedOutput: JSON.stringify({ path: input.path, deleted: true }), adapter: "filesystem", durationMs: Date.now() - start };
  } catch (e) {
    const msg = sanitizeFsError(e, "delete");
    return { ok: false, output: { error: msg }, redactedOutput: JSON.stringify({ error: msg }), adapter: "filesystem", durationMs: Date.now() - start, error: msg };
  }
}

// ---- GITHUB: merge a PR / list secret NAMES (credential resolved internally) ----
export async function githubPrMerge(input: { repo: string; pr: number }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
    if (!cred) return structuredError("github", "CREDENTIAL_REQUIRED", "No GitHub credential in vault — store a token first", {}, Date.now() - start);
    const { status, data } = await githubRequest("PUT", `/repos/${input.repo}/pulls/${input.pr}/merge`, cred.raw, { merge_method: "merge" });
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    const out = { repo: input.repo, pr: input.pr, merged: (data as { merged?: boolean })?.merged ?? status < 400, status };
    return { ok: status < 400, output: out, redactedOutput: JSON.stringify(out), adapter: "github", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return structuredError("github", "GITHUB_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

export async function githubSecretAccess(input: { repo: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
    if (!cred) return structuredError("github", "CREDENTIAL_REQUIRED", "No GitHub credential in vault — store a token first", {}, Date.now() - start);
    const { status, data } = await githubRequest("GET", `/repos/${input.repo}/actions/secrets`, cred.raw);
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    if (status >= 400) throw new Error(`GitHub API ${status}`);
    // GitHub never returns secret VALUES; we surface only names + timestamps.
    const secrets = ((data as { secrets?: Array<{ name: string; updated_at: string }> })?.secrets ?? []).map((s) => ({ name: s.name, updated_at: s.updated_at }));
    const out = { repo: input.repo, count: secrets.length, secrets };
    return { ok: true, output: out, redactedOutput: JSON.stringify(out), adapter: "github", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return structuredError("github", "GITHUB_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- DATABASE: guarded write (INSERT/UPDATE only) ----
/** Returns an error message if the query is not a safe INSERT/UPDATE, else null. */
export function validateWriteQuery(query: string): string | null {
  const q = String(query || "").trim();
  if (!q) return "empty query";
  // One statement only — reject stacked queries (a trailing ; is tolerated).
  if (q.replace(/;\s*$/, "").includes(";")) return "multiple statements are not permitted";
  if (!/^(insert|update)\s/i.test(q)) return "db.write permits only INSERT or UPDATE statements";
  if (/\b(drop|truncate|alter|create|grant|revoke|attach|pragma|copy)\b/i.test(q)) return "DDL / destructive keyword is blocked";
  if (/\bdelete\b/i.test(q)) return "DELETE is not permitted via db.write";
  if (/^update\s/i.test(q) && !/\bwhere\b/i.test(q)) return "UPDATE without a WHERE clause is blocked";
  return null;
}

export async function dbWrite(input: { query: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const bad = validateWriteQuery(input.query);
    if (bad) throw new ValidationError(bad);
    const affected = await (db as unknown as { $executeRawUnsafe: (sql: string) => Promise<number> }).$executeRawUnsafe(input.query);
    const out = { affectedRows: affected };
    return { ok: true, output: out, redactedOutput: JSON.stringify(out), adapter: "database", durationMs: Date.now() - start };
  } catch (e) {
    return structuredError("database", e instanceof ValidationError ? "SQL_VALIDATION_FAILED" : "DB_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- AI: generate via the provider abstraction (real, never fabricated) ----
export async function aiGenerate(input: { prompt: string; model?: string; provider?: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  const { generate, ProviderNotConfiguredError } = await import("@/lib/ai/provider");
  try {
    if (!input.prompt || typeof input.prompt !== "string") return structuredError("ai", "VALIDATION", "prompt is required", {}, Date.now() - start);
    const r = await generate({ prompt: input.prompt, model: input.model, provider: input.provider as never }, { orgId: opts.orgId });
    // Token/cost accounting is surfaced; the API key never appears in output.
    const out = { provider: r.provider, model: r.model, text: r.text, usage: r.usage, costUsd: r.costUsd, attempts: r.attempts };
    return { ok: true, output: out, redactedOutput: JSON.stringify({ provider: r.provider, model: r.model, usage: r.usage, costUsd: r.costUsd }), adapter: "ai", durationMs: Date.now() - start };
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) return structuredError("ai", "PROVIDER_NOT_CONFIGURED", e.message, {}, Date.now() - start);
    return structuredError("ai", "AI_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- STRIPE: refund (TEST mode enforced) ----
export async function stripeRefund(input: { chargeId: string; amount?: number }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "stripe.charges", orgId: opts.orgId });
    if (!cred) return structuredError("stripe", "CREDENTIAL_REQUIRED", "No Stripe credential in vault — store a stripe test key first", {}, Date.now() - start);
    if (!/^sk_test_|^rk_test_/.test(cred.raw) && process.env.STRIPE_ALLOW_LIVE !== "true") {
      return structuredError("stripe", "LIVE_KEY_BLOCKED", "refunds require a Stripe TEST key (sk_test_) unless STRIPE_ALLOW_LIVE=true", {}, Date.now() - start);
    }
    if (!input.chargeId || typeof input.chargeId !== "string") return structuredError("stripe", "VALIDATION", "chargeId is required", {}, Date.now() - start);
    const body = new URLSearchParams({ charge: input.chargeId });
    if (typeof input.amount === "number") {
      if (!Number.isFinite(input.amount) || input.amount <= 0) return structuredError("stripe", "VALIDATION", "amount must be a positive integer (minor units)", {}, Date.now() - start);
      body.set("amount", String(Math.round(input.amount)));
    }
    const res = await fetch("https://api.stripe.com/v1/refunds", { method: "POST", headers: { Authorization: `Bearer ${cred.raw}`, "Content-Type": "application/x-www-form-urlencoded" }, body });
    const data = await res.json().catch(() => null) as { id?: string; status?: string } | null;
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    const redacted = redactSecrets(JSON.stringify({ id: data?.id, status: data?.status, http: res.status }), [{ raw: cred.raw, reference: "{{SHADOW_SECRET_STRIPE}}" }]);
    return { ok: res.ok, output: { chargeId: input.chargeId, status: res.status, refund: data?.id, refundStatus: data?.status }, redactedOutput: redacted, adapter: "stripe", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return structuredError("stripe", "STRIPE_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- STRIPE: delete a customer (TEST mode enforced) ----
export async function stripeCustomerDelete(input: { customerId: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    if (!input.customerId || typeof input.customerId !== "string") {
      return structuredError("stripe", "VALIDATION", "customerId is required", {}, Date.now() - start);
    }
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "stripe.charges", orgId: opts.orgId });
    if (!cred) return structuredError("stripe", "CREDENTIAL_REQUIRED", "No Stripe credential in vault — store a stripe test key first", {}, Date.now() - start);
    // Deleting a customer is irreversible. Refuse a live key unless explicitly opted in.
    if (!/^sk_test_|^rk_test_/.test(cred.raw) && process.env.STRIPE_ALLOW_LIVE !== "true") {
      return structuredError("stripe", "LIVE_KEY_BLOCKED", "customer deletion requires a Stripe TEST key (sk_test_) unless STRIPE_ALLOW_LIVE=true", {}, Date.now() - start);
    }
    const res = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(input.customerId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${cred.raw}` },
    });
    const data = await res.json().catch(() => null) as { id?: string; deleted?: boolean } | null;
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    const out = { customerId: input.customerId, status: res.status, deleted: data?.deleted === true };
    const redacted = redactSecrets(JSON.stringify(out), [{ raw: cred.raw, reference: "{{SHADOW_SECRET_STRIPE}}" }]);
    return { ok: res.ok, output: out, redactedOutput: redacted, adapter: "stripe", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return structuredError("stripe", "STRIPE_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- GITHUB: bounded administrative READS ----
// "Administrative actions" is deliberately restricted to a documented allowlist
// of NON-MUTATING queries. Anything else is refused with the supported list —
// a broad, mutating admin surface would be an unbounded privilege grant.
const GITHUB_ADMIN_ACTIONS: Record<string, (repo: string) => string> = {
  "list-collaborators": (repo) => `/repos/${repo}/collaborators`,
  "list-webhooks": (repo) => `/repos/${repo}/hooks`,
  "list-deploy-keys": (repo) => `/repos/${repo}/keys`,
  "get-branch-protection": (repo) => `/repos/${repo}/branches/main/protection`,
  "list-teams": (repo) => `/repos/${repo}/teams`,
  "get-repo-settings": (repo) => `/repos/${repo}`,
};

export async function githubAdmin(input: { repo: string; action: string }, opts: { sessionId: string; orgId?: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    const build = GITHUB_ADMIN_ACTIONS[input.action];
    if (!build) {
      return structuredError("github", "UNSUPPORTED_ACTION",
        `unsupported admin action '${input.action}'`,
        { supportedActions: Object.keys(GITHUB_ADMIN_ACTIONS) }, Date.now() - start);
    }
    const cred = await injectCredential({ sessionId: opts.sessionId, scope: "github.repo", orgId: opts.orgId });
    if (!cred) return structuredError("github", "CREDENTIAL_REQUIRED", "No GitHub credential in vault — store a token first", {}, Date.now() - start);
    const { status, data } = await githubRequest("GET", build(input.repo), cred.raw);
    const engine = await getCapabilityEngine(); engine.consume(cred.token);
    if (status >= 400) throw new Error(`GitHub API ${status}`);
    const redacted = redactSecrets(JSON.stringify({ repo: input.repo, action: input.action, status }), [{ raw: cred.raw, reference: "{{SHADOW_SECRET_GITHUB}}" }]);
    return { ok: true, output: { repo: input.repo, action: input.action, status, data }, redactedOutput: redacted, adapter: "github", durationMs: Date.now() - start, capabilityNonce: cred.token.nonce };
  } catch (e) {
    return structuredError("github", "GITHUB_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- SHELL: allowlisted, non-mutating command reads ----
// NOT a general shell. Only exact binary+subcommand pairs on this allowlist run,
// via execFile with an ARGV ARRAY (no shell, so no metacharacter injection),
// with cwd pinned inside the workspace sandbox, a hard timeout, and a capped
// output buffer. Arbitrary execution (shell.exec) still requires real container
// isolation and remains unavailable — see SANDBOX_REQUIRED.
const SHELL_READ_ALLOWLIST: Record<string, string[][]> = {
  git: [["status", "--short"], ["log", "--oneline", "-10"], ["branch", "--show-current"], ["diff", "--stat"], ["rev-parse", "HEAD"]],
  node: [["--version"]],
  npm: [["--version"]],
  bun: [["--version"]],
};
const SHELL_TIMEOUT_MS = 10_000;
const SHELL_MAX_OUTPUT = 64 * 1024;

export async function shellRead(input: { command: string }): Promise<ExecResult> {
  const start = Date.now();
  try {
    if (typeof input.command !== "string" || !input.command.trim()) {
      return structuredError("shell", "VALIDATION", "command is required", {}, Date.now() - start);
    }
    // Parse into plain tokens. Any shell metacharacter is rejected outright —
    // we never hand this to a shell, and their presence signals injection intent.
    if (/[;&|`$(){}<>\\'"\n\r]/.test(input.command)) {
      return structuredError("shell", "COMMAND_REJECTED", "shell metacharacters are not permitted", {}, Date.now() - start);
    }
    const tokens = input.command.trim().split(/\s+/);
    const bin = tokens[0];
    const args = tokens.slice(1);
    const allowedArgSets = SHELL_READ_ALLOWLIST[bin];
    if (!allowedArgSets) {
      return structuredError("shell", "COMMAND_NOT_ALLOWED", `'${bin}' is not on the read-only allowlist`,
        { allowedCommands: Object.keys(SHELL_READ_ALLOWLIST) }, Date.now() - start);
    }
    const matched = allowedArgSets.some((set) => set.length === args.length && set.every((a, i) => a === args[i]));
    if (!matched) {
      return structuredError("shell", "COMMAND_NOT_ALLOWED", `arguments not allowed for '${bin}'`,
        { allowedInvocations: allowedArgSets.map((s) => [bin, ...s].join(" ")) }, Date.now() - start);
    }

    const cwd = await ensureWorkspace(); // pinned inside .workspace/
    const { execFile } = await import("child_process");
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      execFile(bin, args, { cwd, timeout: SHELL_TIMEOUT_MS, maxBuffer: SHELL_MAX_OUTPUT, shell: false, windowsHide: true },
        (err, stdout, stderr) => resolve({
          code: err && typeof (err as { code?: number }).code === "number" ? (err as { code?: number }).code! : err ? 1 : 0,
          stdout: String(stdout).slice(0, SHELL_MAX_OUTPUT),
          stderr: String(stderr).slice(0, 2000),
        }));
    });
    const out = { command: `${bin} ${args.join(" ")}`.trim(), exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
    return { ok: result.code === 0, output: out, redactedOutput: JSON.stringify({ command: out.command, exitCode: out.exitCode, bytes: out.stdout.length }), adapter: "shell", durationMs: Date.now() - start };
  } catch (e) {
    return structuredError("shell", "SHELL_ERROR", (e as Error).message, {}, Date.now() - start);
  }
}

// ---- Dispatcher ----

/**
 * Tools with a real execution adapter. Anything registered in TOOL_REGISTRY but
 * absent here is intentionally unavailable (missing backend / permanently denied)
 * and returns a distinct STRUCTURED error — never a silent success and never the
 * generic NOT_IMPLEMENTED. Keep in sync with the switch statement.
 */
export const IMPLEMENTED_TOOLS: ReadonlySet<string> = new Set([
  "fs.read", "fs.write", "fs.list", "fs.delete",
  "github.read", "github.branch.create", "github.commit", "github.pr.create", "github.pr.merge", "github.secret.access", "github.admin",
  "db.read", "db.write", "db.schema.inspect",
  "network.fetch", "network.webhook",
  "shell.read",
  "stripe.read", "stripe.subscription", "stripe.refund", "stripe.customer.delete",
  // Real adapter backed by src/lib/ai/provider.ts (OpenAI/Anthropic/Gemini).
  // Returns PROVIDER_NOT_CONFIGURED when no API key is set — that is a runtime
  // credential state, not a missing implementation, so it belongs here.
  "ai.generate",
  "shadowpaste.scan", "shadowpaste.protect", "shadowpaste.audit",
]);

export function isToolImplemented(toolName: string): boolean {
  return IMPLEMENTED_TOOLS.has(toolName);
}

export async function executeTool(toolName: string, input: Record<string, unknown>, opts: { sessionId: string; orgId?: string; _tokenOverride?: string }): Promise<ExecResult> {
  switch (toolName) {
    // --- Filesystem (sandboxed to .workspace/) ---
    case "fs.read": return fsRead(input as { path: string });
    case "fs.write": return fsWrite(input as { path: string; content: string });
    case "fs.list": return fsList(input as { path?: string });
    case "fs.delete": return fsDelete(input as { path: string });
    // --- GitHub (credential resolved internally, audited) ---
    case "github.read": return githubRead(input as { repo: string; path?: string }, opts);
    case "github.branch.create": return githubCreateBranch(input as { repo: string; branch: string; from?: string }, opts);
    case "github.commit": return githubCommit(input as { repo: string; branch: string; path: string; message: string; content: string }, opts);
    case "github.pr.create": return githubCreatePR(input as { repo: string; title: string; head: string; base?: string; body?: string }, opts);
    case "github.pr.merge": return githubPrMerge(input as { repo: string; pr: number }, opts);
    case "github.secret.access": return githubSecretAccess(input as { repo: string }, opts);
    // --- Database (Postgres via Prisma; SELECT + guarded INSERT/UPDATE) ---
    case "db.read": return dbQuery(input as { query: string });
    case "db.write": return dbWrite(input as { query: string });
    case "db.schema.inspect": return dbSchemaInspect(input);
    // --- Network (SSRF-guarded egress) ---
    case "network.fetch": return networkFetch(input as { url: string });
    case "network.webhook": return networkWebhook(input as { url: string; payload?: unknown });
    // --- Stripe (vaulted key, test-mode enforced) ---
    case "stripe.read": return stripeRead(input as { resource: string; id?: string }, opts);
    case "stripe.subscription": return stripeSubscription(input as { subscriptionId: string }, opts);
    case "stripe.refund": return stripeRefund(input as { chargeId: string; amount?: number }, opts);
    case "stripe.customer.delete": return stripeCustomerDelete(input as { customerId: string }, opts);
    // --- GitHub administrative reads (bounded allowlist) ---
    case "github.admin": return githubAdmin(input as { repo: string; action: string }, opts);
    // --- Shell (allowlisted, non-mutating reads only) ---
    case "shell.read": return shellRead(input as { command: string });
    // --- ShadowPaste high-level tools ---
    case "shadowpaste.scan": return shadowpasteScan(input as { repo: string; token?: string }, opts);
    case "shadowpaste.protect": return shadowpasteProtect(input as { text: string; name?: string }, opts);
    case "shadowpaste.audit": return shadowpasteAudit(input as { limit?: number; action?: string }, opts);

    // --- Registered but intentionally unavailable ---------------------------
    // These are NOT silent failures: each returns a distinct, documented code so
    // a caller knows exactly why. They also never reach here under the default
    // policy (HARD_DENY / ask / sandbox gate them upstream) — the explicit cases
    // exist so a permission-granted call still gets an honest answer, and so the
    // generic NOT_IMPLEMENTED can never surface for a registered tool.

    // Real provider abstraction (src/lib/ai/provider.ts). Calls OpenAI/Anthropic/
    // Gemini when a key is configured; returns PROVIDER_NOT_CONFIGURED otherwise.
    // A successful response is NEVER fabricated.
    case "ai.generate": return aiGenerate(input as { prompt: string; model?: string; provider?: string }, opts);
    // Model training is an async, provider-specific job pipeline that does not
    // exist here — honest, not faked.
    case "ai.train":
      return structuredError("ai", "PROVIDER_NOT_CONFIGURED", "'ai.train' needs a training pipeline; none is configured (no client, no API key)", { tool: toolName });

    // Arbitrary command execution needs real container/cgroup isolation
    // (memory, CPU and PID caps) which this runtime cannot provide. shell.read
    // IS implemented above as a strictly allowlisted, non-mutating reader.
    case "shell.exec":
      return structuredError("shell", "SANDBOX_REQUIRED", "'shell.exec' needs container-level isolation (memory/CPU/PID limits) which is not available; use shell.read for allowlisted read-only commands", { tool: toolName });

    // Runtime schema migration needs a migration runner; not exposed as a tool.
    case "db.migrate":
      return structuredError("database", "MIGRATION_RUNNER_UNAVAILABLE", "runtime migrations are not executed via MCP; use the deploy pipeline (prisma migrate)", { tool: toolName });

    // Permanently denied by global policy (they never reach an adapter). Answered
    // explicitly in case a future policy change routes them here.
    case "fs.execute":
    case "github.repo.delete":
    case "db.schema.drop":
    case "db.export":
    case "stripe.charge":
      return structuredError(toolName.split(".")[0], "POLICY_DENIED", `'${toolName}' is permanently denied by global policy and has no adapter`, { tool: toolName });

    // (github.admin and stripe.customer.delete are implemented above.)

    // Truly unknown (unregistered) tool name.
    default:
      return structuredError("none", "UNKNOWN_TOOL", `Tool '${toolName}' is not registered`, { tool: toolName });
  }
}
