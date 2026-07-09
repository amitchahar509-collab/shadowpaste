import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/trust — all project trust scores
export async function GET() {
  const projects = await db.project.findMany({ select: { id: true, name: true, repoUrl: true, trustScore: true, secretsProtected: true, riskyFiles: true, agentPermissions: true, securityIssues: true, status: true, updatedAt: true }, orderBy: { trustScore: "desc" } })
  const avg = projects.length ? Math.round(projects.reduce((s, p) => s + p.trustScore, 0) / projects.length) : 0
  return NextResponse.json({ projects, avgScore: avg })
}
