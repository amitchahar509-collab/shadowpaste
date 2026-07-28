import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getContext, anonymousContext } from "@/lib/auth"
import { checkUsageLimit } from "@/lib/billing"
import { auditUnauthorized } from "@/lib/audit-request"

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

// POST /api/agents — create a new agent in the caller's org (billing-enforced)
// Authenticated only: writes org-scoped state.
export async function POST(req: NextRequest) {
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) { await auditUnauthorized(req, "/api/agents"); return NextResponse.json({ error: "authentication required" }, { status: 401 }) }
  const body = await req.json().catch(() => ({}))
  const { name, provider, description, trustScore, modelVersion, avatarColor } = body
  if (!name || !provider) return NextResponse.json({ error: "name and provider required" }, { status: 400 })

  // Billing enforcement: check agent limit for this org's plan
  const org = await db.organization.findUnique({ where: { id: ctx.orgId } })
  const limitCheck = await checkUsageLimit(ctx.orgId, "agents", org?.plan || "FREE")
  if (!limitCheck.ok) {
    return NextResponse.json({ error: limitCheck.reason, limit: limitCheck.limit, current: limitCheck.current, upgrade: "/api/billing/plans" }, { status: 402 })
  }

  const agent = await db.agent.create({
    data: {
      orgId: ctx.orgId, createdById: ctx.user.id,
      name, provider, description: description || null,
      trustScore: typeof trustScore === "number" ? trustScore : 50,
      modelVersion: modelVersion || null, avatarColor: avatarColor || "#10b981",
    },
  })
  await db.auditLog.create({ data: { orgId: ctx.orgId, actorType: "user", actorId: ctx.user.id, action: "agent.create", target: agent.id, metadata: JSON.stringify({ name, provider }) } })
  return NextResponse.json({ agent })
}
