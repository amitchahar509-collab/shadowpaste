// ShadowPaste — OAuth 2.0 discovery + stub endpoints for MCP connectors.
//
// Claude Web / Desktop Custom Connectors drive the RFC 8414 (Authorization
// Server Metadata) + RFC 7591 (Dynamic Client Registration) flow before they
// will talk to /api/mcp. This module provides the shared metadata builder and
// CORS headers used by the .well-known and /oauth/* route handlers.
//
// SECURITY NOTE: these are STUBS. /oauth/authorize issues a code to any caller
// and /oauth/token returns a fixed bearer token — there is no real user login.
// That matches the MCP endpoint, which already accepts any token and enforces
// its policy at the gateway (risk → policy → audit) rather than at the door.
// Do NOT treat the issued token as proof of a user's identity.

import { getAppUrl } from "./app-url";

export const OAUTH_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
  "Access-Control-Max-Age": "86400",
};

/** RFC 8414 Authorization Server Metadata, with endpoints on the live host. */
export function authServerMetadata(req: Request) {
  const base = getAppUrl(req); // NEXT_PUBLIC_APP_URL → forwarded proto/host → origin
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: ["openid", "profile", "mcp"],
  };
}
