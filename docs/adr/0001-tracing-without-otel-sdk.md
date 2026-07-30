# ADR 0001 — W3C Trace Context propagation instead of the OpenTelemetry SDK

* Status: Accepted
* Date: 2026-07-30

## Context

Enterprise GA required distributed tracing and correlation IDs. The obvious route
is `@opentelemetry/sdk-node` plus auto-instrumentation.

Three problems with that here:

1. **Unverifiable in this environment.** The SDK needs a running collector to
   demonstrate anything. Installing it would have produced a completion claim we
   could not runtime-verify — which the project's engineering rules forbid.
2. **Next.js route handlers.** OTel auto-instrumentation hooks Node's HTTP layer.
   Next.js App Router handlers on the serverless/edge boundary are not reliably
   captured, so the spans that matter most (tool invocations) need manual
   instrumentation regardless.
3. **Dependency weight** in a security product, where every transitive dependency
   is supply-chain surface.

## Decision

Implement the *interoperable* parts natively in `src/lib/observability/trace.ts`:

* W3C Trace Context (`traceparent`) parsing and propagation, per spec including
  the all-zero and `ff` version rejection rules.
* A span model using OTLP field names and semantics.
* OTLP/HTTP JSON export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; a bounded
  in-process ring buffer otherwise.

## Consequences

**Positive.** Zero new dependencies. Traces stitch correctly with any
OTel-instrumented caller or callee because the wire format and propagation are the
standard ones. Fully unit-testable, which the SDK path was not.

**Negative, stated plainly.** This is *OpenTelemetry-compatible*, not "the OTel
SDK is installed". There is no auto-instrumentation: a new code path gets a span
only when someone adds `withSpan`. No metrics or logs signal via OTLP — only
traces. If the team later wants full auto-instrumentation, this is replaceable
without changing callers, because `withSpan` is the only API surface.

**Rejected alternative.** Vendor-specific APM agents — same verification problem,
plus lock-in.
