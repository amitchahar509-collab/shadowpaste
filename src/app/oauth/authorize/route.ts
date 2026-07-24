import { NextRequest, NextResponse } from "next/server";
import { OAUTH_CORS } from "@/lib/oauth";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

// OAuth 2.0 authorization endpoint (stub). Auto-approves: redirects straight
// back to the client's redirect_uri with a dummy authorization code and the
// original state. No login UI, no PKCE verification (the token stub accepts any
// code_verifier).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const redirectUri = p.get("redirect_uri");
  const state = p.get("state");

  if (!redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "missing redirect_uri" },
      { status: 400, headers: OAUTH_CORS }
    );
  }
  let dest: URL;
  try {
    dest = new URL(redirectUri);
  } catch {
    return NextResponse.json(
      { error: "invalid_request", error_description: "invalid redirect_uri" },
      { status: 400, headers: OAUTH_CORS }
    );
  }

  dest.searchParams.set("code", `spauth_${randomBytes(16).toString("hex")}`);
  if (state) dest.searchParams.set("state", state);
  return NextResponse.redirect(dest.toString(), 302);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
