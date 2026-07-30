// ShadowPaste — distributed tracing (W3C Trace Context + OTLP export).
//
// WHY THIS IS HAND-ROLLED RATHER THAN @opentelemetry/sdk-node
// ----------------------------------------------------------
// The OTel SDK pulls a large dependency tree, requires a running collector to
// verify anything, and its auto-instrumentation does not work cleanly inside
// Next.js route handlers on the edge/serverless boundary. Installing it would
// have produced a dependency we could not runtime-verify in this environment —
// i.e. an unverifiable completion claim.
//
// Instead this implements the parts that actually carry the value and ARE
// verifiable here:
//   * W3C Trace Context (https://www.w3.org/TR/trace-context/) — `traceparent`
//     parsing and propagation, so traces join up across services and any
//     OTel-instrumented caller/callee stitches correctly.
//   * A span model with the OTLP field names and semantics (traceId, spanId,
//     parentSpanId, name, kind, startTimeUnixNano, endTimeUnixNano, attributes,
//     status), so export needs no translation layer.
//   * OTLP/HTTP JSON export when OTEL_EXPORTER_OTLP_ENDPOINT is set; otherwise
//     spans stay in a bounded in-process ring buffer readable via
//     /api/v1/traces.
//
// So: OpenTelemetry-COMPATIBLE by wire format and propagation, not "the OTel SDK
// is installed". That distinction is deliberate and stated rather than blurred.

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export type SpanKind = "SERVER" | "CLIENT" | "INTERNAL" | "PRODUCER" | "CONSUMER";
export type SpanStatus = "UNSET" | "OK" | "ERROR";

export interface SpanContext {
  traceId: string; // 32 lowercase hex
  spanId: string; // 16 lowercase hex
  /** W3C trace-flags; bit 0 = sampled. */
  traceFlags: number;
  /** True when the parent context arrived from a remote caller. */
  remote: boolean;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Record<string, string | number | boolean>;
  status: SpanStatus;
  statusMessage?: string;
  /** Convenience for dashboards; derived, not part of OTLP. */
  durationMs?: number;
}

const HEX16 = /^[0-9a-f]{16}$/;
const HEX32 = /^[0-9a-f]{32}$/;
const INVALID_TRACE = "00000000000000000000000000000000";
const INVALID_SPAN = "0000000000000000";

export const newTraceId = () => randomBytes(16).toString("hex");
export const newSpanId = () => randomBytes(8).toString("hex");

/**
 * Parse a W3C `traceparent` header.
 *
 * Format: `00-<32 hex traceId>-<16 hex spanId>-<2 hex flags>`
 *
 * Returns null for anything malformed — an invalid header MUST start a new trace
 * rather than silently corrupt an existing one (spec §3.2.2.3). All-zero ids are
 * explicitly invalid, which a naive hex check would accept.
 */
export function parseTraceparent(header: string | null | undefined): SpanContext | null {
  if (!header) return null;
  const parts = header.trim().split("-");
  if (parts.length !== 4) return null;
  const [version, traceId, spanId, flags] = parts;
  // Future versions must still be parsed if the first four fields are valid.
  if (!/^[0-9a-f]{2}$/.test(version) || version === "ff") return null;
  if (!HEX32.test(traceId) || traceId === INVALID_TRACE) return null;
  if (!HEX16.test(spanId) || spanId === INVALID_SPAN) return null;
  if (!/^[0-9a-f]{2}$/.test(flags)) return null;
  return { traceId, spanId, traceFlags: parseInt(flags, 16), remote: true };
}

/** Serialize a context into a `traceparent` header for outbound propagation. */
export function formatTraceparent(ctx: SpanContext): string {
  const flags = (ctx.traceFlags & 0xff).toString(16).padStart(2, "0");
  return `00-${ctx.traceId}-${ctx.spanId}-${flags}`;
}

// ---------------------------------------------------------------------------
// Span buffer + export
// ---------------------------------------------------------------------------

const MAX_SPANS = 1000; // bounded: traces must never become the memory leak
const spans: Span[] = [];
let dropped = 0;

function record(span: Span): void {
  spans.push(span);
  while (spans.length > MAX_SPANS) {
    spans.shift();
    dropped++;
  }
  void exportSpan(span);
}

const OTLP_ENDPOINT = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "").replace(/\/+$/, "");
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || "shadowpaste";

/** True when spans are shipped to a collector rather than only buffered. */
export const tracingExportEnabled = () => Boolean(OTLP_ENDPOINT);

/**
 * Ship one span as OTLP/HTTP JSON. Best-effort and fire-and-forget: telemetry
 * must never fail a request or add latency to it, so errors are counted rather
 * than thrown.
 */
let exportFailures = 0;
async function exportSpan(span: Span): Promise<void> {
  if (!OTLP_ENDPOINT) return;
  try {
    const body = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: SERVICE_NAME } }] },
          scopeSpans: [
            {
              scope: { name: "shadowpaste.gateway" },
              spans: [
                {
                  traceId: span.traceId,
                  spanId: span.spanId,
                  parentSpanId: span.parentSpanId ?? "",
                  name: span.name,
                  kind: kindToOtlp(span.kind),
                  startTimeUnixNano: span.startTimeUnixNano,
                  endTimeUnixNano: span.endTimeUnixNano ?? span.startTimeUnixNano,
                  attributes: Object.entries(span.attributes).map(([key, v]) => ({
                    key,
                    value:
                      typeof v === "number"
                        ? Number.isInteger(v)
                          ? { intValue: String(v) }
                          : { doubleValue: v }
                        : typeof v === "boolean"
                          ? { boolValue: v }
                          : { stringValue: String(v) },
                  })),
                  status: { code: span.status === "OK" ? 1 : span.status === "ERROR" ? 2 : 0, message: span.statusMessage ?? "" },
                },
              ],
            },
          ],
        },
      ],
    };
    await fetch(`${OTLP_ENDPOINT}/v1/traces`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    exportFailures++;
  }
}

function kindToOtlp(k: SpanKind): number {
  return { INTERNAL: 1, SERVER: 2, CLIENT: 3, PRODUCER: 4, CONSUMER: 5 }[k] ?? 0;
}

// ---------------------------------------------------------------------------
// Active context
// ---------------------------------------------------------------------------

interface ActiveContext {
  span: SpanContext;
  correlationId: string;
}

const store = new AsyncLocalStorage<ActiveContext>();

/** The active span context, or null outside any traced scope. */
export const currentSpanContext = (): SpanContext | null => store.getStore()?.span ?? null;

/** The active correlation id, or null outside any traced scope. */
export const currentCorrelationId = (): string | null => store.getStore()?.correlationId ?? null;

/**
 * Run `fn` inside a new span.
 *
 * The span is closed and recorded even when `fn` throws, and the error is
 * attached as status ERROR — an un-ended span is worse than no span, because it
 * silently disappears from every trace view.
 */
export async function withSpan<T>(
  name: string,
  opts: { kind?: SpanKind; parent?: SpanContext | null; correlationId?: string; attributes?: Record<string, string | number | boolean> },
  fn: (ctx: SpanContext) => Promise<T>
): Promise<T> {
  const parent = opts.parent ?? currentSpanContext();
  const ctx: SpanContext = {
    traceId: parent?.traceId ?? newTraceId(),
    spanId: newSpanId(),
    traceFlags: parent?.traceFlags ?? 1,
    remote: false,
  };
  const span: Span = {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: parent?.spanId,
    name,
    kind: opts.kind ?? "INTERNAL",
    startTimeUnixNano: String(Date.now() * 1_000_000),
    attributes: { ...(opts.attributes ?? {}) },
    status: "UNSET",
  };
  const started = Date.now();
  const correlationId = opts.correlationId ?? currentCorrelationId() ?? ctx.traceId;

  try {
    const result = await store.run({ span: ctx, correlationId }, () => fn(ctx));
    span.status = "OK";
    return result;
  } catch (e) {
    span.status = "ERROR";
    span.statusMessage = (e as Error).message?.slice(0, 300);
    throw e;
  } finally {
    span.endTimeUnixNano = String(Date.now() * 1_000_000);
    span.durationMs = Date.now() - started;
    record(span);
  }
}

/** Attach attributes to the active span (no-op outside a traced scope). */
export function setSpanAttributes(attrs: Record<string, string | number | boolean>): void {
  const ctx = currentSpanContext();
  if (!ctx) return;
  // Spans are recorded on completion, so mutate the buffered entry if present,
  // otherwise stash onto the pending one via a lookup by spanId.
  const pending = spans.find((s) => s.spanId === ctx.spanId);
  if (pending) Object.assign(pending.attributes, attrs);
  else pendingAttributes.set(ctx.spanId, { ...(pendingAttributes.get(ctx.spanId) ?? {}), ...attrs });
}

const pendingAttributes = new Map<string, Record<string, string | number | boolean>>();

/** Recent spans, newest first. For /api/v1/traces and diagnostics. */
export function recentSpans(limit = 100): Span[] {
  return spans
    .slice(-Math.max(1, Math.min(limit, MAX_SPANS)))
    .reverse()
    .map((s) => {
      const extra = pendingAttributes.get(s.spanId);
      return extra ? { ...s, attributes: { ...s.attributes, ...extra } } : s;
    });
}

/** Tracing subsystem posture, for /api/health. */
export function tracingStatus() {
  return {
    exportEnabled: tracingExportEnabled(),
    endpoint: OTLP_ENDPOINT ? "configured" : "none (in-process buffer only)",
    serviceName: SERVICE_NAME,
    buffered: spans.length,
    droppedFromBuffer: dropped,
    exportFailures,
  };
}

/** Test seam: clear buffered spans between assertions. */
export function __resetTracing(): void {
  spans.length = 0;
  dropped = 0;
  exportFailures = 0;
  pendingAttributes.clear();
}
