// ShadowPaste — Rate Limiter (durable when configured, in-memory otherwise)
//
// DEPLOYMENT BEHAVIOUR — READ THIS BEFORE TRUSTING A LIMIT
// -------------------------------------------------------
// The in-memory token bucket below lives in a single process. On a serverless
// platform (Vercel, Lambda, Cloud Run) every cold start gets a FRESH Map and
// concurrent invocations each get their OWN Map, so a per-instance limit of 60
// req/min is really 60 x xxx(number of live instances) and resets unpredictably.
// Measured against this app on Vercel before Redis support existed: 90 parallel
// requests to /api/mcp all returned 200.
//
// Therefore:
//   * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in any multi-instance
//     or serverless deployment. Limits then become global and survive cold starts.
//   * Without those variables the limiter still runs, but it is BEST-EFFORT
//     per-instance only. `isDurable()` reports which mode is active and
//     /api/health surfaces it, so the posture is never a surprise.
//
// The Redis path uses INCR + EXPIRE (fixed window) via the Upstash REST API —
// no SDK dependency, works on the edge runtime. If Redis is unreachable the
// limiter fails OPEN to the in-memory bucket rather than 500-ing the route:
// availability of the app beats exactness of the limit, and the in-memory
// bucket still throttles the common single-instance case.

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
  // FAILED login attempts per 15min (brute-force protection).
  //
  // Only failures consume a token — see the login route. Throttling SUCCESSFUL
  // logins protects nothing: a user who authenticates correctly twenty times is
  // not attacking anything, while an attacker guessing passwords generates
  // failures by definition. Counting both also made this bucket shared state
  // between unrelated callers behind one NAT/proxy, and (as CI proved) between
  // every test suite in a run, where getClientIp() collapses to one key.
  auth: { windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "auth" },
  // Account creation, counted on EVERY attempt — a signup "succeeds" by design,
  // so success-only counting would leave mass account creation unthrottled.
  // Separate bucket so a burst of registrations cannot exhaust the brute-force
  // budget that protects existing accounts, and vice versa.
  signup: { windowMs: 60 * 60 * 1000, max: 20, keyPrefix: "signup" },
  mcp: { windowMs: 60 * 1000, max: 60, keyPrefix: "mcp" },             // 60 MCP calls per min
  scan: { windowMs: 60 * 1000, max: 5, keyPrefix: "scan" },            // 5 scans per min
  vault: { windowMs: 60 * 1000, max: 20, keyPrefix: "vault" },         // 20 vault ops per min
  default: { windowMs: 60 * 1000, max: 100, keyPrefix: "api" },        // 100 generic API per min
  // Backstop applied in the proxy to EVERY /api route, including ones with no
  // explicit limit of their own. Deliberately loose: it exists to stop floods,
  // not to shape normal traffic, so per-route presets above stay authoritative.
  global: { windowMs: 60 * 1000, max: 600, keyPrefix: "global" },
  // Reads that are cheap but unauthenticated (catalogues, config, discovery).
  publicRead: { windowMs: 60 * 1000, max: 120, keyPrefix: "pubread" },
}

export function checkRateLimit(req: Request, preset: keyof typeof RATE_LIMITS = "default"): RateLimitResult {
  return rateLimit(getClientIp(req), RATE_LIMITS[preset])
}

// ---------------------------------------------------------------------------
// Durable (Redis-backed) limiting
// ---------------------------------------------------------------------------

// A trailing slash produces `https://host//pipeline`, which Upstash rejects —
// and because the limiter fails open, the only symptom is that limits silently
// stop working. Normalize rather than trusting the operator's paste.
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "")
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim()

/** True when Redis is CONFIGURED. Says nothing about whether it works. */
export function isDurable(): boolean {
  return Boolean(REDIS_URL && REDIS_TOKEN)
}

// Live counters. `isDurable()` only proves the env vars exist; these prove the
// backend is actually answering. Without them a misconfigured URL or a bad
// token looks identical to a healthy deployment, because every Redis failure
// falls back to the in-memory bucket and returns a normal 200.
let redisOk = 0
let redisFail = 0
let lastRedisError = ""

/** Describes the active posture, for /api/health and operator diagnostics. */
export function rateLimitMode(): {
  durable: boolean; backend: string; note: string
  configured: boolean; redisOk: number; redisFail: number; lastError?: string
} {
  if (!isDurable()) {
    return {
      durable: false, configured: false, backend: "in-memory", redisOk, redisFail,
      note: "BEST-EFFORT: per-instance only. Each serverless instance keeps its own counters and a cold start resets them. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for global limits.",
    }
  }
  // Configured but every attempt has failed -> we are silently on the fallback.
  const degraded = redisFail > 0 && redisOk === 0
  return {
    durable: !degraded, configured: true,
    backend: degraded ? "in-memory (redis configured but FAILING)" : "upstash-redis",
    redisOk, redisFail, ...(lastRedisError ? { lastError: lastRedisError } : {}),
    note: degraded
      ? "DEGRADED: Redis is configured but every call has failed, so limits have silently fallen back to per-instance in-memory counters. Check the REST URL (must be the https REST endpoint, not redis://) and token."
      : "limits are global across instances and survive cold starts",
  }
}

/**
 * Strip anything config-shaped out of a diagnostic string.
 *
 * /api/health is PUBLIC and unauthenticated, so its `detail` field must never
 * echo raw configuration. A malformed value produces errors like
 * `Failed to parse URL from UPSTASH_REDIS_REST_TOKEN="AX..."` — which would
 * publish the token to anyone who curls the endpoint. The diagnosis has to
 * survive redaction, so shapes are described rather than shown.
 */
function redactConfig(s: string): string {
  return s
    // A whole KEY="value" / KEY=value pair pasted into a value field.
    .replace(/\b([A-Z_][A-Z0-9_]{3,})\s*=\s*"?[^"\s]*"?/g, (_m, key) => `<${key}=... (value redacted)>`)
    // Any bare URL that survived the above.
    .replace(/https?:\/\/[^\s"']+/g, "<url redacted>")
    // Long opaque strings are token-shaped by definition.
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "<redacted>")
}

/** Human-readable diagnosis of a malformed value, without revealing the value. */
function diagnoseUrl(): string | null {
  if (!REDIS_URL) return null
  if (/^[A-Z_][A-Z0-9_]*\s*=/.test(REDIS_URL)) {
    return "the value looks like a whole `KEY=value` line — set the value to ONLY the URL, with no variable name, no '=' and no quotes"
  }
  if (/^["']|["']$/.test(REDIS_URL)) return "the value is wrapped in quotes — remove them"
  if (/^rediss?:\/\//i.test(REDIS_URL)) {
    return "the value is a redis:// connection string — this client uses the Upstash REST API, so use the https:// REST endpoint instead"
  }
  if (!/^https:\/\//i.test(REDIS_URL)) return "the value is not an https:// URL"
  return null
}

/**
 * Actively probe the backend with a real round trip. `/api/health` uses this so
 * "durable" reflects a working Redis, not merely a populated env var.
 */
export async function probeDurableBackend(): Promise<{ ok: boolean; detail: string; latencyMs: number }> {
  if (!isDurable()) return { ok: false, detail: "not configured", latencyMs: 0 }

  // Catch malformed config before issuing a request, so the operator gets a
  // precise instruction instead of a generic parse error.
  const malformed = diagnoseUrl()
  if (malformed) return { ok: false, detail: `UPSTASH_REDIS_REST_URL is malformed: ${malformed}`, latencyMs: 0 }

  const start = Date.now()
  try {
    const res = await fetch(`${REDIS_URL}/ping`, {
      headers: { authorization: `Bearer ${REDIS_TOKEN}` },
      signal: AbortSignal.timeout(4000),
    })
    const latencyMs = Date.now() - start
    if (res.status === 401 || res.status === 403) {
      return { ok: false, detail: `auth rejected (HTTP ${res.status}) — check UPSTASH_REDIS_REST_TOKEN is the token value only, with no variable name or quotes`, latencyMs }
    }
    if (!res.ok) return { ok: false, detail: redactConfig(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 120)}`), latencyMs }
    const body = (await res.json()) as { result?: string }
    return { ok: body?.result === "PONG", detail: `PING -> ${body?.result ?? "no result"}`, latencyMs }
  } catch (e) {
    return { ok: false, detail: redactConfig((e as Error).message).slice(0, 160), latencyMs: Date.now() - start }
  }
}

async function redisFixedWindow(key: string, opts: RateLimitOptions): Promise<RateLimitResult | null> {
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000))
  // Bucket the window so the key rotates automatically; no cleanup job needed.
  const slot = Math.floor(Date.now() / opts.windowMs)
  const k = `sp:rl:${opts.keyPrefix || "default"}:${key}:${slot}`
  try {
    // Pipeline INCR + EXPIRE in one round trip.
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify([["INCR", k], ["EXPIRE", k, String(windowSec)]]),
      // 1.5s was too tight: a cold instance's first TLS handshake to Upstash can
      // exceed it, and every timeout silently degraded to the in-memory bucket.
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) {
      redisFail++
      lastRedisError = redactConfig(`HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 120)}`)
      return null
    }
    const parsed = (await res.json()) as Array<{ result?: number; error?: string }>
    const count = Number(parsed?.[0]?.result)
    if (!Number.isFinite(count)) {
      redisFail++
      lastRedisError = `unexpected pipeline response: ${JSON.stringify(parsed).slice(0, 120)}`
      return null
    }
    redisOk++

    const resetMs = (slot + 1) * opts.windowMs - Date.now()
    if (count > opts.max) {
      return { ok: false, remaining: 0, resetMs, retryAfterMs: Math.max(0, resetMs) }
    }
    return { ok: true, remaining: Math.max(0, opts.max - count), resetMs, retryAfterMs: 0 }
  } catch (e) {
    // Network/timeout — caller falls back to the in-memory bucket. Record it so
    // a persistently unreachable Redis is visible in /api/health rather than
    // presenting as a healthy deployment with limits that never fire.
    redisFail++
    lastRedisError = redactConfig((e as Error).message).slice(0, 140)
    return null
  }
}

/**
 * Enforce a rate limit, using Redis when configured and the in-memory bucket
 * otherwise. This is the function routes should call.
 */
export async function enforceRateLimit(
  req: Request,
  preset: keyof typeof RATE_LIMITS = "default"
): Promise<RateLimitResult> {
  const opts = RATE_LIMITS[preset]
  const id = getClientIp(req)
  if (isDurable()) {
    const r = await redisFixedWindow(id, opts)
    if (r) return r
    // Redis unavailable: fall through to the local bucket rather than failing
    // the request outright.
  }
  return rateLimit(id, opts)
}

/**
 * Check a limit WITHOUT consuming a token.
 *
 * Lets a route reject callers who are already throttled while deciding for
 * itself what counts as an attempt — the login route peeks first, then consumes
 * only when the credentials were wrong.
 */
export async function peekRateLimit(
  req: Request,
  preset: keyof typeof RATE_LIMITS = "default"
): Promise<RateLimitResult> {
  const opts = RATE_LIMITS[preset]
  const id = getClientIp(req)

  if (isDurable()) {
    const slot = Math.floor(Date.now() / opts.windowMs)
    const k = `sp:rl:${opts.keyPrefix || "default"}:${id}:${slot}`
    try {
      const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(k)}`, {
        headers: { authorization: `Bearer ${REDIS_TOKEN}` },
        signal: AbortSignal.timeout(4000),
      })
      if (res.ok) {
        const body = (await res.json()) as { result?: string | null }
        const count = Number(body?.result ?? 0) || 0
        const resetMs = (slot + 1) * opts.windowMs - Date.now()
        redisOk++
        return count >= opts.max
          ? { ok: false, remaining: 0, resetMs, retryAfterMs: Math.max(0, resetMs) }
          : { ok: true, remaining: Math.max(0, opts.max - count), resetMs, retryAfterMs: 0 }
      }
      redisFail++
    } catch (e) {
      redisFail++
      lastRedisError = redactConfig((e as Error).message).slice(0, 140)
    }
    // fall through to the local bucket
  }

  // In-memory peek: replicate the refill maths without taking a token.
  const key = `${opts.keyPrefix || "default"}:${id}`
  const bucket = buckets.get(key)
  if (!bucket) return { ok: true, remaining: opts.max, resetMs: opts.windowMs, retryAfterMs: 0 }
  const tokens = Math.min(opts.max, bucket.tokens + ((Date.now() - bucket.lastRefill) / opts.windowMs) * opts.max)
  return tokens >= 1
    ? { ok: true, remaining: Math.floor(tokens), resetMs: opts.windowMs, retryAfterMs: 0 }
    : { ok: false, remaining: 0, resetMs: opts.windowMs, retryAfterMs: Math.ceil((1 - tokens) * opts.windowMs) }
}

/** Standard 429 headers for a rejected request. */
export function rateLimitHeaders(rl: RateLimitResult): Record<string, string> {
  return {
    "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetMs / 1000)),
  }
}
