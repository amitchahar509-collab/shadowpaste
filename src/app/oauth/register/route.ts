import { NextRequest, NextResponse } from "next/server";
import { OAUTH_CORS } from "@/lib/oauth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

// RFC 7591 — Dynamic Client Registration (stub). Accepts any client metadata,
// returns a fresh client_id/secret. The values are not persisted or verified;
// the authorize/token stubs accept anything.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  return NextResponse.json(
    {
      client_id: `shadowpaste-${randomBytes(8).toString("hex")}`,
      client_secret: randomBytes(24).toString("hex"),
      client_id_issued_at: now,
      client_secret_expires_at: 0, // 0 = never expires (RFC 7591)
      // Echo back the client's requested metadata so it validates the response.
      redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
      grant_types: (body.grant_types as string[]) || ["authorization_code"],
      response_types: (body.response_types as string[]) || ["code"],
      token_endpoint_auth_method: (body.token_endpoint_auth_method as string) || "none",
    },
    { status: 201, headers: OAUTH_CORS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
