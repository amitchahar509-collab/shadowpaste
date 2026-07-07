// @shadowpaste/ai — AIProvider abstraction + round-trip orchestration (V15 Phase 5).
// Real adapters (OpenAI/Anthropic/Gemini) live in ../providers. This layer adds the
// send/stream/receive interface and a FakeProvider used to PROVE that
// {{SHADOW_SECRET_*}} references survive a protect → AI-edit → restore round trip
// without a live API key or network.

import { adapters } from '../providers/index.mjs';

/** @typedef {{ send(msgs):Promise<string>, stream(msgs):AsyncIterable<string>, name:string }} AIProvider */

// Wrap a ../providers adapter as an AIProvider (needs a real apiKey to actually call).
export function providerFromAdapter(adapterKey, apiKey, opts = {}) {
  const adapter = adapters[adapterKey];
  if (!adapter) throw new Error('unknown adapter: ' + adapterKey);
  return {
    name: adapterKey,
    async send(prompt) { const r = await adapter.execute({ apiKey, payload: { prompt }, ...opts }); return r.text; },
    async *stream(prompt) { yield await this.send(prompt); }  // adapters are non-streaming here
  };
}

// FakeProvider: deterministic, offline. Simulates an AI that reads the safe project,
// makes an edit, and (critically) passes {{SHADOW_SECRET_*}} references through verbatim —
// exactly what a well-instructed model does. Used for round-trip verification.
export function fakeProvider(editFn) {
  return {
    name: 'fake',
    async send(prompt) {
      const edit = editFn ? editFn(prompt) : (prompt + '\n\n// [AI] added a helper below\nexport function main() { return true; }');
      return edit;
    },
    async *stream(prompt) { for (const chunk of (await this.send(prompt)).match(/.{1,64}/gs) || []) yield chunk; }
  };
}

/**
 * Full orchestration: protect → send to provider → restore.
 * `protect(text)` → {text}; `restore(text)` → {text}. Both injected so this stays
 * decoupled from the vault implementation (browser uses ShadowPasteRuntime).
 * @returns {{ safeSent, aiOutput, restored, referencesSurvived:boolean }}
 */
export async function roundTrip({ project, provider, protect, restore }) {
  const safe = (await protect(project)).text;
  const refsBefore = (safe.match(/\{\{SHADOW_SECRET_[A-Z0-9_]+\}\}/g) || []).sort();
  const aiOutput = await provider.send(safe);
  const refsAfter = (aiOutput.match(/\{\{SHADOW_SECRET_[A-Z0-9_]+\}\}/g) || []).sort();
  const referencesSurvived = refsBefore.length > 0 && JSON.stringify(refsBefore) === JSON.stringify([...new Set(refsAfter)].sort());
  const restored = (await restore(aiOutput)).text;
  return { safeSent: safe, aiOutput, restored, referencesSurvived };
}

export default { providerFromAdapter, fakeProvider, roundTrip };
