import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getContext } from "@/lib/auth";
import { OAUTH_CORS, redirectUriAllowed, issueAuthorizationCode, oauthError } from "@/lib/oauth";

export const runtime = "nodejs";

// OAuth 2.1 authorization endpoint — REAL.
//
// The previous stub auto-approved every request and redirected with a dummy
// code, so anyone could obtain a token. This now:
//   1. validates the client and EXACT-MATCHES redirect_uri before any redirect
//      (errors before that point must NOT be redirected — RFC 6749 §4.1.2.1),
//   2. requires PKCE with S256,
//   3. requires a real authenticated ShadowPaste session; an anonymous caller is
//      sent to sign in rather than being issued a code,
//   4. issues a single-use, short-lived code bound to the user, client,
//      redirect_uri and code_challenge.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const responseType = p.get("response_type");
  const state = p.get("state");
  const codeChallenge = p.get("code_challenge");
  const codeChallengeMethod = p.get("code_challenge_method");
  const scope = p.get("scope") || "mcp";

  // --- Errors that must NOT redirect (client/redirect_uri not yet trusted) ---
  if (!clientId) {
    return NextResponse.json(oauthError("invalid_request", "client_id is required"), { status: 400, headers: OAUTH_CORS });
  }
  const client = await db.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return NextResponse.json(oauthError("invalid_client", "unknown client_id"), { status: 400, headers: OAUTH_CORS });
  }
  if (!redirectUri || !redirectUriAllowed(client, redirectUri)) {
    return NextResponse.json(
      oauthError("invalid_request", "redirect_uri does not exactly match a registered URI"),
      { status: 400, headers: OAUTH_CORS }
    );
  }

  // --- From here the redirect_uri is trusted: errors go back to the client ---
  const fail = (error: string, description: string) => {
    const dest = new URL(redirectUri);
    dest.searchParams.set("error", error);
    dest.searchParams.set("error_description", description);
    if (state) dest.searchParams.set("state", state);
    return NextResponse.redirect(dest.toString(), 302);
  };

  if (responseType !== "code") return fail("unsupported_response_type", "only response_type=code is supported");
  // OAuth 2.1: PKCE is mandatory, and "plain" is not accepted.
  if (!codeChallenge) return fail("invalid_request", "code_challenge is required (PKCE)");
  if (codeChallengeMethod !== "S256") return fail("invalid_request", "code_challenge_method must be S256");

  // --- Require a real, authenticated ShadowPaste user ---
  const ctx = await getContext(req);
  if (!ctx || !ctx.user) {
    // Not signed in: bounce to the app so the user can authenticate, preserving
    // the full authorization request so it can be replayed afterwards.
    const back = new URL("/", req.nextUrl.origin);
    back.searchParams.set("oauth_authorize", req.nextUrl.search.replace(/^\?/, ""));
    return NextResponse.redirect(back.toString(), 302);
  }

  const code = await issueAuthorizationCode({
    clientId,
    userId: ctx.user.id,
    orgId: ctx.orgId,
    redirectUri,
    scope,
    codeChallenge,
  });

  const dest = new URL(redirectUri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return NextResponse.redirect(dest.toString(), 302);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
