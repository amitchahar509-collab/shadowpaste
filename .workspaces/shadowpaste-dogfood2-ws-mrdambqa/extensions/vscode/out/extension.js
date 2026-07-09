"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.shadow-B7LRi0F39HRJEVIo5(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
exports.readConfig = readConfig;
exports.getJson = getJson;
const vscode = __importStar(require("vscode"));
const detector_1 = require("./detector");
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("shadowpaste.scanWorkspace", () => scanWorkspaceCommand(context)), vscode.commands.registerCommand("shadowpaste.protectSecrets", () => protectSecretsCommand(context)), vscode.commands.registerCommand("shadowpaste.connectMcp", () => connectMcpCommand()));
    console.info("[ShadowPaste] extension activated.");
}
function deactivate() {
    /* no-op */
}
function readConfig() {
    const cfg = vscode.workspace.getConfiguration("shadowpaste");
    const serverUrl = (cfg.get("serverUrl") || "http://localhost:3000")
        .trim()
        .replace(/\/+$/, "");
    const apiKey = (cfg.get("apiKey") || "").trim();
    return { serverUrl, apiKey };
}
function authHeaders(cfg) {
    const h = { "Content-Type": "application/json" };
    if (cfg.apiKey)
        h["Authorization"] = `Bearer ${cfg.apiKey}`;
    return h;
}
async function postJson(cfg, path, body) {
    try {
        const res = await fetch(`${cfg.serverUrl}${path}`, {
            method: "POST",
            headers: authHeaders(cfg),
            body: JSON.stringify(body),
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = text;
        }
        if (!res.ok) {
            const errMsg = (data && typeof data === "object" && "error" in data
                ? String(data.error)
                : `HTTP ${res.status}`) || `HTTP ${res.status}`;
            return { ok: false, error: errMsg, status: res.status };
        }
        return { ok: true, data: data };
    }
    catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
async function getJson(cfg, path) {
    try {
        const res = await fetch(`${cfg.serverUrl}${path}`, {
            method: "GET",
            headers: authHeaders(cfg),
        });
        const text = await res.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = text;
        }
        if (!res.ok) {
            return {
                ok: false,
                error: (data && typeof data === "object" && "error" in data
                    ? String(data.error)
                    : `HTTP ${res.status}`) || `HTTP ${res.status}`,
                status: res.status,
            };
        }
        return { ok: true, data: data };
    }
    catch (err) {
        return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}
async function scanWorkspaceCommand(context) {
    const cfg = readConfig();
    // Gather every open text document in the workspace.
    const docs = vscode.workspace.textDocuments.filter((d) => d.uri.scheme === "file" && d.languageId !== "git" && d.languageId !== "search-result");
    if (docs.length === 0) {
        vscode.window.showWarningMessage("ShadowPaste: no open workspace documents to scan.");
        return;
    }
    const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
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
        const findings = [];
        const scannedPaths = [];
        const riskyFiles = new Set();
        for (const d of docs) {
            const path = vscode.workspace.asRelativePath(d.uri);
            scannedPaths.push(path);
            const text = d.getText();
            const localFindings = (0, detector_1.scanForSecrets)(text, path);
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
        const deductions = { critical: 25, high: 12, medium: 5, low: 2 };
        let score = 100;
        for (const f of findings)
            score -= deductions[f.severity] ?? 0;
        score = Math.max(0, Math.min(100, score));
        // Mirror src/lib/scanner.ts::scoreToGrade exactly:
        //   A+ >=95, A >=90, B >=80, C >=70, D >=60, F <60
        const grade = score >= 95 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
        const securityIssues = findings.filter((f) => f.severity === "high" || f.severity === "critical").length;
        const data = {
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
    }
    finally {
        status.dispose();
    }
}
function showScanPanel(context, cfg, scan, docs) {
    const panel = vscode.window.createWebviewPanel("shadowpasteScan", `ShadowPaste — Workspace Scan`, vscode.ViewColumn.One, { enableScripts: false });
    const findings = scan.findings || [];
    const score = scan.score ?? 0;
    const grade = scan.grade ?? "—";
    const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
    const rows = findings
        .map((f) => {
        const sevColor = f.severity === "critical"
            ? "#ef4444"
            : f.severity === "high"
                ? "#f97316"
                : f.severity === "medium"
                    ? "#f59e0b"
                    : "#94a3b8";
        return `<tr>
        <td><span class="sev" style="background:${sevColor}">${escapeHtml(f.severity || "low")}</span></td>
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
  <div class="meta">${docs.length} document(s) scanned locally (detector ≡ <code>src/lib/security/detector.ts</code>) · vault at <code>${escapeHtml(cfg.serverUrl)}/api/vault</code>${scan.scanId ? ` · scanId ${scan.scanId}` : ""}</div>
  <div class="card"><div class="meta">Trust score</div><div class="score">${score}<span class="grade">${escapeHtml(grade)}</span></div></div>
  <div class="card"><div class="meta">Secrets</div><div class="score" style="font-size:24px">${scan.secretsCount ?? 0}</div></div>
  <div class="card"><div class="meta">Findings</div><div class="score" style="font-size:24px">${findings.length}</div></div>
  <div class="card"><div class="meta">Risky files</div><div class="score" style="font-size:24px">${scan.riskyFiles ?? 0}</div></div>
  <table>
    <thead><tr><th>Severity</th><th>Type</th><th>Provider</th><th>File</th><th>Line</th><th>Evidence</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6" style="color:#94a3b8;text-align:center">No findings.</td></tr>`}</tbody>
  </table>
</body></html>`;
}
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
async function protectSecretsCommand(_context) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showWarningMessage("ShadowPaste: open a text document first.");
        return;
    }
    const cfg = readConfig();
    const doc = editor.document;
    const text = doc.getText();
    // Run the SAME detector as the backend (local copy of detector.ts).
    const v = (0, detector_1.virtualizeText)(text, { mode: "PROTECT", salt: doc.uri.fsPath });
    if (v.count === 0) {
        vscode.window.showInformationMessage("ShadowPaste: no secrets detected in this document.");
        return;
    }
    // Step 1: POST each raw secret to /api/vault for encrypted at-rest storage.
    // Deduplicate by raw value so the same secret isn't stored twice.
    const seenRaw = new Set();
    const stored = [];
    for (const r of v.raws) {
        if (seenRaw.has(r.raw))
            continue;
        seenRaw.add(r.raw);
        const res = await postJson(cfg, "/api/vault", {
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
        }
        else {
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
    edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), v.text);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
        vscode.window.showErrorMessage("ShadowPaste: could not apply redaction edit to the document.");
        return;
    }
    // Step 3: report.
    const okCount = stored.filter((s) => s.ok).length;
    const failCount = stored.length - okCount;
    const msg = `ShadowPaste: virtualized ${v.count} secret(s) into ` +
        `${stored.length} unique vault entr${stored.length === 1 ? "y" : "ies"} ` +
        `(${okCount} stored, ${failCount} failed).`;
    if (failCount > 0) {
        vscode.window.showWarningMessage(msg + " Failures: " + stored.filter((s) => !s.ok).map((s) => s.error).join("; "));
    }
    else {
        vscode.window.showInformationMessage(msg);
    }
    // Diagnostic decorations so the user can see which lines changed.
    const findings = (0, detector_1.scanForSecrets)(text, doc.uri.fsPath);
    showFindingsDiagnostics(doc, findings);
}
const DIAGNOSTIC_COLLECTION = vscode.languages.createDiagnosticCollection("shadowpaste");
function showFindingsDiagnostics(doc, findings) {
    const diags = findings.map((f) => {
        const range = new vscode.Range(Math.max(0, f.line - 1), Math.max(0, f.column - 1), Math.max(0, f.line - 1), Math.max(0, f.column - 1) + f.raw.length);
        const severity = f.severity === "critical"
            ? vscode.DiagnosticSeverity.Error
            : f.severity === "high"
                ? vscode.DiagnosticSeverity.Error
                : f.severity === "medium"
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information;
        const d = new vscode.Diagnostic(range, `ShadowPaste: ${f.provider} ${f.detector} — virtualized`, severity);
        d.source = "shadowpaste";
        return d;
    });
    DIAGNOSTIC_COLLECTION.set(doc.uri, diags);
}
async function connectMcpCommand() {
    const cfg = readConfig();
    const res = await getJson(cfg, "/api/mcp-config");
    if (!res.ok) {
        vscode.window.showErrorMessage(`ShadowPaste: cannot fetch MCP config — ${res.error}`);
        return;
    }
    const data = res.data;
    const pretty = JSON.stringify(data, null, 2);
    // Show a compact info message + a full document so the user can copy/paste.
    const choice = await vscode.window.showInformationMessage(`ShadowPaste MCP ready — server: ${data.server?.name || "?"} (v${data.server?.protocolVersion || "?"}). Open full config?`, "Open in editor", "Copy to clipboard");
    if (choice === "Open in editor") {
        const doc = await vscode.workspace.openTextDocument({
            content: pretty,
            language: "json",
        });
        await vscode.window.showTextDocument(doc);
    }
    else if (choice === "Copy to clipboard") {
        await vscode.env.clipboard.writeText(pretty);
        vscode.window.showInformationMessage("ShadowPaste: MCP config copied to clipboard.");
    }
}
//# sourceMappingURL=extension.js.map