import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { scanGitHubRepo } from "@/lib/github-scanner"
import { randomBytes } from "crypto"
import { enforceRateLimit, rateLimitHeaders } from "@/lib/rate-limit"

// GET /api/public-scan?shareId=... — fetch a shared scan result (no login)
export async function GET(req: NextRequest) {
  // Unauthenticated and DB-backed: throttle before touching Postgres.
  const rl = await enforceRateLimit(req, "publicRead")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  const { searchParams } = new URL(req.url)
  const shareId = searchParams.get("shareId")
  if (shareId) {
    const scan = await db.publicScan.findUnique({ where: { shareId } })
    if (!scan) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ scan })
  }
  const recent = await db.publicScan.findMany({ orderBy: { createdAt: "desc" }, take: 12 })
  return NextResponse.json({ scans: recent })
}

// POST /api/public-scan — public no-login scan: { repo }
export async function POST(req: NextRequest) {
  // The heaviest unauthenticated operation in the app: clones/reads a GitHub
  // repo, runs the full detector over it, then writes a PublicScan row. Uses
  // the strict `scan` preset (5/min) — anonymous callers must not be able to
  // turn this into an outbound-traffic or CPU amplifier.
  const rl = await enforceRateLimit(req, "scan")
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate limit exceeded: scans are limited, try again shortly", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers: rateLimitHeaders(rl) }
    )
  }

  const body = await req.json().catch(() => ({}))
  const repoInput = body.repo || (body.repoUrl ? body.repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") : "")
  if (!repoInput) return NextResponse.json({ error: "repo required (owner/name)" }, { status: 400 })

  const result = await scanGitHubRepo(repoInput)
  if (!result.ok) return NextResponse.json({ error: result.error || "scan failed" }, { status: 502 })

  const shareId = `share-${randomBytes(4).toString("hex")}`
  const scan = await db.publicScan.create({ data: {
    repoUrl: result.repo.url, repoName: repoInput,
    score: result.score, secrets: result.secretsCount, permissions: 0, configs: result.configsCount,
    findings: JSON.stringify(result.findings), shareId,
  }})
  return NextResponse.json({ ...result, scan, ok: true })
}
