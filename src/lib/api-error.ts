// ShadowPaste — safe error responses for API routes.
//
// An unexpected exception must never hand the caller internal detail. Node fs
// errors embed absolute host paths ("ENOENT: ... 'C:\\Users\\...'"), Prisma
// errors quote schema/column names and connection strings, and a raw stack
// discloses the install layout. All of that is useful to an attacker mapping the
// host and useless to a legitimate client.
//
// The real error is logged server-side (where operators can see it) and the
// caller receives a stable, generic message plus a correlation id they can quote
// in a bug report.

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * Log the true error and return a sanitized 500 response.
 *
 * @param e        the caught exception
 * @param context  short label for the server log (e.g. "workspace.create")
 * @param status   HTTP status (default 500)
 */
export function internalError(e: unknown, context: string, status = 500) {
  const errorId = randomBytes(6).toString("hex");
  // Full detail stays on the server.
  console.error(`[${context}] errorId=${errorId}`, e);
  return NextResponse.json(
    {
      error: "internal error",
      errorId,
      hint: "The server logged the details; quote errorId when reporting this.",
    },
    { status }
  );
}
