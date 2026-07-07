// @shadowpaste/providers — real AI provider adapters (Phase 4).
// Each adapter receives a decrypted apiKey ONLY for the duration of the call,
// injects it into the outbound request, and returns the parsed response.
// The key is never logged, never attached to the returned object, never thrown.
// `fetchImpl` is injectable so adapters are testable against a mock endpoint.

function redactError(err, apiKey) {
  let msg = (err && err.message) ? String(err.message) : String(err);
  if (apiKey) msg = msg.split(apiKey).join('[REDACTED_KEY]');
  return new Error(msg);
}

export const adapters = {
  // OpenAI Chat Completions
  openai: {
    scope: 'openai.chat',
    async execute({ apiKey, payload = {}, fetchImpl = fetch, baseUrl = 'https://api.openai.com' }) {
      try {
        const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: payload.model || 'gpt-4o-mini',
            messages: payload.messages || [{ role: 'user', content: payload.prompt || 'ping' }],
            max_tokens: payload.max_tokens ?? 256
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`openai ${res.status}: ${data?.error?.message || 'error'}`);
        return { ok: true, provider: 'OPENAI', text: data.choices?.[0]?.message?.content ?? '', usage: data.usage || null };
      } catch (e) { throw redactError(e, apiKey); }
    }
  },
  // Anthropic Messages
  anthropic: {
    scope: 'anthropic.messages',
    async execute({ apiKey, payload = {}, fetchImpl = fetch, baseUrl = 'https://api.anthropic.com' }) {
      try {
        const res = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: payload.model || 'claude-3-5-sonnet-20241022',
            max_tokens: payload.max_tokens ?? 256,
            messages: payload.messages || [{ role: 'user', content: payload.prompt || 'ping' }]
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`anthropic ${res.status}: ${data?.error?.message || 'error'}`);
        return { ok: true, provider: 'ANTHROPIC', text: data.content?.[0]?.text ?? '', usage: data.usage || null };
      } catch (e) { throw redactError(e, apiKey); }
    }
  },
  // Google Gemini (key as query param — still never logged)
  gemini: {
    scope: 'google.generativelanguage',
    async execute({ apiKey, payload = {}, fetchImpl = fetch, baseUrl = 'https://generativelanguage.googleapis.com' }) {
      try {
        const model = payload.model || 'gemini-1.5-flash';
        const res = await fetchImpl(`${baseUrl}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: payload.contents || [{ parts: [{ text: payload.prompt || 'ping' }] }] })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`gemini ${res.status}: ${data?.error?.message || 'error'}`);
        return { ok: true, provider: 'GOOGLE', text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '', usage: data.usageMetadata || null };
      } catch (e) { throw redactError(e, apiKey); }
    }
  }
};

// Map a capability scope to the adapter that serves it.
export function adapterForScope(scope) {
  if (scope?.startsWith('openai.')) return adapters.openai;
  if (scope?.startsWith('anthropic.')) return adapters.anthropic;
  if (scope?.startsWith('google.') || scope?.startsWith('gemini.')) return adapters.gemini;
  return null;
}

export default { adapters, adapterForScope };
