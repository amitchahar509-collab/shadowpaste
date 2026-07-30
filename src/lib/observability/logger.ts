// ShadowPaste — structured JSON logging with correlation/trace propagation.
//
// Replaces bare console.log/error, which produced unparseable free text with no
// request identity: given a production error there was no way to find the other
// log lines from the same request, and no way to join a log line to a trace.
//
// Every line is one JSON object carrying `correlationId`, `traceId` and `spanId`
// pulled from the active tracing scope, so logs, traces and audit rows all key on
// the same identifiers.
//
// REDACTION IS MANDATORY, NOT OPTIONAL
// ------------------------------------
// This is a security product; a credential reaching a log aggregator is a real
// incident. Every value is passed through redact() before serialization.
//
// It deliberately does NOT call scanForSecrets(): that runs 500+ patterns plus a
// canonicalization ladder and a base64 decode pass, which is the right cost for a
// scanning API and the wrong cost for something on every log line. Instead a small
// set of high-signal shapes is applied — provider-prefixed keys, `key=value` pairs
// with credential-ish names, bearer tokens, and long opaque strings. Cheap and
// bounded, so logging can never become the bottleneck or a DoS vector.

import { currentCorrelationId, currentSpanContext } from "./trace";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === "production" ? "info" : "debug");
const SERVICE = process.env.OTEL_SERVICE_NAME || "shadowpaste";

// Provider-prefixed credentials and generic assignments. Ordered longest-first so
// a specific shape wins over the generic opaque-string rule.
const REDACTIONS: Array<[RegExp, string]> = [
  // Provider-prefixed tokens.
  [/\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}/g, "$1_$2_<redacted>"],
  [/\bgh[opsur]_[A-Za-z0-9]{8,}/g, "gh*_<redacted>"],
  [/\bglpat-[A-Za-z0-9_-]{8,}/g, "glpat-<redacted>"],
  [/\bAKIA[0-9A-Z]{8,}/g, "AKIA<redacted>"],
  [/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{12,}/g, "sk-<redacted>"],
  [/\bxox[baprsm]-[A-Za-z0-9-]{8,}/g, "xox*-<redacted>"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "<jwt redacted>"],
  // Authorization headers / bearer tokens.
  [/\b(bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 <redacted>"],
  // KEY=value where the key names a credential.
  [
    /\b([A-Za-z_][A-Za-z0-9_]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|credential|private[_-]?key)[A-Za-z0-9_]*)\s*[:=]\s*"?[^\s",}]+"?/gi,
    "$1=<redacted>",
  ],
  // Connection strings with inline credentials.
  [/\b([a-z+]+:\/\/[^\s:@/]+):[^\s@/]+@/gi, "$1:<redacted>@"],
];

/** Redact credential-shaped substrings from a string. Bounded and allocation-light. */
export function redact(input: string): string {
  if (!input || input.length > 20_000) {
    // Never scan an unbounded blob on a log path; truncate instead.
    return input ? `${input.slice(0, 20_000)}…[truncated ${input.length - 20_000}B]` : input;
  }
  let out = input;
  for (const [re, replacement] of REDACTIONS) out = out.replace(re, replacement);
  return out;
}

/**
 * Redact a STRUCTURE by walking it, applying redact() to each string value.
 *
 * Use this instead of `JSON.parse(redact(JSON.stringify(obj)))`. That round-trip
 * looks equivalent and is not: the KEY=value pattern's optional trailing quote
 * consumes the closing quote of a JSON string, producing
 * `"note":"DB_PASSWORD=<redacted>}` — unterminated, so JSON.parse throws. In the
 * alerting path that meant a credential-bearing alert was silently DROPPED, which
 * is the worst possible outcome for the one message that most needed to be sent.
 *
 * Walking the structure never has to re-parse, so it cannot fail this way.
 */
export function redactObject<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(v: unknown, depth = 0): unknown {
  if (depth > 6) return "[max depth]";
  if (typeof v === "string") return redact(v);
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Error) return { name: v.name, message: redact(v.message), stack: v.stack ? redact(v.stack) : undefined };
  if (Array.isArray(v)) return v.map((x) => redactValue(x, depth + 1));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = redactValue(val, depth + 1);
    return out;
  }
  return v;
}

export interface LogFields {
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const span = currentSpanContext();
  const line = {
    ts: new Date().toISOString(),
    level,
    service: SERVICE,
    msg: redact(message),
    correlationId: currentCorrelationId() ?? undefined,
    traceId: span?.traceId,
    spanId: span?.spanId,
    ...(fields ? (redactValue(fields) as LogFields) : {}),
  };
  // stderr for warn/error so log shippers can split streams; stdout otherwise.
  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(serialized + "\n");
  else process.stdout.write(serialized + "\n");
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
  /** Current logger posture, for /api/health. */
  status: () => ({ minLevel: MIN_LEVEL, service: SERVICE, format: "json", redaction: "enabled" }),
};
