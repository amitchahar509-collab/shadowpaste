import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  OAUTH_CORS, oauthError, authenticateClient, parseClientAuth, hashToken,
  verifyPkce, issueTokens, revokeFamily,
} from "@/lib/oauth";

export const runtime = "nodejs";

// OAuth 2.1 token endpoint — REAL.
// Previously returned the fixed string "shadowpaste-access-token" to any caller.
// Now: authenticates the client, verifies the PKCE code_verifier, enforces
// single-use codes, and rotates refresh tokens with replay detection.
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    // RFC 6749 §5.1 — token responses must not be cached.
    headers: { ...OAUTH_CORS, "Cache-Control": "no-store", Pragma: "no-cache" },
  });

export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const body = new URLSearchParams(raw);
  const grantType = body.get("grant_type");

  const { clientId, clientSecret } = parseClientAuth(req, body);
  if (!clientId) return json(oauthError("invalid_client", "client_id is required"), 401);

  const client = await authenticateClient(clientId, clientSecret);
  if (!client) return json(oauthError("invalid_client", "client authentication failed"), 401);

  // ---------------- authorization_code ----------------
  if (grantType === "authorization_code") {
    const code = body.get("code");
    const redirectUri = body.get("redirect_uri");
    const codeVerifier = body.get("code_verifier");
    if (!code || !redirectUri || !codeVerifier) {
      return json(oauthError("invalid_request", "code, redirect_uri and code_verifier are required"), 400);
    }

    const row = await db.oAuthCode.findUnique({ where: { codeHash: hashToken(code) } });
    if (!row || row.clientId !== clientId) {
      return json(oauthError("invalid_grant", "authorization code is invalid"), 400);
    }
    // Replay of an already-consumed code: treat as compromise and revoke
    // everything issued from it (OAuth 2.1 / RFC 9700).
    if (row.consumedAt) {
      await db.oAuthToken.updateMany({ where: { userId: row.userId, clientId, revokedAt: null }, data: { revokedAt: new Date() } });
      return json(oauthError("invalid_grant", "authorization code has already been used"), 400);
    }
    if (row.expiresAt < new Date()) return json(oauthError("invalid_grant", "authorization code has expired"), 400);
    if (row.redirectUri !== redirectUri) return json(oauthError("invalid_grant", "redirect_uri does not match the authorization request"), 400);
    if (!verifyPkce(codeVerifier, row.codeChallenge)) return json(oauthError("invalid_grant", "PKCE verification failed"), 400);

    // Single-use: mark consumed before issuing.
    await db.oAuthCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    const tokens = await issueTokens({ clientId, userId: row.userId, orgId: row.orgId, scope: row.scope });
    return json(tokens);
  }

  // ---------------- refresh_token (with rotation) ----------------
  if (grantType === "refresh_token") {
    const presented = body.get("refresh_token");
    if (!presented) return json(oauthError("invalid_request", "refresh_token is required"), 400);

    const row = await db.oAuthToken.findUnique({ where: { tokenHash: hashToken(presented) } });
    if (!row || row.type !== "refresh" || row.clientId !== clientId) {
      return json(oauthError("invalid_grant", "refresh token is invalid"), 400);
    }
    // A revoked refresh token being presented means it was rotated already and
    // someone replayed the old one — kill the whole family.
    if (row.revokedAt) {
      await revokeFamily(row.familyId);
      return json(oauthError("invalid_grant", "refresh token was already used; token family revoked"), 400);
    }
    if (row.expiresAt < new Date()) return json(oauthError("invalid_grant", "refresh token has expired"), 400);

    // Rotate: revoke the presented refresh token (and its access sibling), then
    // mint a fresh pair inside the same family.
    await db.oAuthToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    const tokens = await issueTokens({ clientId, userId: row.userId, orgId: row.orgId, scope: row.scope, familyId: row.familyId });
    return json(tokens);
  }

  // OAuth 2.1 removes implicit and resource-owner-password grants entirely.
  return json(oauthError("unsupported_grant_type", "only authorization_code and refresh_token are supported"), 400);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
