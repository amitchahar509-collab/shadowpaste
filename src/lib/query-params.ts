// ShadowPaste — safe query-parameter coercion.
//
// THE BUG THIS FIXES
// ------------------
// Limits were parsed as `Math.min(parseInt(raw || "100"), 500)`, which passes
// attacker-controlled values straight into Prisma's `take`:
//
//   ?limit=-1     -> take: -1    Prisma treats a negative take as "last N",
//                                silently REVERSING pagination direction, so a
//                                caller asking for one row gets the oldest
//                                instead of the newest — a quiet correctness bug
//                                in a compliance trail.
//   ?limit=-100   -> take: -100  same, at scale
//   ?limit=abc    -> take: NaN   Prisma throws -> HTTP 500 on a malformed query
//                                string, i.e. a trivially reachable error path
//   ?limit=0      -> take: 0     returns nothing, looks like "no data"
//
// Every one of those is reachable without authentication on any route that reads
// a limit. Coercion is centralised here so a new route cannot reintroduce it.

export interface IntParamOptions {
  /** Value used when the parameter is absent, empty, or unparseable. */
  fallback: number;
  /** Smallest value the caller may request. */
  min?: number;
  /** Largest value the caller may request — protects the database, not the caller. */
  max: number;
}

/**
 * Parse an integer query parameter, clamped and never NaN.
 *
 * Unparseable input yields the fallback rather than an error: a malformed query
 * string is a client mistake, not a server fault, and returning 500 for it hands
 * out a free error-path probe.
 */
export function intParam(raw: string | null | undefined, opts: IntParamOptions): number {
  const { fallback, max } = opts;
  const min = opts.min ?? 1;

  if (raw === null || raw === undefined || raw.trim() === "") return clamp(fallback, min, max);

  // parseInt("12abc") is 12, which quietly accepts junk. Require a clean integer.
  const trimmed = raw.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return clamp(fallback, min, max);

  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return clamp(fallback, min, max);
  return clamp(n, min, max);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** Standard list limit: at least 1, at most `max`, default `fallback`. */
export function limitParam(raw: string | null | undefined, fallback = 100, max = 500): number {
  return intParam(raw, { fallback, min: 1, max });
}
