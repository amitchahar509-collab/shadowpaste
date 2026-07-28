import { NextRequest, NextResponse } from "next/server"
import { seedDatabase } from "@/lib/seed"
import { internalError } from "@/lib/api-error"

// POST|GET /api/seed — (re)seed demo data.
//
// This mutates shared state, so it is open only outside production. In
// production it requires a matching SEED_TOKEN (via ?token= or X-Seed-Token),
// and if no SEED_TOKEN is configured it is disabled entirely.
function seedAllowed(req: NextRequest): { ok: boolean; status?: number; error?: string } {
  if (process.env.NODE_ENV !== "production") return { ok: true }
  const configured = process.env.SEED_TOKEN
  if (!configured) return { ok: false, status: 403, error: "seeding is disabled in production" }
  const provided = new URL(req.url).searchParams.get("token") || req.headers.get("x-seed-token")
  if (provided !== configured) return { ok: false, status: 401, error: "invalid seed token" }
  return { ok: true }
}

async function handle(req: NextRequest) {
  const gate = seedAllowed(req)
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status })
  try {
    const result = await seedDatabase()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return internalError(e, "seed")
  }
}

export const GET = handle
export const POST = handle
