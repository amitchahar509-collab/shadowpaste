import { NextRequest, NextResponse } from "next/server";
import { protectedResourceMetadata, OAUTH_CORS } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 §3.1 path-scoped discovery.
//
// When a protected resource has a path, the metadata document lives at
// /.well-known/oauth-protected-resource/<path>. Since the MCP endpoint is
// /api/mcp, conformant clients probe
// /.well-known/oauth-protected-resource/api/mcp before falling back to the root
// document. Serving both means discovery succeeds whichever convention a client
// implements, rather than depending on it guessing the one we happened to ship.
export async function GET(req: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(req), { headers: OAUTH_CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS });
}
