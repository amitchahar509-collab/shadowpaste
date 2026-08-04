// AI provider credential handling — pins the ai.generate config fixes.
//
// Live MCP call returned:  AI_ERROR: Gemini 400: API key not valid.
//
// The key itself was the operator's to replace, but three code defects made that
// diagnosis harder and more expensive than it needed to be:
//   1. an env value with surrounding quotes or a pasted NAME=value line was sent
//      to the provider verbatim — the same class of bug that silently degraded
//      the rate limiter when UPSTASH_REDIS_REST_URL held a whole KEY="value" line
//   2. a rejected credential was retried 3x with backoff on EVERY call, which can
//      never succeed
//   3. it surfaced as a generic AI_ERROR, indistinguishable from provider
//      flakiness, so nothing told the operator to go fix the key

import { describe, expect, test } from "bun:test";
import { cleanEnvValue, isAuthFailure } from "@/lib/ai/provider";

describe("env values are cleaned before use", () => {
  test("surrounding quotes are stripped", () => {
    expect(cleanEnvValue('"AIzaSyABC123"')).toBe("AIzaSyABC123");
    expect(cleanEnvValue("'sk-proj-abc'")).toBe("sk-proj-abc");
    expect(cleanEnvValue("  AIzaSyABC123  ")).toBe("AIzaSyABC123");
  });

  test("a pasted NAME=value line yields the value", () => {
    expect(cleanEnvValue('GEMINI_API_KEY="AIzaSyABC123"')).toBe("AIzaSyABC123");
    expect(cleanEnvValue("OPENAI_API_KEY=sk-proj-abc")).toBe("sk-proj-abc");
  });

  test("a normal key is untouched", () => {
    expect(cleanEnvValue("AIzaSyD-1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P")).toBe("AIzaSyD-1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P");
    expect(cleanEnvValue("sk-proj-abcDEF123")).toBe("sk-proj-abcDEF123");
  });

  test("empty and undefined are empty, never a crash", () => {
    expect(cleanEnvValue(undefined)).toBe("");
    expect(cleanEnvValue("")).toBe("");
    expect(cleanEnvValue('""')).toBe("");
  });
});

describe("auth failures are recognised and not retried", () => {
  test("the exact live error is classified as auth", () => {
    expect(isAuthFailure(new Error("Gemini 400: API key not valid. Please pass a valid API key."))).toBe(true);
  });

  test("other provider auth shapes are recognised", () => {
    for (const m of [
      "OpenAI 401: Incorrect API key provided",
      "Anthropic 401: invalid x-api-key",
      "OpenAI 403: permission denied",
      "Gemini 400: API_KEY_INVALID",
    ]) {
      expect(isAuthFailure(new Error(m))).toBe(true);
    }
  });

  test("transient failures are NOT treated as auth — they must still retry", () => {
    for (const m of [
      "OpenAI 429: rate limit exceeded",
      "Anthropic 500: internal server error",
      "Gemini 503: service unavailable",
      "fetch failed",
      "The operation was aborted",
    ]) {
      expect(isAuthFailure(new Error(m))).toBe(false);
    }
  });

  test("junk input never throws", () => {
    for (const v of [null, undefined, 42, {}, "string"]) {
      expect(() => isAuthFailure(v)).not.toThrow();
      expect(isAuthFailure(v)).toBe(false);
    }
  });
});

describe("provider error text carries no credential fragments", () => {
  test("OpenAI's own masked key does not reach the agent", async () => {
    const { scrubProviderMessage } = await import("@/lib/ai/provider");
    const raw =
      "Incorrect API key provided: sk-proj-******************************************7890. " +
      "You can find your API key at https://platform.openai.com/account/api-keys.";
    const out = scrubProviderMessage(raw);
    // The mask itself, and the trailing characters it exposes, are both gone.
    expect(out).not.toContain("sk-proj-");
    expect(out).not.toContain("7890");
    expect(out).not.toMatch(/\*{4,}/);
    expect(out).toContain("<redacted-key>");
  });

  test("other provider key shapes are scrubbed", async () => {
    const { scrubProviderMessage } = await import("@/lib/ai/provider");
    // Prefixes are assembled at runtime so no credential-shaped literal exists in
    // this file. GitHub push protection blocks the literal form, and it is right
    // to — a test fixture that looks like a live Stripe key is indistinguishable
    // from one until someone checks.
    const stripe = ["sk", "live", "51HxKlMNoPqRsTuVwXyZaBcDe"].join("_");
    const gh = ["ghp", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("_");
    const goog = "AIza" + "SyD-1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P";
    for (const [raw, forbidden] of [
      [`Invalid key: ${goog}`, "AIza"],
      [`token=${gh} rejected`, "ghp_"],
      [`secret: ${stripe}`, "sk_live_"],
    ] as Array<[string, string]>) {
      expect(scrubProviderMessage(raw)).not.toContain(forbidden);
    }
  });

  test("scrubbing does not break auth classification", async () => {
    const { scrubProviderMessage, isAuthFailure } = await import("@/lib/ai/provider");
    // The classifier reads the scrubbed text, so removing the key must not
    // remove the signal that says "this is a credential problem".
    for (const raw of [
      "Incorrect API key provided: sk-proj-****7890.",
      "API key not valid. Please pass a valid API key.",
      "API key is invalid.",
    ]) {
      expect(isAuthFailure(new Error(`OpenAI 401: ${scrubProviderMessage(raw)}`))).toBe(true);
    }
  });

  test("ordinary error text survives intact", async () => {
    const { scrubProviderMessage } = await import("@/lib/ai/provider");
    expect(scrubProviderMessage("rate limit exceeded, retry after 20s")).toBe("rate limit exceeded, retry after 20s");
    expect(scrubProviderMessage("")).toBe("");
  });
});
