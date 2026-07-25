import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// ---- Deterministic startup ----------------------------------------------
// Prisma connects lazily on the first query. Under a cold start (dev/Turbopack
// module init, or a container spin-up) that first query can reject before the
// engine is ready, which surfaced as a transient
// "Invalid ...lib/db.ts invocation" on the very first MCP tool call.
//
// dbReady() makes connection explicit and idempotent: the first caller triggers
// $connect(), everyone else awaits the SAME promise. A failed attempt clears the
// memo so the next caller retries rather than caching a broken state.
let _ready: Promise<void> | null = null

export function dbReady(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      let lastErr: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await db.$connect()
          return
        } catch (e) {
          lastErr = e
          // Short backoff — engine spawn / socket bind is typically sub-second.
          await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
        }
      }
      throw lastErr
    })().catch((e) => {
      _ready = null // allow a later request to retry instead of failing forever
      throw e
    })
  }
  return _ready
}