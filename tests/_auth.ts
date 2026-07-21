// Shared war-test authentication helper.
//
// Mutating endpoints (/api/agents POST, /api/mcp/call, /api/scan, /api/workspace/*)
// require an authenticated session — anonymous access to them is a security
// hole, not a feature. These integration scripts therefore bootstrap a
// throwaway account and reuse its session cookie for the run.

export async function authCookie(base: string): Promise<string> {
  const rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const email = `wartest+${rnd}@example.com`;
  const password = "WarTest-Str0ng!pass";

  const signup = await fetch(`${base}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "War Test" }),
    signal: AbortSignal.timeout(10_000),
  });
  let cookie = extractSessionCookie(signup.headers.get("set-cookie"));
  if (cookie) return cookie;

  // Account may already exist from a prior run — fall back to login.
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(10_000),
  });
  cookie = extractSessionCookie(login.headers.get("set-cookie"));
  if (cookie) return cookie;

  throw new Error("could not obtain a session cookie (signup + login both failed)");
}

function extractSessionCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const m = setCookie.match(/sp_session=([^;]+)/);
  return m ? `sp_session=${m[1]}` : "";
}
