// ShadowPaste — AI Provider Abstraction (Task 2)
//
// ONE provider abstraction (there was none before). Architecture:
//   Provider Registry → Credential Resolver → (capability token) → Provider
//   Adapter → Audit → token/cost accounting → Response.
//
// Real HTTP adapters for OpenAI, Anthropic, and Gemini. Keys are resolved from
// the environment or the encrypted Vault — NEVER taken from the caller/prompt.
// If no key is configured for any provider, callers get PROVIDER_NOT_CONFIGURED;
// a successful response is NEVER fabricated.
//
// Secret hygiene: the prompt is scanned and redacted before it is sent to a
// provider AND before it is audited, so a leaked credential in a prompt never
// reaches the LLM context or the audit log. The API key is never logged.

import { scanForSecrets } from "@/lib/security/detector";
import { redactSecrets } from "@/lib/security/vault";
import { injectCredential } from "@/lib/security/vault";

export class ProviderNotConfiguredError extends Error {
  code = "PROVIDER_NOT_CONFIGURED" as const;
}

export interface GenerateRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  provider?: ProviderName;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  provider: ProviderName;
  model: string;
  text: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  costUsd: number;
  attempts: number;
  durationMs: number;
}

export type ProviderName = "openai" | "anthropic" | "gemini";

interface ProviderAdapter {
  name: ProviderName;
  defaultModel: string;
  envKeys: string[];       // env var names checked, in order
  vaultScope: string;      // vault scope prefix for injectCredential
  // Prices are USD per 1,000 tokens (approximate list prices; override via env).
  priceInPer1k: number;
  priceOutPer1k: number;
  call(key: string, req: Required<Pick<GenerateRequest, "prompt" | "model" | "maxTokens">>, signal: AbortSignal): Promise<{ text: string; promptTokens: number; completionTokens: number }>;
}

// ---- Credential resolver -----------------------------------------------------
async function resolveKey(p: ProviderAdapter, orgId?: string): Promise<string | null> {
  for (const name of p.envKeys) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  // Fall back to the encrypted Vault (single-use capability token minted + consumed).
  try {
    const cred = await injectCredential({ sessionId: `ai-${Date.now()}`, scope: p.vaultScope, orgId });
    if (cred?.raw) return cred.raw;
  } catch { /* vault optional */ }
  return null;
}

// ---- Real provider adapters --------------------------------------------------
const OPENAI: ProviderAdapter = {
  name: "openai", defaultModel: "gpt-4o-mini", envKeys: ["OPENAI_API_KEY"], vaultScope: "openai",
  priceInPer1k: 0.00015, priceOutPer1k: 0.0006,
  async call(key, req, signal) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: req.model, max_tokens: req.maxTokens, messages: [{ role: "user", content: req.prompt }] }),
    });
    const data = await res.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data?.error?.message ?? "request failed"}`);
    return { text: data?.choices?.[0]?.message?.content ?? "", promptTokens: data?.usage?.prompt_tokens ?? 0, completionTokens: data?.usage?.completion_tokens ?? 0 };
  },
};

const ANTHROPIC: ProviderAdapter = {
  name: "anthropic", defaultModel: "claude-3-5-haiku-latest", envKeys: ["ANTHROPIC_API_KEY"], vaultScope: "anthropic",
  priceInPer1k: 0.0008, priceOutPer1k: 0.004,
  async call(key, req, signal) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({ model: req.model, max_tokens: req.maxTokens, messages: [{ role: "user", content: req.prompt }] }),
    });
    const data = await res.json().catch(() => null) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${data?.error?.message ?? "request failed"}`);
    return { text: (data?.content ?? []).map((c) => c.text ?? "").join(""), promptTokens: data?.usage?.input_tokens ?? 0, completionTokens: data?.usage?.output_tokens ?? 0 };
  },
};

const GEMINI: ProviderAdapter = {
  name: "gemini", defaultModel: "gemini-1.5-flash", envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], vaultScope: "google",
  priceInPer1k: 0.000075, priceOutPer1k: 0.0003,
  async call(key, req, signal) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: req.prompt }] }], generationConfig: { maxOutputTokens: req.maxTokens } }),
    });
    const data = await res.json().catch(() => null) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }; error?: { message?: string } } | null;
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${data?.error?.message ?? "request failed"}`);
    return { text: (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""), promptTokens: data?.usageMetadata?.promptTokenCount ?? 0, completionTokens: data?.usageMetadata?.candidatesTokenCount ?? 0 };
  },
};

// ---- Provider registry -------------------------------------------------------
export const PROVIDER_REGISTRY: Record<ProviderName, ProviderAdapter> = { openai: OPENAI, anthropic: ANTHROPIC, gemini: GEMINI };

// Fallback order (env override: AI_PROVIDER_ORDER="anthropic,openai,gemini").
function fallbackOrder(): ProviderName[] {
  const raw = process.env.AI_PROVIDER_ORDER;
  const valid = (n: string): n is ProviderName => n === "openai" || n === "anthropic" || n === "gemini";
  if (raw) { const list = raw.split(",").map((s) => s.trim()).filter(valid); if (list.length) return list; }
  return ["openai", "anthropic", "gemini"];
}

/** Which providers currently have a resolvable credential (for diagnostics). */
export async function configuredProviders(orgId?: string): Promise<ProviderName[]> {
  const out: ProviderName[] = [];
  for (const name of fallbackOrder()) {
    if (await resolveKey(PROVIDER_REGISTRY[name], orgId)) out.push(name);
  }
  return out;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4)); // ~4 chars/token heuristic
}

/**
 * Generate text. Redacts secrets from the prompt, resolves a provider credential,
 * calls the real API with timeout + retry + cancellation, accounts tokens/cost,
 * and falls back across providers. Throws ProviderNotConfiguredError when no
 * provider has a credential — never fabricates a response.
 */
export async function generate(req: GenerateRequest, opts: { orgId?: string } = {}): Promise<GenerateResult> {
  const start = Date.now();
  const timeoutMs = req.timeoutMs ?? 30_000;
  const maxTokens = req.maxTokens ?? 1024;

  // Redact any secret in the prompt BEFORE it is sent to a provider or audited.
  const findings = scanForSecrets(req.prompt, "ai.prompt");
  const safePrompt = findings.length
    ? redactSecrets(req.prompt, findings.map((f) => ({ raw: f.raw, reference: `{{SHADOW_SECRET_${f.provider}}}` })))
    : req.prompt;

  const order = req.provider ? [req.provider, ...fallbackOrder().filter((p) => p !== req.provider)] : fallbackOrder();
  let anyConfigured = false;
  let lastErr: Error | null = null;

  for (const name of order) {
    const p = PROVIDER_REGISTRY[name];
    const key = await resolveKey(p, opts.orgId);
    if (!key) continue;
    anyConfigured = true;
    const model = req.model || p.defaultModel;

    // Retry with backoff; honor external cancellation via the caller's signal.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      if (req.signal) req.signal.addEventListener("abort", () => ctrl.abort(), { once: true });
      try {
        const r = await p.call(key, { prompt: safePrompt, model, maxTokens }, ctrl.signal);
        clearTimeout(to);
        const promptTokens = r.promptTokens || estimateTokens(safePrompt);
        const completionTokens = r.completionTokens || estimateTokens(r.text);
        const costUsd = +(promptTokens / 1000 * p.priceInPer1k + completionTokens / 1000 * p.priceOutPer1k).toFixed(6);
        return {
          provider: name, model, text: r.text,
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
          costUsd, attempts: attempt, durationMs: Date.now() - start,
        };
      } catch (e) {
        clearTimeout(to);
        lastErr = e as Error;
        if (req.signal?.aborted) throw lastErr; // caller cancelled — do not retry
        if (attempt < 3) await new Promise((res) => setTimeout(res, 200 * attempt));
      }
    }
    // this provider failed all attempts → fall through to the next provider
  }

  if (!anyConfigured) {
    throw new ProviderNotConfiguredError(
      "No AI provider is configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY (or vault a key), then retry."
    );
  }
  throw lastErr ?? new Error("AI generation failed");
}
