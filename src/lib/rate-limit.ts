// ShadowPaste V20 — Rate Limiter (in-memory, per-IP)
// Simple token-bucket rate limiting for API routes. Production would use Redis.

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10000 // prevent memory exhaustion

export interface RateLimitOptions {
  windowMs: number   // refill window
  max: number        // max tokens per window
  keyPrefix?: string // namespace (e.g. "mcp", "auth", "scan")
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetMs: number
  retryAfterMs: number
}

export function rateLimit(identifier: string, opts: RateLimitOptions): RateLimitResult {
  const key = `${opts.keyPrefix || "default"}:${identifier}`
  const now = Date.now()
  let bucket = buckets.get(key)

  if (!bucket) {
    // LRU eviction at capacity. A Map iterates in insertion order, and every
    // touch re-inserts (see below), so the FIRST key is the least-recently-USED.
    // The previous implementation evicted the first-INSERTED key, which let an
    // attacker flood unique keys to evict — and thereby reset — their own
    // throttled bucket.
    if (buckets.size >= MAX_BUCKETS) {
      const lruKey = buckets.keys().next().value
      if (lruKey) buckets.delete(lruKey)
    }
    bucket = { tokens: opts.max, lastRefill: now }
    buckets.set(key, bucket)
  } else {
    // Touch: move to the most-recently-used end of the iteration order.
    buckets.delete(key)
    buckets.set(key, bucket)
  }

  // Refill tokens proportional to elapsed time
  const elapsed = now - bucket.lastRefill
  const refill = (elapsed / opts.windowMs) * opts.max
  bucket.tokens = Math.min(opts.max, bucket.tokens + refill)
  bucket.lastRefill = now

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return { ok: true, remaining: Math.floor(bucket.tokens), resetMs: opts.windowMs, retryAfterMs: 0 }
  }

  const retryAfterMs = Math.ceil((1 - bucket.tokens) * opts.windowMs)
  return { ok: false, remaining: 0, resetMs: opts.windowMs, retryAfterMs }
}

// Resolve the client identity used to key rate limits.
//
// SECURITY: X-Forwarded-For / X-Real-IP are attacker-controlled unless the app
// actually sits behind a trusted proxy that overwrites them. Trusting them
// unconditionally let any caller send a random value per request and receive a
// fresh token bucket every time — defeating every limit, including the
// brute-force protection on login/signup.
//
// Default (local-first): use the socket address when the runtime exposes it,
// otherwise a single shared key. A shared key is deliberately STRICTER — many
// clients share one budget — because over-throttling is safe and under-
// throttling is not.
//
// Behind a real proxy, set TRUST_PROXY=true so the forwarded header is honoured.
const TRUST_PROXY = process.env.TRUST_PROXY === "true"

function socketAddress(req: Request): string | null {
  // The Web Request API has no socket accessor; some runtimes attach one.
  const r = req as unknown as { ip?: string; socket?: { remoteAddress?: string } }
  return r.ip || r.socket?.remoteAddress || null
}

export function getClientIp(req: Request): string {
  if (TRUST_PROXY) {
    const forwarded = req.headers.get("x-forwarded-for")
    if (forwarded) return forwarded.split(",")[0].trim()
    const real = req.headers.get("x-real-ip")
    if (real) return real
  }
  return socketAddress(req) || "local"
}

// Preset rate limits per endpoint category
export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "auth" },      // 10 login/signup per 15min
  mcp: { windowMs: 60 * 1000, max: 60, keyPrefix: "mcp" },             // 60 MCP calls per min
  scan: { windowMs: 60 * 1000, max: 5, keyPrefix: "scan" },            // 5 scans per min
  vault: { windowMs: 60 * 1000, max: 20, keyPrefix: "vault" },         // 20 vault ops per min
  default: { windowMs: 60 * 1000, max: 100, keyPrefix: "api" },        // 100 generic API per min
}

export function checkRateLimit(req: Request, preset: keyof typeof RATE_LIMITS = "default"): RateLimitResult {
  return rateLimit(getClientIp(req), RATE_LIMITS[preset])
}
