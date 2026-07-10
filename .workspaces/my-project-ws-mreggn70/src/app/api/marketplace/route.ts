import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/marketplace — list MCP packages
export async function GET() {
  const packages = await db.mcpPackage.findMany({ orderBy: { installs: "desc" } })
  return NextResponse.json({ packages })
}
