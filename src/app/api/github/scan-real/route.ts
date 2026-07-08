import { NextRequest, NextResponse } from "next/server";
import { getContext, anonymousContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { scanForSecrets, providerLabel } from "@/lib/security/detector";
import { storeSecret } from "@/lib/security/vault";
import { computeTrustScore, scoreToGrade } from "@/lib/scanner";

// POST /api/github/scan-real — REAL GitHub scan via REST API
// Body: { repo: "owner/name", token?: "ghp_..." (optional, for private repos/rate limit) }
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext();
  const { repo, token } = await req.json();
  if (!repo) return NextResponse.json({ error: "repo required (owner/name)" }, { status: 400 });

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ShadowPaste-Scanner/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // 1. Fetch repo metadata
  const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
  if (!repoRes.ok) return NextResponse.json({ error: `GitHub API ${repoRes.status}: ${await repoRes.text()}` }, { status: 502 });
  const repoMeta = await repoRes.json();

  // 2. Fetch the repo tree (recursive, up to 1000 files)
  const defaultBranch = repoMeta.default_branch || "main";
  const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers });
  if (!treeRes.ok) return NextResponse.json({ error: `Cannot fetch tree: ${treeRes.status}` }, { status: 502 });
  const tree = await treeRes.json();
  const files = (tree.tree as Array<{ path: string; type: string; size?: number }>)
    .filter((f) => f.type === "blob" && (f.size || 0) < 100000 && isScannable(f.path))
    .slice(0, 30); // cap at 30 files per scan for speed (rate-limit friendly)

  // 3. Fetch each file's content and scan
  const allFindings: Array<{ type: string; severity: string; file: string; line: number; message: string; evidence: string; provider: string }> = [];
  const configFindings: Array<{ type: string; severity: string; file: string; line: number; message: string; evidence: string }> = [];
  let vaultedCount = 0;
  const scannedFiles: string[] = [];

  for (const f of files) {
    try {
      const fileRes = await fetch(`https://api.github.com/repos/${repo}/contents/${f.path}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!fileRes.ok) continue;
      const fileData = await fileRes.json();
      if (!fileData || fileData.encoding !== "base64" || typeof fileData.content !== "string") continue;
      const content = Buffer.from(fileData.content, "base64").toString("utf8");
      scannedFiles.push(f.path);

      // Secret detection + auto-vault
      const secrets = scanForSecrets(content, f.path);
      for (const s of secrets) {
        await storeSecret(s.raw, { name: `${f.path}:${s.line}`, contextHint: f.path, orgId: ctx.orgId });
        vaultedCount++;
        allFindings.push({ type: "secret", severity: s.severity, file: f.path, line: s.line, message: `${s.provider} ${s.detector}`, evidence: s.masked, provider: s.provider });
      }
      // Config checks
      const cfg = scanConfigs(content, f.path);
      configFindings.push(...cfg);
    } catch { /* skip unscannable file */ }
  }

  const findings = [...allFindings, ...configFindings];
  const score = computeTrustScore(findings as never);

  // Persist project + scan
  let project = await db.project.findFirst({ where: { orgId: ctx.orgId, repoUrl: repoMeta.html_url } });
  if (!project) {
    project = await db.project.create({ data: { orgId: ctx.orgId, name: repo, repoUrl: repoMeta.html_url, description: repoMeta.description, fileCount: scannedFiles.length } });
  }
  const scan = await db.scan.create({ data: { projectId: project.id, type: "full", status: "completed", findings: JSON.stringify(findings), score } });
  await db.project.update({ where: { id: project.id }, data: {
    trustScore: score, secretsProtected: allFindings.length, riskyFiles: findings.length,
    securityIssues: findings.filter((f) => f.severity === "high" || f.severity === "critical").length,
    status: score >= 80 ? "safe" : "at-risk", fileCount: scannedFiles.length,
  }});

  await db.auditLog.create({ data: { orgId: ctx.orgId, actorType: "user", actorId: ctx.user?.id, action: "scan.run", target: repo, metadata: JSON.stringify({ files: scannedFiles.length, findings: findings.length, score }) } });

  return NextResponse.json({
    ok: true, projectId: project.id, scanId: scan.id,
    repo: { name: repo, url: repoMeta.html_url, stars: repoMeta.stargazers_count, defaultBranch },
    filesScanned: scannedFiles.length,
    findings, secretsCount: allFindings.length, configsCount: configFindings.length,
    vaultedCount, score, grade: scoreToGrade(score),
  });
}

function isScannable(path: string): boolean {
  return /\.(env|js|ts|tsx|jsx|py|rb|go|rs|java|json|ya?ml|toml|ini|conf|sh|sql|md)$/i.test(path)
    || /(^|\/)(\.env|dockerfile|makefile)/i.test(path)
    || /secret|key|credential|config/i.test(path);
}

const CONFIG_PATTERNS: Array<{ re: RegExp; name: string; severity: "low" | "medium" | "high" | "critical" }> = [
  { re: /"\*:\*"/g, name: "Wildcard IAM Action (*:*)", severity: "critical" },
  { re: /"Action"\s*:\s*"\*"/g, name: "Wildcard IAM Action (*)", severity: "high" },
  { re: /"Resource"\s*:\s*"\*"/g, name: "Wildcard IAM Resource (*)", severity: "high" },
  { re: /privileged:\s*true/g, name: "Privileged container mode", severity: "high" },
  { re: /rejectUnauthorized\s*=\s*false/g, name: "TLS verification disabled", severity: "high" },
  { re: /verifyTLS\s*=\s*false/gi, name: "TLS verification disabled", severity: "high" },
  { re: /DEBUG\s*=\s*true/g, name: "Debug mode enabled", severity: "medium" },
  { re: /allowDangerousHTML/g, name: "allowDangerousHTML enabled", severity: "medium" },
];

function scanConfigs(text: string, file: string): Array<{ type: string; severity: string; file: string; line: number; message: string; evidence: string }> {
  const out: Array<{ type: string; severity: string; file: string; line: number; message: string; evidence: string }> = [];
  for (const p of CONFIG_PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const lineNo = text.slice(0, m.index).split("\n").length;
      out.push({ type: "config", severity: p.severity, file, line: lineNo, message: p.name, evidence: m[0] });
    }
  }
  return out;
}
