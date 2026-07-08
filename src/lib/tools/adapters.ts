// ShadowPaste V19 — Real Tool Execution Adapters (Phase 3)
// Each adapter performs REAL side effects (filesystem, GitHub API, DB query)
// but ALWAYS through the gateway: risk -> policy -> credential injection ->
// execute -> audit (with secrets redacted).

import { promises as fs } from "fs";
import path from "path";
import { injectCredential, consumeCredential, redactSecrets, getCapabilityEngine } from "@/lib/security/vault";
import { db } from "@/lib/db";

const WORKSPACE_ROOT = path.resolve(process.cwd(), ".workspace");

async function ensureWorkspace(): Promise<string> {
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  return WORKSPACE_ROOT;
}

function safePath(p: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, p.replace(/^\//, ""));
  if (!resolved.startsWith(WORKSPACE_ROOT)) throw new Error(`Path escape attempt: ${p}`);
  return resolved;
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
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "filesystem", durationMs: Date.now() - start, error: (e as Error).message };
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
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "filesystem", durationMs: Date.now() - start, error: (e as Error).message };
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
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "filesystem", durationMs: Date.now() - start, error: (e as Error).message };
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
    const rows = await (db as unknown as { $queryRawUnsafe: (sql: string) => Promise<Array<{ name: string; type?: string } & Record<string, unknown>>> }).$queryRawUnsafe("SELECT name, type FROM sqlite_master WHERE type IN ('table','index','view') ORDER BY type, name");
    return { ok: true, output: { tables: rows, count: rows.length }, redactedOutput: JSON.stringify({ count: rows.length, tables: rows.slice(0, 50) }), adapter: "database", durationMs: Date.now() - start };
  } catch (e) {
    return { ok: false, output: { error: (e as Error).message }, redactedOutput: JSON.stringify({ error: (e as Error).message }), adapter: "database", durationMs: Date.now() - start, error: (e as Error).message };
  }
}

// ---- Dispatcher ----
export async function executeTool(toolName: string, input: Record<string, unknown>, opts: { sessionId: string; orgId?: string; _tokenOverride?: string }): Promise<ExecResult> {
  switch (toolName) {
    case "fs.read": return fsRead(input as { path: string });
    case "fs.write": return fsWrite(input as { path: string; content: string });
    case "fs.list": return fsList(input as { path?: string });
    case "github.read": return githubRead(input as { repo: string; path?: string }, opts);
    case "github.branch.create": return githubCreateBranch(input as { repo: string; branch: string; from?: string }, opts);
    case "github.commit": return githubCommit(input as { repo: string; branch: string; path: string; message: string; content: string }, opts);
    case "github.pr.create": return githubCreatePR(input as { repo: string; title: string; head: string; base?: string; body?: string }, opts);
    case "db.read": return dbQuery(input as { query: string });
    case "db.schema.inspect": return dbSchemaInspect(input);
    case "stripe.read": return stripeRead(input as { resource: string; id?: string }, opts);
    case "stripe.subscription": return stripeSubscription(input as { subscriptionId: string }, opts);
    default: return { ok: false, output: { error: `No real adapter for ${toolName}` }, redactedOutput: JSON.stringify({ error: `No real adapter for ${toolName}` }), adapter: "none", durationMs: 0 };
  }
}
