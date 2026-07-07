import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const agents = await db.agent.findMany({
    include: { _count: { select: { toolCalls: true, permissions: true, sessions: true } } },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json({ agents })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, provider, description, trustScore, modelVersion, avatarColor } = body
  if (!name || !provider) return NextResponse.json({ error: "name and provider required" }, { status: 400 })
  const agent = await db.agent.create({
    data: {
      name, provider, description: description || null,
      trustScore: typeof trustScore === "number" ? trustScore : 50,
      modelVersion: modelVersion || null, avatarColor: avatarColor || "#10b981",
    },
  })
  return NextResponse.json({ agent })
}
