// @shadowpaste/runtime — top-level façade composing the whole stack.
// One import to stand up a local credential runtime (browser or Node >=20).
//
//   import { createRuntime } from '@shadowpaste/runtime';
//   const rt = await createRuntime();
//   const { reference } = await rt.vaultSecret('sk-live-…', 'openai_api_key=');
//   const res = await rt.execute(reference, 'openai.chat.completions', { prompt: 'hi' });

import { generateAesKey, generateHmacKey, importHmacKey } from '../crypto/index.mjs';
import { CapabilityEngine, newSessionId } from '../capability/index.mjs';
import { Gateway, VaultStore, blastRadius } from '../gateway/index.mjs';
import { classifyProvider, FirewallV2, InjectionShield, entropyScan } from '../security/index.mjs';

export async function createRuntime({ hmacSecret, fetchImpl, approveHighRisk, audit = () => {} } = {}) {
  const aesKey = await generateAesKey(false);
  const hmacKey = hmacSecret ? await importHmacKey(hmacSecret) : await generateHmacKey(false);
  const capabilities = new CapabilityEngine(hmacKey);
  const vault = new VaultStore(aesKey);
  const sessionId = newSessionId();
  const gateway = new Gateway({ vault, capabilities, sessionId, audit, fetchImpl, approveHighRisk });

  return {
    sessionId,
    /** Detect+classify, encrypt into the vault, return the capability reference (never the secret). */
    async vaultSecret(raw, context = '') {
      const cls = classifyProvider(raw, context);
      const rec = await vault.add(raw, { provider: cls.provider, scope: cls.scope });
      return { reference: rec.reference, provider: rec.provider, scope: rec.scope, blastRadius: rec.blastRadius };
    },
    /** Firewall-gated, capability-checked execution. Returns result only. */
    async execute(reference, action, payload = {}) {
      const risk = FirewallV2.assessPrompt(payload.prompt || '', { session: sessionId });
      if (risk.level === 'CRITICAL') return { ok: false, error: 'DENIED by firewall', risk };
      return gateway.requestSecretUse(reference, action, payload);
    },
    /** Screen inbound text for injection/exfiltration. */
    scan: (text) => InjectionShield.scan(text),
    /** Entropy sweep for unknown secrets. */
    entropy: (text) => entropyScan(text),
    /** Metadata only; never decrypts. */
    list: () => [...vault.byRef.keys()].map((ref) => vault.meta(ref)),
    blastRadius,
    vault, gateway, capabilities
  };
}

export default { createRuntime };
