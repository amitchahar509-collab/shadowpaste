import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/health — real system health check (no fake numbers)
export async function GET() {
  const start = Date.now()
  const checks: Array<{ name: string; ok: boolean; latencyMs: number; detail?: string }> = []

  // 1. Database
  try {
    const dbStart = Date.now()
    await db.$queryRaw`SELECT 1`
    checks.push({ name: "database", ok: true, latencyMs: Date.now() - dbStart })
  } catch (e) {
    checks.push({ name: "database", ok: false, latencyMs: Date.now() - start, detail: (e as Error).message })
  }

  // 2. Vault (check key is loaded)
  try {
    const { getVaultKey } = await import("@/lib/security/vault")
    const key = await getVaultKey()
    checks.push({ name: "vault", ok: !!key, latencyMs: 0 })
  } catch (e) {
    checks.push({ name: "vault", ok: false, latencyMs: 0, detail: (e as Error).message })
  }

  // 3. MCP server (check tool registry loads)
  try {
    const { buildToolList } = await import("@/lib/mcp/server")
    const tools = buildToolList()
    checks.push({ name: "mcp", ok: tools.length > 0, latencyMs: 0, detail: `${tools.length} tools` })
  } catch (e) {
    checks.push({ name: "mcp", ok: false, latencyMs: 0, detail: (e as Error).message })
  }

  // 4. GitHub API reachability (unauthenticated rate-limit endpoint)
  try {
    const ghStart = Date.now()
    const ghRes = await fetch("https://api.github.com/rate_limit", { signal: AbortSignal.timeout(5000) })
    checks.push({ name: "github-api", ok: ghRes.ok, latencyMs: Date.now() - ghStart })
  } catch (e) {
    checks.push({ name: "github-api", ok: false, latencyMs: 0, detail: (e as Error).message })
  }

  // Rate-limiter posture. Reported as a check (never a failure) so an operator
  // can see at a glance whether limits are global or best-effort per-instance —
  // an in-memory limiter on serverless is a real gap and must not be silent.
  const { rateLimitMode } = await import("@/lib/rate-limit")
  const rlMode = rateLimitMode()
  checks.push({
    name: "rate-limiter",
    ok: true,
    latencyMs: 0,
    detail: `${rlMode.backend}${rlMode.durable ? " (durable)" : " (best-effort, per-instance)"}`,
  })

  const allOk = checks.every((c) => c.ok)
  const totalLatency = Date.now() - start

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      uptime: process.uptime(),
      totalLatencyMs: totalLatency,
      checks,
      // Keep in sync with package.json "version" and MCP_SERVER_VERSION.
      // Previously reported "20.0.0" (an internal phase number) while the
      // package and the MCP handshake both said 1.0.0 — public consumers of
      // /api/health were reading a version that matched nothing.
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 503 }
  )
}
