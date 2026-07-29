// ShadowPaste — response-side secret sanitization.
//
// THE GAP THIS CLOSES
// -------------------
// Adapters returned two things: `redactedOutput` (a string, persisted to the
// audit trail) and `output` (the object handed back to the caller). Only the
// former was ever redacted, and for most adapters `redactedOutput` was simply
// `JSON.stringify(output)` — so neither path was actually clean.
//
// Result, confirmed by execution before this module existed:
//
//     fs.write path=leak.txt content="STRIPE_KEY=sk_live_51QaBc…"
//     fs.read  path=leak.txt
//       agent-visible output contains RAW secret : YES
//       DB audit copy   contains RAW secret      : YES
//
// `fs.read` is riskScore 10 and sits on the policy auto-allow list, so an agent
// could read any workspace file and receive plaintext credentials with no
// prompt — and ShadowPaste then wrote those credentials into its own audit
// table in cleartext. The same shape applied to `network.fetch` (raw body),
// `github.read` and `stripe.read` (raw API payloads).
//
// This module is the single choke point. It runs in the gateway, so every
// caller — MCP tools/call, the REST bridge, the CLI — inherits it, and both the
// agent-visible object and the persisted string are derived from the SAME
// sanitized text. There is no path that produces one without the other.
//
// Design notes:
//   * Sanitization happens on the serialized JSON, not on a tree walk, so a
//     secret is caught wherever it sits — nested object, array element, or
//     embedded inside a larger string such as an HTTP response body.
//   * The replacement marker is deliberately JSON-safe (no quotes, no
//     backslashes) so the sanitized text re-parses cleanly.
//   * Findings are reported so the gateway can escalate the recorded risk: an
//     agent pulling credentials out of a file is a security event, not a
//     routine read.

import { scanForSecrets } from "./detector";

export interface SanitizeResult {
  /** The object safe to return to the agent. */
  output: Record<string, unknown> | null;
  /** The serialized form safe to persist to the audit trail. */
  json: string;
  /** Number of distinct secrets removed. */
  redacted: number;
  /** Detector ids that fired, for audit metadata. Never contains raw values. */
  detectors: string[];
}

/** Build a marker that survives JSON round-tripping and names what was removed. */
function marker(detector: string, masked: string): string {
  const safeDetector = detector.replace(/[^A-Za-z0-9_.:-]/g, "_");
  const safeMasked = masked.replace(/["'\\\n\r\t]/g, "").slice(0, 24);
  return `{{SHADOW_REDACTED:${safeDetector}:${safeMasked}}}`;
}

/**
 * Strip every detectable secret from a tool result.
 *
 * Returns the sanitized object AND the sanitized JSON, both derived from the
 * same text — callers must use these instead of the adapter's raw `output` /
 * `redactedOutput`.
 */
export function sanitizeToolOutput(
  output: Record<string, unknown> | null | undefined,
  contextHint = "tool-output"
): SanitizeResult {
  if (output === null || output === undefined) {
    return { output: null, json: JSON.stringify({ status: "no_output" }), redacted: 0, detectors: [] };
  }

  let json: string;
  try {
    json = JSON.stringify(output);
  } catch {
    // Circular or otherwise non-serializable: refuse to pass it through rather
    // than leak an unscannable payload.
    return {
      output: { error: "output_not_serializable" },
      json: JSON.stringify({ error: "output_not_serializable" }),
      redacted: 0,
      detectors: [],
    };
  }
  if (!json || json === "{}") return { output, json, redacted: 0, detectors: [] };

  const findings = scanForSecrets(json, contextHint);
  if (findings.length === 0) return { output, json, redacted: 0, detectors: [] };

  // Replace longest-first so a short secret that is a substring of a longer one
  // cannot corrupt the longer replacement.
  const unique = new Map<string, { detector: string; masked: string }>();
  for (const f of findings) {
    if (f.raw && f.raw.length > 4 && !unique.has(f.raw)) {
      unique.set(f.raw, { detector: f.detector || f.provider || "secret", masked: f.masked || "" });
    }
  }
  const ordered = [...unique.entries()].sort((a, b) => b[0].length - a[0].length);

  let sanitized = json;
  const detectors: string[] = [];
  for (const [raw, meta] of ordered) {
    if (!sanitized.includes(raw)) continue;
    sanitized = sanitized.split(raw).join(marker(meta.detector, meta.masked));
    detectors.push(meta.detector);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(sanitized) as Record<string, unknown>;
  } catch {
    // A replacement broke the JSON — fail CLOSED. Never fall back to the raw
    // object; that is exactly the leak this module exists to prevent.
    const safe = { error: "output_withheld", reason: "sanitization produced unparseable output", redacted: detectors.length };
    return { output: safe, json: JSON.stringify(safe), redacted: detectors.length, detectors: [...new Set(detectors)] };
  }

  return { output: parsed, json: sanitized, redacted: detectors.length, detectors: [...new Set(detectors)] };
}
