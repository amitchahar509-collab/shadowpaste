// Shared war-test authentication helper.
//
// Mutating endpoints (/api/agents POST, /api/mcp/call, /api/scan, /api/workspace/*)
// require an authenticated session — anonymous access to them is a security
// hole, not a feature. These integration scripts therefore need a session cookie.
//
// WHY THIS CACHES
// ---------------
// The previous version generated a RANDOM email on every call:
//
//   const email = `wartest+${Date.now()}${Math.random()}@example.com`
//
// so the "account may already exist — fall back to login" branch could never
// fire: the random address had never been registered. Every single call therefore
// required a fresh SIGNUP, and each suite in the battery calls this once.
//
// Signup is rate-limited to 20/hour per client (deliberately — it writes
// User + Org + Membership rows and is unauthenticated). Running the full suite a
// few times inside an hour exhausted that budget, and suites began failing with
// HTTP 429 on signup. Observed as attack-billing-bypass and test-real-scanner
// dying with "could not obtain a session cookie" — a red pipeline caused by the
// test harness, not the product.
//
// Now identities are DETERMINISTIC per label and cached on disk, and login is
// attempted first. Successful logins do not consume the brute-force budget
// (that counts failures only), so the suite is re-runnable indefinitely and
// signup is hit at most once per label per database.
//
// Raising the signup limit was the alternative and was rejected: it would have
// made the pipeline green by weakening a real control that exists to stop mass
// account creation.

import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const CACHE_PATH = path.resolve(process.cwd(), "tests/.auth-cache.json");
const PASSWORD = "WarTest-Str0ng!pass";

interface CachedIdentity { email: string; password: string }

function readCache(): Record<string, CachedIdentity> {
  try {
    if (!existsSync(CACHE_PATH)) return {};
    return JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, CachedIdentity>;
  } catch {
    return {}; // corrupt cache is not fatal — fall through to a fresh signup
  }
}

function writeCache(cache: Record<string, CachedIdentity>): void {
  try {
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    /* best-effort: a read-only FS just means we sign up again next run */
  }
}

/**
 * Obtain a session cookie for an integration test.
 *
 * @param label Distinct identity name. Suites needing two unrelated users
 *              (e.g. tenant isolation) pass different labels so they never share
 *              an account.
 */
export async function authCookie(base: string, label = "default"): Promise<string> {
  const cache = readCache();
  let identity = cache[label];

  // 1. Try logging in with a known identity first — cheap, and does not touch
  //    the signup budget.
  if (identity) {
    const cookie = await login(base, identity);
    if (cookie) return cookie;
    // Cached identity no longer valid (database reset between runs) — fall
    // through and register a new one under the same label.
  }

  // 2. Register. Deterministic-per-label but unique per database generation, so
  //    a wiped database does not collide with a stale cache entry.
  identity = {
    email: `wartest+${label}-${Date.now().toString(36)}@example.com`,
    password: PASSWORD,
  };
  const signup = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: identity.email, password: identity.password, name: `War Test ${label}` }),
    signal: AbortSignal.timeout(15_000),
  });
  const cookie = extractSessionCookie(signup.headers.get("set-cookie"));
  if (cookie) {
    cache[label] = identity;
    writeCache(cache);
    return cookie;
  }

  // 3. Signup failed. Report WHY — "could not obtain a session cookie" with no
  //    status was the single most confusing failure in this suite.
  let detail = `http ${signup.status}`;
  try {
    const body = (await signup.json()) as { error?: string };
    if (body?.error) detail += `: ${body.error}`;
  } catch { /* non-JSON body */ }
  if (signup.status === 429) {
    detail += " — the signup rate limit is per-hour and intentional; the cache should normally avoid this";
  }
  throw new Error(`could not obtain a session cookie for label "${label}" (${detail})`);
}

async function login(base: string, identity: CachedIdentity): Promise<string> {
  try {
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: identity.email, password: identity.password }),
      signal: AbortSignal.timeout(15_000),
    });
    return extractSessionCookie(res.headers.get("set-cookie"));
  } catch {
    return "";
  }
}

function extractSessionCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const m = setCookie.match(/sp_session=([^;]+)/);
  return m ? `sp_session=${m[1]}` : "";
}

/**
 * Delete every agent in the authenticated caller's own org.
 *
 * Cached identities (above) make suites re-runnable, but a suite that CREATES
 * agents accumulates them in its reused org across runs — and the FREE plan caps
 * an org at 3 agents. After enough runs, agent creation starts returning 402 and
 * the suite aborts at its control check with "could not create active agent".
 * That is the billing limit working correctly against leftover test state, not a
 * product defect — but it makes the suite non-idempotent on a persistent dev DB.
 * (In CI the database is ephemeral and starts empty, so this never triggers
 * there; it only bites repeated LOCAL runs against Neon.)
 *
 * Agent-creating suites call this right after auth to start from a clean slate.
 * It only ever touches the caller's OWN org, via the tenant-scoped DELETE route.
 */
export async function resetOwnAgents(base: string, cookie: string): Promise<number> {
  try {
    const res = await fetch(`${base}/api/agents`, {
      headers: { cookie },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return 0;
    const body = (await res.json()) as { agents?: Array<{ id: string }> };
    const agents = body.agents ?? [];
    let removed = 0;
    for (const a of agents) {
      const del = await fetch(`${base}/api/agents/${a.id}`, {
        method: "DELETE",
        headers: { cookie },
        signal: AbortSignal.timeout(15_000),
      });
      if (del.ok) removed++;
    }
    return removed;
  } catch {
    return 0; // best-effort: a failure here just means the suite may hit the cap
  }
}
