import { NextRequest, NextResponse } from "next/server";
import { OAUTH_CORS, authenticateClient, parseClientAuth, revokeToken } from "@/lib/oauth";

export const runtime = "nodejs";

// RFC 7009 — Token Revocation.
// Per spec the endpoint returns 200 even for an unknown token, so a caller
// cannot use it to probe which tokens exist.
export async function POST(req: NextRequest) {
  const raw = await req.text().catch(() => "");
  const body = new URLSearchParams(raw);
  const { clientId, clientSecret } = parseClientAuth(req, body);

  if (!clientId) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401, headers: OAUTH_CORS });
  }
  const client = await authenticateClient(clientId, clientSecret);
  if (!client) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401, headers: OAUTH_CORS });
  }

  const token = body.get("token");
  if (token) await revokeToken(token);
  return new NextResponse(null, { status: 200, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
