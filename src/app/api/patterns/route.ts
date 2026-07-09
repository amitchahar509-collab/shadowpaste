import { NextResponse } from "next/server"
import { SECRET_PATTERNS, PATTERN_COUNT } from "@/lib/security/secret-patterns"

// GET /api/patterns — secret detection pattern catalog count + samples
export async function GET() {
  const byProvider: Record<string, number> = {}
  const bySeverity: Record<string, number> = {}
  for (const p of SECRET_PATTERNS) {
    byProvider[p.provider] = (byProvider[p.provider] || 0) + 1
    bySeverity[p.severity] = (bySeverity[p.severity] || 0) + 1
  }
  return NextResponse.json({
    total: PATTERN_COUNT,
    byProvider: Object.entries(byProvider).sort((a, b) => b[1] - a[1]),
    bySeverity,
    providers: Object.keys(byProvider).length,
  })
}
