// ShadowPaste — deployment-portable URL + CORS helpers.
//
// Nothing in the codebase should hardcode http://localhost:3000. The public
// origin of a deployed instance is only known at runtime (Vercel/Render assign
// it), so we resolve it in this priority order:
//   1. NEXT_PUBLIC_APP_URL  — explicit canonical URL (set in the host dashboard)
//   2. the request's forwarded proto + host  — works behind Vercel/Render proxies
//   3. the request Origin header  — last resort for same-origin browser calls
//   4. http://localhost:3000  — local-dev fallback only
//
// CORS is OPT-IN: cross-origin browser callers (the Chrome extension, a hosted
// dashboard on a different domain) are only allowed when their origin appears in
// ALLOWED_ORIGINS (comma-separated). Same-origin and non-browser MCP clients
// (Claude Desktop, curl) are unaffected — CORS is a browser mechanism.

const LOCAL_FALLBACK = "http://localhost:3000";

/** Resolve the public base URL for building absolute links (redirects, configs). */
export function getAppUrl(req?: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  if (req) {
    const h = req.headers;
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`;
    }
    const origin = h.get("origin");
    if (origin) return origin.replace(/\/+$/, "");
  }
  return LOCAL_FALLBACK;
}

/** Origins explicitly permitted for cross-origin browser requests. */
export function allowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/**
 * CORS headers for an API response. Returns an empty object (no CORS) unless the
 * caller's Origin is allow-listed, or ALLOWED_ORIGINS contains "*". Wildcard is
 * honored without credentials, matching browser rules.
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  if (!origin) return {};
  const allow = allowedOrigins();
  const ok = allow.includes("*") || allow.includes(origin);
  if (!ok) return {};
  return {
    "Access-Control-Allow-Origin": allow.includes("*") ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
