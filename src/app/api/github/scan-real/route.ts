import { NextRequest, NextResponse } from "next/server"
import { getContext, anonymousContext } from "@/lib/auth"
import { scanGitHubRepo } from "@/lib/github-scanner"

// POST /api/github/scan-real — REAL GitHub scan (delegates to shared scanner)
// Body: { repo: "owner/name", token?: "ghp_..." }
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const { repo, token } = await req.json()
  if (!repo) return NextResponse.json({ error: "repo required (owner/name)" }, { status: 400 })
  const result = await scanGitHubRepo(repo, { token, orgId: ctx.orgId })
  if (!result.ok) return NextResponse.json({ error: result.error || "scan failed" }, { status: 502 })
  return NextResponse.json({ ok: true, ...result })
}
