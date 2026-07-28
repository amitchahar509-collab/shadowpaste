import { NextRequest, NextResponse } from "next/server";
import { OAUTH_CORS, registerClient, oauthError } from "@/lib/oauth";

export const runtime = "nodejs";

// RFC 7591 — Dynamic Client Registration (REAL: persists the client).
// Previously this returned an unpersisted, unverifiable id/secret pair.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json(oauthError("invalid_client_metadata", "request body must be JSON"), { status: 400, headers: OAUTH_CORS });
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [];
  // Every redirect URI must be absolute and https (or localhost for native/dev
  // clients). A relative or javascript: URI is a redirect-injection vector.
  for (const u of redirectUris) {
    let parsed: URL;
    try { parsed = new URL(u); } catch {
      return NextResponse.json(oauthError("invalid_redirect_uri", `not an absolute URI: ${u}`), { status: 400, headers: OAUTH_CORS });
    }
    const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
    if (parsed.protocol !== "https:" && !isLoopback) {
      return NextResponse.json(oauthError("invalid_redirect_uri", `redirect_uri must use https (or loopback): ${u}`), { status: 400, headers: OAUTH_CORS });
    }
  }
  if (redirectUris.length === 0) {
    return NextResponse.json(oauthError("invalid_redirect_uri", "at least one redirect_uri is required"), { status: 400, headers: OAUTH_CORS });
  }

  const method = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  const client = await registerClient({
    clientName: typeof body.client_name === "string" ? body.client_name : undefined,
    redirectUris,
    grantTypes: Array.isArray(body.grant_types) ? (body.grant_types as string[]) : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
    tokenEndpointAuthMethod: method,
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      // Present only for confidential clients; this is the ONLY time it is
      // returned — the server stores a SHA-256 hash and cannot reproduce it.
      ...(client.clientSecret ? { client_secret: client.clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: client.redirectUris,
      grant_types: Array.isArray(body.grant_types) ? body.grant_types : ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
    },
    { status: 201, headers: OAUTH_CORS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
