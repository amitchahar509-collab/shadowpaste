// ShadowPaste — deployment-portable URL + CORS helpers.
//
// Nothing in the codebase should hardcode http://localhost:3000. The public
// origin of a deployed instance is only known at runtime (Vercel/Render assign
// it), so we resolve it in this priority order:
//   1. NEXT_PUBLIC_APP_URL  — explicit canonical URL (set in the host dashboard)
//   2. the request's forwarded proto + host  — works behind Vercel/Render proxies
//   3. the request Origin header  — last resort for same-origin browser calls
//   4. DEFAULT_PUBLIC_APP_URL — the known production deployment, used when no
//      request context exists (build-time/CLI callers) so OAuth discovery and
//      dynamic client registration never advertise a localhost issuer.
//
// The forwarded host deliberately outranks the default: a Render deployment must
// advertise its OWN origin, not the Vercel one, or clients would be redirected
// to the wrong host after authorization.
//
// CORS is OPT-IN: cross-origin browser callers (the Chrome extension, a hosted
// dashboard on a different domain) are only allowed when their origin appears in
// ALLOWED_ORIGINS (comma-separated). Same-origin and non-browser MCP clients
// (Claude Desktop, curl) are unaffected — CORS is a browser mechanism.

const LOCAL_FALLBACK = "http://localhost:3000";

/**
 * Last-resort public URL when nothing else can be derived. Override with
 * DEFAULT_PUBLIC_APP_URL if you deploy somewhere else; it is only consulted
 * when there is no explicit env var AND no request to read a host from.
 */
const DEFAULT_PUBLIC_APP_URL =
  process.env.DEFAULT_PUBLIC_APP_URL?.trim() || "https://shadowpaste-xi.vercel.app";

/** True for hosts that are not a reachable public origin. */
function isLocalHost(host: string): boolean {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
}

/**
 * Normalize a configured URL into a valid absolute origin, or null if it cannot
 * be salvaged.
 *
 * A value copied out of a hosting dashboard often arrives malformed — carrying a
 * label and a newline ("Deployment\nmyapp.vercel.app") or missing the scheme.
 * A bad value must NOT be trusted verbatim: it would be published as the OAuth
 * `issuer` and as every endpoint URL in the discovery document, breaking every
 * client that reads it. We recover what we can and otherwise fall through to the
 * next resolution step.
 */
export function normalizeAppUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  for (const line of raw.split(/[\r\n]+/)) {
    const candidate = line.trim();
    if (!candidate || /\s/.test(candidate)) continue; // labels / prose: skip
    const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    try {
      const u = new URL(withScheme);
      // Require a real hostname: either a dotted public name or a loopback host.
      if (!u.hostname.includes(".") && !isLocalHost(u.hostname)) continue;
      return `${u.protocol}//${u.host}`.replace(/\/+$/, "");
    } catch {
      continue;
    }
  }
  return null;
}

/** Resolve the public base URL for building absolute links (redirects, configs). */
export function getAppUrl(req?: Request): string {
  // Validate rather than trust: a malformed dashboard value must not become the
  // published OAuth issuer. An unusable value falls through to the request host.
  const explicit =
    normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL) || normalizeAppUrl(process.env.APP_URL);
  if (explicit) return explicit;

  if (req) {
    const h = req.headers;
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") || (isLocalHost(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
    const origin = h.get("origin");
    if (origin) return origin.replace(/\/+$/, "");
    // A request with no Host/Origin header at all can't identify its own origin.
    return DEFAULT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  // No request context (build step, CLI, scheduled job): prefer the known public
  // deployment over localhost so generated OAuth metadata is externally valid.
  return (DEFAULT_PUBLIC_APP_URL || LOCAL_FALLBACK).replace(/\/+$/, "");
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
