import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { DEMO_REPO_FILES, runScan } from "@/lib/scanner"
import { randomBytes } from "crypto"

// GET /api/public-scan?shareId=... — fetch a shared scan result (no login)
export async function GET(req: NextRequest) {
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

// POST /api/public-scan — public no-login scan: { repoUrl }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const repoUrl = body.repoUrl || "https://github.com/acme/platform"
  const repoName = body.repoName || repoUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")
  const fullContent = DEMO_REPO_FILES.map((f) => `# FILE: ${f.path}\n${f.content}`).join("\n\n")
  const result = runScan(fullContent, repoName)
  const shareId = `share-${randomBytes(4).toString("hex")}`
  const scan = await db.publicScan.create({ data: {
    repoUrl, repoName, score: result.score, secrets: result.secretsCount,
    permissions: result.permissionsCount, configs: result.configsCount, findings: JSON.stringify(result.findings), shareId,
  }})
  return NextResponse.json({ ok: true, scan, ...result })
}
