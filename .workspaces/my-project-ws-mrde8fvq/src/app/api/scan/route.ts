import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"
import { scanGitHubRepo } from "@/lib/github-scanner"

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

// POST /api/scan — "Make Repo AI Safe" REAL scan via GitHub API
// Body: { repo: "owner/name", token?: "ghp_..." }
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const body = await req.json()
  const repo = body.repo || (body.repoUrl ? body.repoUrl.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "") : "")
  if (!repo) return NextResponse.json({ error: "repo required (owner/name)" }, { status: 400 })

  const result = await scanGitHubRepo(repo, { token: body.token, orgId: ctx.orgId })
  if (!result.ok) return NextResponse.json({ error: result.error || "scan failed" }, { status: 502 })

  // Persist project + scan
  let project = await db.project.findFirst({ where: { orgId: ctx.orgId, repoUrl: result.repo.url } })
  if (!project) {
    project = await db.project.create({ data: { orgId: ctx.orgId, name: repo, repoUrl: result.repo.url, description: "Scanned via AI Safe GitHub", fileCount: result.filesScanned } })
  }
  const scan = await db.scan.create({ data: { projectId: project.id, type: "full", status: "completed", findings: JSON.stringify(result.findings), score: result.score } })
  await db.project.update({ where: { id: project.id }, data: {
    trustScore: result.score, secretsProtected: result.secretsCount, riskyFiles: result.findings.length,
    securityIssues: result.findings.filter((f) => f.severity === "high" || f.severity === "critical").length,
    status: result.score >= 80 ? "safe" : "at-risk", fileCount: result.filesScanned,
  }})
  await db.auditLog.create({ data: { orgId: ctx.orgId, actorType: ctx.user ? "user" : "system", actorId: ctx.user?.id, action: "scan.run", target: repo, metadata: JSON.stringify({ files: result.filesScanned, findings: result.findings.length, score: result.score }) } })

  return NextResponse.json({
    ok: true, projectId: project.id, scanId: scan.id,
    repoUrl: result.repo.url, repoName: repo,
    files: result.files, filesScanned: result.filesScanned,
    findings: result.findings, secretsCount: result.secretsCount, configsCount: result.configsCount,
    vaultedCount: result.vaultedCount, score: result.score, grade: result.grade,
  })
}
