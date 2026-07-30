import { NextResponse } from "next/server"
import { tracingStatus } from "@/lib/observability/trace"
import { log } from "@/lib/observability/logger"
import { rateLimitMode } from "@/lib/rate-limit"

// GET /api/v1/version — API contract + build identity. Public by design: it
// exposes no tenant data, and a client needs it to negotiate compatibility
// before authenticating.
//
// VERSIONING POLICY (deliberately additive, so nothing breaks):
//   * Unversioned routes (/api/agents, /api/mcp, …) are the IMPLICIT v1 surface.
//     They keep their paths forever. Removing or repathing them would break every
//     deployed MCP client and CLI, so they are frozen, not migrated.
//   * /api/v1/* is the EXPLICIT namespace for new endpoints and for any future
//     breaking revision of an existing one.
//   * Every response carries `X-API-Version` (set in proxy.ts) so a client can
//     detect the server contract without a preflight request.
//   * A future v2 lands beside v1 rather than replacing it; v1 is removed only
//     after a published deprecation window.
export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({
    apiVersion: "v1",
    supported: ["v1"],
    deprecated: [],
    // Unversioned paths are v1 by definition — stated explicitly so an
    // integrator does not have to guess whether /api/mcp is versioned.
    implicitV1: true,
    service: process.env.OTEL_SERVICE_NAME || "shadowpaste",
    mcpProtocolVersions: ["2025-06-18", "2025-03-26", "2024-11-05"],
    observability: {
      tracing: tracingStatus(),
      logging: log.status(),
      rateLimiter: rateLimitMode(),
    },
  })
}
