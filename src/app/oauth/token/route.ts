import { NextRequest, NextResponse } from "next/server";
import { OAUTH_CORS } from "@/lib/oauth";

export const runtime = "nodejs";

// OAuth 2.0 token endpoint (stub). Accepts any grant (authorization_code or
// refresh_token) and returns a fixed bearer token. /api/mcp accepts this token
// and resolves it to an agent identity via the gateway.
export async function POST(req: NextRequest) {
  // Body (form-encoded or JSON) is intentionally not validated — this is a stub.
  await req.text().catch(() => "");
  return NextResponse.json(
    {
      access_token: "shadowpaste-access-token",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "shadowpaste-refresh-token",
      scope: "mcp",
    },
    { headers: OAUTH_CORS }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
