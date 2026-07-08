import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"

// GET /api/agents — list agents in the caller's org
export async function GET(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const agents = await db.agent.findMany({
    where: { orgId: ctx.orgId },
    include: { _count: { select: { toolCalls: true, permissions: true, sessions: true } } },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json({ agents })
}

// POST /api/agents — create a new agent in the caller's org
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const body = await req.json()
  const { name, provider, description, trustScore, modelVersion, avatarColor } = body
  if (!name || !provider) return NextResponse.json({ error: "name and provider required" }, { status: 400 })
  const agent = await db.agent.create({
    data: {
      orgId: ctx.orgId, createdById: ctx.user?.id,
      name, provider, description: description || null,
      trustScore: typeof trustScore === "number" ? trustScore : 50,
      modelVersion: modelVersion || null, avatarColor: avatarColor || "#10b981",
    },
  })
  await db.auditLog.create({ data: { orgId: ctx.orgId, actorType: "user", actorId: ctx.user?.id, action: "agent.create", target: agent.id, metadata: JSON.stringify({ name, provider }) } })
  return NextResponse.json({ agent })
}
