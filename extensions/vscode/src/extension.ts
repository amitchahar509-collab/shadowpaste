// ShadowPaste — VS Code extension entry point.
//
// Three commands:
//   1. shadowpaste.scanWorkspace — scans every open text document in the
//      workspace LOCALLY using the byte-identical detector port
//      (./detector.ts ≡ src/lib/security/detector.ts) and renders the
//      findings in a Webview panel with the SAME trust score + grade formula
//      the backend uses (computeTrustScore / scoreToGrade in
//      src/lib/scanner.ts). The V20 backend's /api/scan is GitHub-specific
//      (scanGitHubRepo calls api.github.com/repos/${owner}/${name}); it does
//      NOT accept arbitrary workspace content, so we scan locally and stay
//      honest about what was actually scanned.
//   2. shadowpaste.protectSecrets — runs the LOCAL copy of the @shadowpaste
//      detector (./detector.ts, byte-identical to src/lib/security/detector.ts)
//      on the active document, replaces each secret with a
//      `{{SHADOW_SECRET_*}}` reference, and POSTs each raw secret to
//      {serverUrl}/api/vault for encrypted at-rest storage.
//   3. shadowpaste.connectMcp — GET {serverUrl}/api/mcp-config and show the
//      result in an info message.
//
// All HTTP calls read `serverUrl` from vscode.workspace.getConfiguration.
// No absolute URL is hardcoded in the request paths.
//
// This is a scaffold: `tsc -p .` will compile it cleanly once
// `@types/vscode` + `@types/node` are installed (npm install). We do not
// bundle a node_modules folder — see README for build instructions.

import * as vscode from "vscode";
import { virtualizeText, scanForSecrets, type SecretFinding } from "./detector";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("shadowpaste.scanWorkspace", () =>
      scanWorkspaceCommand(context)
    ),
    vscode.commands.registerCommand("shadowpaste.protectSecrets", () =>
      protectSecretsCommand(context)
    ),
    vscode.commands.registerCommand("shadowpaste.connectMcp", () =>
      connectMcpCommand()
    )
  );
  console.info("[ShadowPaste] extension activated.");
}

export function deactivate(): void {
  /* no-op */
}

// ---------------------------------------------------------------------------
// Config helpers (exported so the Cursor sibling extension can reuse them)
// ---------------------------------------------------------------------------

export interface ShadowConfig {
  serverUrl: string;
  apiKey: string;
}

export function readConfig(): ShadowConfig {
  const cfg = vscode.workspace.getConfiguration("shadowpaste");
  const serverUrl = (cfg.get<string>("serverUrl") || "http://localhost:3000")
    .trim()
    .replace(/\/+$/, "");
  const apiKey = (cfg.get<string>("apiKey") || "").trim();
  return { serverUrl, apiKey };
}

function authHeaders(cfg: ShadowConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) h["Authorization"] = `Bearer ${cfg.apiKey}`;
  return h;
}

async function postJson<T = unknown>(
  cfg: ShadowConfig,
  path: string,
  body: unknown
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(`${cfg.serverUrl}${path}`, {
      method: "POST",
      headers: authHeaders(cfg),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const errMsg =
        (data && typeof data === "object" && "error" in data
          ? String((data as Record<string, unknown>).error)
          : `HTTP ${res.status}`) || `HTTP ${res.status}`;
      return { ok: false, error: errMsg, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getJson<T = unknown>(
  cfg: ShadowConfig,
  path: string
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  try {
    const res = await fetch(`${cfg.serverUrl}${path}`, {
      method: "GET",
      headers: authHeaders(cfg),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      return {
        ok: false,
        error:
          (data && typeof data === "object" && "error" in data
            ? String((data as Record<string, unknown>).error)
            : `HTTP ${res.status}`) || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// 1. scanWorkspace
// ---------------------------------------------------------------------------

interface ScanFinding {
  type: string;
  severity: string;
  file?: string;
  line?: number;
  message?: string;
  evidence?: string;
  provider?: string;
}

interface ScanResponse {
  ok?: boolean;
  projectId?: string;
  scanId?: string;
  repoUrl?: string;
  repoName?: string;
  files?: string[];
  findings?: ScanFinding[];
  score?: number;
  grade?: string;
  secretsCount?: number;
  riskyFiles?: number;
  securityIssues?: number;
}

async function scanWorkspaceCommand(
  context: vscode.ExtensionContext
): Promise<void> {
  const cfg = readConfig();
  // Gather every open text document in the workspace.
  const docs = vscode.workspace.textDocuments.filter(
    (d) => d.uri.scheme === "file" && d.languageId !== "git" && d.languageId !== "search-result"
  );
  if (docs.length === 0) {
    vscode.window.showWarningMessage(
      "ShadowPaste: no open workspace documents to scan."
    );
    return;
  }

  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  status.text = "$(sync~spin) ShadowPaste: scanning workspace…";
  status.show();

  // The V20 backend's /api/scan is GitHub-specific (scanGitHubRepo calls
  // api.github.com/repos/${owner}/${name}); it does NOT accept arbitrary
  // workspace content. So we scan each open document LOCALLY using the
  // SAME detector as the backend (src/detector.ts is a byte-identical port
  // of src/lib/security/detector.ts — the Phase 1 invariant "the same
  // secret behaves the same everywhere" still holds) and apply the SAME
  // trust-score + grade formula the backend uses (computeTrustScore +
  // scoreToGrade in src/lib/scanner.ts). The result is what the backend
  // would produce if it had these files in a GitHub repo.
  try {
    const findings: ScanFinding[] = [];
    const scannedPaths: string[] = [];
    const riskyFiles = new Set<string>();
    for (const d of docs) {
      const path = vscode.workspace.asRelativePath(d.uri);
      scannedPaths.push(path);
      const text = d.getText();
      const localFindings = scanForSecrets(text, path);
      for (const f of localFindings) {
        findings.push({
          type: f.type,
          severity: f.severity,
          file: path,
          line: f.line,
          message: `${f.provider} ${f.detector}`,
          evidence: f.masked,
          provider: f.provider,
        });
        riskyFiles.add(path);
      }
    }
    const secretsCount = findings.length;
    // Mirror src/lib/scanner.ts::computeTrustScore exactly:
    //   deductions = { critical: 25, high: 12, medium: 5, low: 2 }
    const deductions: Record<string, number> = { critical: 25, high: 12, medium: 5, low: 2 };
    let score = 100;
    for (const f of findings) score -= deductions[f.severity] ?? 0;
    score = Math.max(0, Math.min(100, score));
    // Mirror src/lib/scanner.ts::scoreToGrade exactly:
    //   A+ >=95, A >=90, B >=80, C >=70, D >=60, F <60
    const grade =
      score >= 95 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
    const securityIssues = findings.filter(
      (f) => f.severity === "high" || f.severity === "critical"
    ).length;
    const data: ScanResponse = {
      ok: true,
      repoUrl: "vscode-workspace",
      repoName: "vscode-workspace",
      files: scannedPaths,
      findings,
      secretsCount,
      riskyFiles: riskyFiles.size,
      securityIssues,
      score,
      grade,
    };
    showScanPanel(context, cfg, data, docs);
  } finally {
    status.dispose();
  }
}

function showScanPanel(
  context: vscode.ExtensionContext,
  cfg: ShadowConfig,
  scan: ScanResponse,
  docs: readonly vscode.TextDocument[]
): void {
  const panel = vscode.window.createWebviewPanel(
    "shadowpasteScan",
    `ShadowPaste — Workspace Scan`,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const findings = scan.findings || [];
  const score = scan.score ?? 0;
  const grade = scan.grade ?? "—";
  const color =
    score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";

  const rows = findings
    .map((f) => {
      const sevColor =
        f.severity === "critical"
          ? "#ef4444"
          : f.severity === "high"
          ? "#f97316"
          : f.severity === "medium"
          ? "#f59e0b"
          : "#94a3b8";
      return `<tr>
        <td><span class="sev" style="background:${sevColor}">${escapeHtml(
        f.severity || "low"
      )}</span></td>
        <td>${escapeHtml(f.type || "")}</td>
        <td>${escapeHtml(f.provider || "—")}</td>
        <td>${escapeHtml(f.file || "—")}</td>
        <td>${f.line ?? "—"}</td>
        <td><code>${escapeHtml(f.evidence || f.message || "")}</code></td>
      </tr>`;
    })
    .join("");

  panel.webview.html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<style>
  body{font:13px system-ui,-apple-system,sans-serif;background:#0a0e14;color:#e5e7eb;padding:18px}
  h1{font-size:18px;margin:0 0 4px}
  .meta{color:#94a3b8;font-size:12px;margin-bottom:16px}
  .card{display:inline-block;background:#11161f;border:1px solid #1f2937;border-radius:12px;padding:14px 18px;margin:4px 12px 4px 0}
  .score{font-size:34px;font-weight:800;color:${color}}
  .grade{font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:${color};color:#06120c;margin-left:8px}
  table{width:100%;border-collapse:collapse;margin-top:14px;background:#11161f;border:1px solid #1f2937;border-radius:10px;overflow:hidden}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid #1f2937;vertical-align:top}
  th{color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.6px}
  .sev{display:inline-block;padding:2px 8px;border-radius:6px;color:#0a0e14;font-weight:700;font-size:10px;text-transform:uppercase}
  code{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;background:#0a0e14;padding:2px 6px;border-radius:4px;color:#cbd5e1}
  a{color:#0ea5e9}
</style></head><body>
  <h1>ShadowPaste — Workspace Scan</h1>
  <div class="meta">${docs.length} document(s) scanned locally (detector ≡ <code>src/lib/security/detector.ts</code>) · vault at <code>${escapeHtml(
    cfg.serverUrl
  )}/api/vault</code>${
    scan.scanId ? ` · scanId ${scan.scanId}` : ""
  }</div>
  <div class="card"><div class="meta">Trust score</div><div class="score">${score}<span class="grade">${escapeHtml(
    grade
  )}</span></div></div>
  <div class="card"><div class="meta">Secrets</div><div class="score" style="font-size:24px">${
    scan.secretsCount ?? 0
  }</div></div>
  <div class="card"><div class="meta">Findings</div><div class="score" style="font-size:24px">${findings.length}</div></div>
  <div class="card"><div class="meta">Risky files</div><div class="score" style="font-size:24px">${
    scan.riskyFiles ?? 0
  }</div></div>
  <table>
    <thead><tr><th>Severity</th><th>Type</th><th>Provider</th><th>File</th><th>Line</th><th>Evidence</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="color:#94a3b8;text-align:center">No findings.</td></tr>`}</tbody>
  </table>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// 2. protectSecrets
// ---------------------------------------------------------------------------

interface VaultStoreResponse {
  ok?: boolean;
  secret?: {
    id: string;
    name: string | null;
    provider: string;
    scope: string;
    masked: string;
  };
}

async function protectSecretsCommand(
  _context: vscode.ExtensionContext
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      "ShadowPaste: open a text document first."
    );
    return;
  }
  const cfg = readConfig();
  const doc = editor.document;
  const text = doc.getText();

  // Run the SAME detector as the backend (local copy of detector.ts).
  const v = virtualizeText(text, { mode: "PROTECT", salt: doc.uri.fsPath });
  if (v.count === 0) {
    vscode.window.showInformationMessage(
      "ShadowPaste: no secrets detected in this document."
    );
    return;
  }

  // Step 1: POST each raw secret to /api/vault for encrypted at-rest storage.
  // Deduplicate by raw value so the same secret isn't stored twice.
  const seenRaw = new Set<string>();
  const stored: Array<{ reference: string; provider: string; ok: boolean; id?: string; error?: string }> = [];
  for (const r of v.raws) {
    if (seenRaw.has(r.raw)) continue;
    seenRaw.add(r.raw);
    const res = await postJson<VaultStoreResponse>(cfg, "/api/vault", {
      raw: r.raw,
      name: `${vscode.workspace.asRelativePath(doc.uri)}:${doc.fileName}`,
      contextHint: vscode.workspace.asRelativePath(doc.uri),
    });
    if (res.ok) {
      stored.push({
        reference: r.reference,
        provider: r.provider,
        ok: true,
        id: res.data.secret?.id,
      });
    } else {
      stored.push({
        reference: r.reference,
        provider: r.provider,
        ok: false,
        error: res.error,
      });
    }
  }

  // Step 2: replace the secrets in the document with their references.
  // We use the virtualized text (already computed) — a single edit replaces
  // the whole document so the editor's undo stack stays sane.
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(0, 0, doc.lineCount, 0),
    v.text
  );
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    vscode.window.showErrorMessage(
      "ShadowPaste: could not apply redaction edit to the document."
    );
    return;
  }

  // Step 3: report.
  const okCount = stored.filter((s) => s.ok).length;
  const failCount = stored.length - okCount;
  const msg =
    `ShadowPaste: virtualized ${v.count} secret(s) into ` +
    `${stored.length} unique vault entr${stored.length === 1 ? "y" : "ies"} ` +
    `(${okCount} stored, ${failCount} failed).`;
  if (failCount > 0) {
    vscode.window.showWarningMessage(
      msg + " Failures: " + stored.filter((s) => !s.ok).map((s) => s.error).join("; ")
    );
  } else {
    vscode.window.showInformationMessage(msg);
  }

  // Diagnostic decorations so the user can see which lines changed.
  const findings: SecretFinding[] = scanForSecrets(text, doc.uri.fsPath);
  showFindingsDiagnostics(doc, findings);
}

const DIAGNOSTIC_COLLECTION =
  vscode.languages.createDiagnosticCollection("shadowpaste");

function showFindingsDiagnostics(
  doc: vscode.TextDocument,
  findings: SecretFinding[]
): void {
  const diags = findings.map((f) => {
    const range = new vscode.Range(
      Math.max(0, f.line - 1),
      Math.max(0, f.column - 1),
      Math.max(0, f.line - 1),
      Math.max(0, f.column - 1) + f.raw.length
    );
    const severity =
      f.severity === "critical"
        ? vscode.DiagnosticSeverity.Error
        : f.severity === "high"
        ? vscode.DiagnosticSeverity.Error
        : f.severity === "medium"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;
    const d = new vscode.Diagnostic(
      range,
      `ShadowPaste: ${f.provider} ${f.detector} — virtualized`,
      severity
    );
    d.source = "shadowpaste";
    return d;
  });
  DIAGNOSTIC_COLLECTION.set(doc.uri, diags);
}

// ---------------------------------------------------------------------------
// 3. connectMcp
// ---------------------------------------------------------------------------

export interface McpConfigResponse {
  server?: { name?: string; protocolVersion?: string };
  configs?: Record<
    string,
    | { mcpServers?: Record<string, Record<string, unknown>> }
    | { command?: string; args?: string[] }
  >;
  instructions?: string[];
}

async function connectMcpCommand(): Promise<void> {
  const cfg = readConfig();
  const res = await getJson<McpConfigResponse>(cfg, "/api/mcp-config");
  if (!res.ok) {
    vscode.window.showErrorMessage(
      `ShadowPaste: cannot fetch MCP config — ${res.error}`
    );
    return;
  }
  const data = res.data;
  const pretty = JSON.stringify(data, null, 2);
  // Show a compact info message + a full document so the user can copy/paste.
  const choice = await vscode.window.showInformationMessage(
    `ShadowPaste MCP ready — server: ${data.server?.name || "?"} (v${
      data.server?.protocolVersion || "?"
    }). Open full config?`,
    "Open in editor",
    "Copy to clipboard"
  );
  if (choice === "Open in editor") {
    const doc = await vscode.workspace.openTextDocument({
      content: pretty,
      language: "json",
    });
    await vscode.window.showTextDocument(doc);
  } else if (choice === "Copy to clipboard") {
    await vscode.env.clipboard.writeText(pretty);
    vscode.window.showInformationMessage(
      "ShadowPaste: MCP config copied to clipboard."
    );
  }
}
