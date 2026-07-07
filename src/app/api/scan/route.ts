import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { DEMO_REPO_FILES, runScan } from "@/lib/scanner"

// GET /api/scan?projectId=... — fetch project + latest scan
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId")
  if (!projectId) {
    const projects = await db.project.findMany({ orderBy: { updatedAt: "desc" } })
    return NextResponse.json({ projects })
  }
  const project = await db.project.findUnique({ where: { id: projectId }, include: { scans: { orderBy: { createdAt: "desc" }, take: 5 } } })
  return NextResponse.json({ project })
}

// POST /api/scan — "Make Repo AI Safe" scan
// Body: { repoUrl?: string, repoName?: string, useDemo?: boolean }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const repoUrl = body.repoUrl || "https://github.com/acme/platform"
  const repoName = body.repoName || repoUrl.split("/").slice(-2).join("/")
  // For demo we always scan the bundled DEMO_REPO_FILES (simulating a repo fetch)
  const fullContent = DEMO_REPO_FILES.map((f) => `# FILE: ${f.path}\n${f.content}`).join("\n\n")
  const result = runScan(fullContent, repoName)

  // Persist project + scan
  let project = await db.project.findFirst({ where: { repoUrl } })
  if (!project) {
    project = await db.project.create({ data: { name: repoName, repoUrl, description: "Scanned via AI Safe GitHub", fileCount: DEMO_REPO_FILES.length } })
  }
  const scan = await db.scan.create({ data: { projectId: project.id, type: "full", status: "completed", findings: JSON.stringify(result.findings), score: result.score } })
  await db.project.update({ where: { id: project.id }, data: {
    trustScore: result.score, secretsProtected: result.secretsCount, riskyFiles: result.findings.length,
    agentPermissions: 0, securityIssues: result.findings.filter((f) => f.severity === "high" || f.severity === "critical").length, status: result.score >= 80 ? "safe" : "at-risk",
  }})

  return NextResponse.json({
    ok: true,
    projectId: project.id,
    scanId: scan.id,
    repoUrl, repoName,
    files: DEMO_REPO_FILES.map((f) => f.path),
    ...result,
  })
}
