import { NextRequest, NextResponse } from "next/server";
import { protectedResourceMetadata, OAUTH_CORS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
//
// Required by the MCP authorization spec. This path returned 404, so a strict
// MCP client that got a 401 from /api/mcp had no defined way to discover which
// authorization server to talk to and would fail the connection rather than
// assume the AS shares this origin.
export async function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req), { headers: OAUTH_CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
