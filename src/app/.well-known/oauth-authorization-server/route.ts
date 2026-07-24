import { NextRequest, NextResponse } from "next/server";
import { authServerMetadata, OAUTH_CORS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8414 — OAuth 2.0 Authorization Server Metadata discovery.
export async function GET(req: NextRequest) {
  return NextResponse.json(authServerMetadata(req), { headers: OAUTH_CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
