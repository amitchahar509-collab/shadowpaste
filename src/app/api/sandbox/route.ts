import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"
import { initSandbox, getSandboxDiff, mergeSandbox, rejectSandbox, writeSandboxFile, type SandboxRepo } from "@/lib/git-sandbox"
import { internalError } from "@/lib/api-error"

// In-memory registry of active sandboxes (per project). Production would persist this.
const activeSandboxes = new Map<string, SandboxRepo>()

// GET /api/sandbox?projectId=... — list sandbox changes for a project (tenant-scoped)
export async function GET(req: Request) {
  const ctx = await getContext(req) || anonymousContext()
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get("projectId")
  if (!projectId) {
    const projects = await db.project.findMany({ where: { orgId: ctx.orgId }, include: { _count: { select: { sandboxChanges: true } } }, orderBy: { updatedAt: "desc" } })
    return NextResponse.json({ projects })
  }
  const project = await db.project.findFirst({
    where: { id: projectId, orgId: ctx.orgId },
    include: { sandboxChanges: { orderBy: { createdAt: "desc" } } },
  })

  // If there's an active git sandbox, compute real diffs
  const sandbox = activeSandboxes.get(projectId)
  let realDiffs: Array<{ filePath: string; changeType: string; diff: string; riskLevel: string; riskReason: string }> = []
  if (sandbox) {
    try {
      realDiffs = await getSandboxDiff(sandbox.repoPath, sandbox.baseBranch, sandbox.branch)
    } catch { /* sandbox may not have commits yet */ }
  }

  return NextResponse.json({ project, activeSandbox: sandbox || null, realDiffs })
}

// POST — create a real git-based sandbox / write / merge / reject.
// Authenticated + tenant-scoped: these operations run git and write files on
// the server for a project, so the project must belong to the caller's org.
export async function POST(req: Request) {
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { projectId, action } = body
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 })

  const ownedProject = await db.project.findFirst({ where: { id: projectId, orgId: ctx.orgId } })
  if (!ownedProject) return NextResponse.json({ error: "project not found in your org" }, { status: 403 })

  if (action === "write" && projectId) {
    // Write a file to an existing sandbox (AI change)
    const sandbox = activeSandboxes.get(projectId)
    if (!sandbox) return NextResponse.json({ error: "no active sandbox — create one first" }, { status: 400 })
    const { filePath, content, message } = body
    if (!filePath || content === undefined) return NextResponse.json({ error: "filePath and content required" }, { status: 400 })
    await writeSandboxFile(sandbox.repoPath, filePath, content, message)
    // Persist as a SandboxChange row too (for audit/UI)
    const { analyzeDiff } = await import("@/lib/sandbox")
    const analyzed = analyzeDiff(content)
    await db.sandboxChange.create({ data: { projectId, filePath, changeType: "created", diff: `+${content.slice(0, 500)}`, riskLevel: analyzed.riskLevel, riskReason: analyzed.riskReason, approved: false } })
    return NextResponse.json({ ok: true, filePath, message: "file written to sandbox" })
  }

  if (action === "merge" && projectId) {
    const sandbox = activeSandboxes.get(projectId)
    if (!sandbox) return NextResponse.json({ error: "no active sandbox" }, { status: 400 })
    const result = await mergeSandbox(sandbox.repoPath, sandbox.baseBranch, sandbox.branch)
    if (result.ok) {
      await db.project.update({ where: { id: projectId }, data: { sandboxStatus: "merged" } })
      activeSandboxes.delete(projectId)
    }
    return NextResponse.json(result)
  }

  if (action === "reject" && projectId) {
    const sandbox = activeSandboxes.get(projectId)
    if (!sandbox) return NextResponse.json({ error: "no active sandbox" }, { status: 400 })
    const result = await rejectSandbox(sandbox.repoPath, sandbox.branch)
    if (result.ok) {
      await db.project.update({ where: { id: projectId }, data: { sandboxStatus: "rejected" } })
      activeSandboxes.delete(projectId)
    }
    return NextResponse.json(result)
  }

  // Default: create a new sandbox
  const project = ownedProject
  try {
    const sandbox = await initSandbox(projectId, project.name)
    activeSandboxes.set(projectId, sandbox)
    return NextResponse.json({ ok: true, sandbox: { branch: sandbox.branch, baseBranch: sandbox.baseBranch, repoPath: sandbox.repoPath } })
  } catch (e) {
    return internalError(e, "sandbox")
  }
}
