// ShadowPaste — OAuth 2.1 Authorization Server core.
//
// Replaces the previous stubs (which returned a fixed token to anyone). This is
// a real authorization server built on ShadowPaste's own user accounts:
//
//   /oauth/register  RFC 7591 dynamic client registration
//   /oauth/authorize authorization-code grant, PKCE REQUIRED (S256)
//   /oauth/token     code exchange + refresh rotation, RFC 6749 errors
//   /oauth/revoke    RFC 7009 revocation
//
// Security properties:
//   * Client secrets and ALL tokens are stored as SHA-256 hashes only. Reading
//     the database yields nothing usable.
//   * PKCE is mandatory and only S256 is accepted ("plain" is rejected) —
//     OAuth 2.1 removes the implicit and password grants and requires PKCE.
//   * redirect_uri is exact-matched against the registered set (no prefix or
//     wildcard matching, which is a classic open-redirect / code-theft vector).
//   * Authorization codes are single-use and short-lived; replay is detected.
//   * Refresh tokens rotate, and replaying a consumed refresh token revokes the
//     entire token family (RFC 9700 / OAuth 2.1 BCP).
//   * Tokens are opaque 256-bit random values, not guessable and not JWTs whose
//     signature could be stripped.

import { db } from "@/lib/db";
import { getAppUrl } from "./app-url";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const OAUTH_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

const ACCESS_TTL_MS = 60 * 60 * 1000;          // 1 hour
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CODE_TTL_MS = 60 * 1000;                  // 1 minute (OAuth 2.1 guidance)
export const SUPPORTED_SCOPES = ["mcp", "openid", "profile"];

/** Tokens/secrets are never stored in the clear. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Constant-time compare for client secrets. */
function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** RFC 8414 Authorization Server Metadata, with endpoints on the live host. */
export function authServerMetadata(req: Request) {
  const base = getAppUrl(req);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // OAuth 2.1: PKCE is mandatory and "plain" is not offered.
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: SUPPORTED_SCOPES,
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
  };
}

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 *
 * The MCP authorization spec requires a resource server to publish this so a
 * client can discover WHICH authorization server guards it, instead of guessing
 * that the AS lives on the same origin. Without it, a strict MCP client that
 * receives a 401 from /api/mcp has no defined way to find the token endpoint and
 * simply fails the connection — /.well-known/oauth-protected-resource returned
 * 404 before this existed.
 */
export function protectedResourceMetadata(req: Request) {
  const base = getAppUrl(req);
  return {
    // The resource identifier clients request tokens FOR.
    resource: base,
    authorization_servers: [base],
    scopes_supported: SUPPORTED_SCOPES,
    // Tokens go in the Authorization header, never a query parameter — a token
    // in a URL leaks into logs, referrers and browser history.
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/docs`,
  };
}

/**
 * RFC 9728 §5.1 — the `WWW-Authenticate` challenge on a 401 SHOULD carry
 * `resource_metadata` so a client can find the metadata document without
 * probing well-known paths.
 */
export function bearerChallenge(req: Request, error?: string, description?: string): string {
  const base = getAppUrl(req);
  const parts = [
    `Bearer realm="shadowpaste"`,
    `resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  ];
  if (error) parts.push(`error="${error}"`);
  if (description) parts.push(`error_description="${description.replace(/"/g, "'")}"`);
  return parts.join(", ");
}

// ---- RFC 6749 §5.2 error envelope -------------------------------------------
export interface OAuthError { error: string; error_description?: string }
export function oauthError(error: string, description?: string): OAuthError {
  return description ? { error, error_description: description } : { error };
}

// ---- Client registration ----------------------------------------------------
export interface RegisteredClient {
  clientId: string;
  clientSecret?: string; // returned ONCE at registration; only the hash is stored
  redirectUris: string[];
}

export async function registerClient(input: {
  clientName?: string;
  redirectUris: string[];
  grantTypes?: string[];
  scope?: string;
  tokenEndpointAuthMethod?: string;
}): Promise<RegisteredClient> {
  const clientId = `sp_${randomBytes(16).toString("hex")}`;
  const method = input.tokenEndpointAuthMethod || "none";
  // Public clients (native/SPA/MCP) use PKCE with no secret. Confidential
  // clients get a secret we return once and never store in the clear.
  const secret = method === "none" ? undefined : randomBytes(32).toString("base64url");

  await db.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash: secret ? hashToken(secret) : null,
      clientName: input.clientName || "MCP Client",
      redirectUris: JSON.stringify(input.redirectUris),
      grantTypes: JSON.stringify(input.grantTypes || ["authorization_code", "refresh_token"]),
      scope: input.scope || "mcp",
      tokenEndpointAuthMethod: method,
    },
  });
  return { clientId, clientSecret: secret, redirectUris: input.redirectUris };
}

/** Authenticate a client at the token/revocation endpoint. */
export async function authenticateClient(clientId: string, presentedSecret: string | null) {
  const client = await db.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return null;
  if (!client.clientSecretHash) return client;           // public client — PKCE is the proof
  if (!presentedSecret) return null;
  return safeEqualHex(hashToken(presentedSecret), client.clientSecretHash) ? client : null;
}

/** Exact-match redirect_uri check — never prefix/wildcard. */
export function redirectUriAllowed(client: { redirectUris: string }, uri: string): boolean {
  try {
    const list = JSON.parse(client.redirectUris) as string[];
    return Array.isArray(list) && list.includes(uri);
  } catch {
    return false;
  }
}

// ---- Authorization codes ----------------------------------------------------
export async function issueAuthorizationCode(opts: {
  clientId: string; userId: string; orgId: string; redirectUri: string;
  scope: string; codeChallenge: string;
}): Promise<string> {
  const code = randomToken();
  await db.oAuthCode.create({
    data: {
      codeHash: hashToken(code),
      clientId: opts.clientId,
      userId: opts.userId,
      orgId: opts.orgId,
      redirectUri: opts.redirectUri,
      scope: opts.scope,
      codeChallenge: opts.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

/** PKCE S256 verification: BASE64URL(SHA256(code_verifier)) === code_challenge. */
export function verifyPkce(codeVerifier: string, challenge: string): boolean {
  if (typeof codeVerifier !== "string" || codeVerifier.length < 43 || codeVerifier.length > 128) return false;
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return computed.length === challenge.length && timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}

// ---- Tokens -----------------------------------------------------------------
export interface IssuedTokens {
  access_token: string; token_type: "Bearer"; expires_in: number;
  refresh_token: string; scope: string;
}

export async function issueTokens(opts: {
  clientId: string; userId: string; orgId: string; scope: string; familyId?: string;
}): Promise<IssuedTokens> {
  const access = randomToken();
  const refresh = randomToken();
  const familyId = opts.familyId || randomBytes(16).toString("hex");
  const now = Date.now();
  await db.oAuthToken.createMany({
    data: [
      { tokenHash: hashToken(access), type: "access", clientId: opts.clientId, userId: opts.userId, orgId: opts.orgId, scope: opts.scope, expiresAt: new Date(now + ACCESS_TTL_MS), familyId },
      { tokenHash: hashToken(refresh), type: "refresh", clientId: opts.clientId, userId: opts.userId, orgId: opts.orgId, scope: opts.scope, expiresAt: new Date(now + REFRESH_TTL_MS), familyId },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: Math.floor(ACCESS_TTL_MS / 1000), refresh_token: refresh, scope: opts.scope };
}

/** Resolve a bearer access token. Returns null when missing/expired/revoked. */
export async function validateAccessToken(raw: string): Promise<{ userId: string; orgId: string; scope: string; clientId: string } | null> {
  if (!raw) return null;
  const row = await db.oAuthToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!row || row.type !== "access" || row.revokedAt || row.expiresAt < new Date()) return null;
  return { userId: row.userId, orgId: row.orgId, scope: row.scope, clientId: row.clientId };
}

/** Revoke every token in a family — used when a rotated refresh token is replayed. */
export async function revokeFamily(familyId: string): Promise<void> {
  await db.oAuthToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeToken(raw: string): Promise<boolean> {
  const res = await db.oAuthToken.updateMany({ where: { tokenHash: hashToken(raw), revokedAt: null }, data: { revokedAt: new Date() } });
  return res.count > 0;
}

/** Parse client credentials from Basic auth or the POST body (RFC 6749 §2.3). */
export function parseClientAuth(req: Request, body: URLSearchParams): { clientId: string | null; clientSecret: string | null } {
  const auth = req.headers.get("authorization") || "";
  const basic = auth.match(/^Basic\s+(.+)$/i);
  if (basic) {
    try {
      const [id, ...rest] = Buffer.from(basic[1], "base64").toString("utf8").split(":");
      return { clientId: decodeURIComponent(id), clientSecret: decodeURIComponent(rest.join(":")) };
    } catch { /* fall through to body */ }
  }
  return { clientId: body.get("client_id"), clientSecret: body.get("client_secret") };
}
