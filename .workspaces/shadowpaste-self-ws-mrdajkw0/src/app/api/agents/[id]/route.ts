import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const agent = await db.agent.findUnique({
    where: { id },
    include: {
      permissions: { orderBy: { createdAt: "desc" } },
      sessions: { orderBy: { createdAt: "desc" }, take: 10 },
      toolCalls: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  })
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({ agent })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.trustScore === "number") update.trustScore = body.trustScore
  if (body.status) update.status = body.status
  if (body.name) update.name = body.name
  if (body.description !== undefined) update.description = body.description
  const agent = await db.agent.update({ where: { id }, data: update })
  return NextResponse.json({ agent })
}
