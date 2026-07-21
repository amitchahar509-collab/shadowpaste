import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { scanGitHubRepo } from "@/lib/github-scanner"
import { checkRateLimit } from "@/lib/rate-limit"

// POST /api/github/scan-real — REAL GitHub scan (delegates to shared scanner)
// Requires authentication — anonymous users should use /api/public-scan (which doesn't auto-vault).
// Body: { repo: "owner/name", token?: "ghp_..." }
export async function POST(req: NextRequest) {
  // Rate limit: 5 scans per minute
  const rl = checkRateLimit(req, "scan");
  if (!rl.ok) return NextResponse.json({ error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs }, { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } });

  const ctx = await getContext(req);
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required — use /api/public-scan for anonymous scans" }, { status: 401 });

  const { repo, token } = await req.json();
  if (!repo) return NextResponse.json({ error: "repo required (owner/name)" }, { status: 400 });
  const result = await scanGitHubRepo(repo, { token, orgId: ctx.orgId });
  if (!result.ok) return NextResponse.json({ error: result.error || "scan failed" }, { status: 502 });
  return NextResponse.json({ ...result, ok: true });
}
