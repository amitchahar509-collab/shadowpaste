import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/mcp/tools — list all registered MCP tools
export async function GET() {
  const tools = await db.mcpTool.findMany({ orderBy: [{ category: "asc" }, { riskScore: "desc" }] })
  return NextResponse.json({ tools })
}
