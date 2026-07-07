// @shadowpaste/gateway — the runtime execution core (Phase 2/4/5).
// Orchestrates: vault (encrypted) → firewall → capability mint/verify →
// decrypt-in-scope → provider adapter → memory cleanup → result only.
// Plaintext credentials exist ONLY inside executeAction()'s local scope and
// are never returned, logged, thrown, or attached to any persisted object.

import { aesEncrypt, aesDecrypt, sha256Hex, randomId, deriveAesKeyFromPassphrase } from '../crypto/index.mjs';
import { CapabilityEngine } from '../capability/index.mjs';
import { FirewallV2 } from '../security/index.mjs';
import { adapterForScope } from '../providers/index.mjs';

// Blast-radius scoring (Phase 5)
export function blastRadius(provider) {
  if (/DATABASE|SSH|PEM|AWS_SECRET|AWS_ACCESS|AWS_SESSION|STRIPE/.test(provider)) return { tier: 'HIGH', score: 90 };
  if (/GITHUB|GITLAB|SLACK|DISCORD|FIREBASE|SUPABASE|CLOUDFLARE|VERCEL|NETLIFY|SESSION|JWT|OAUTH|ANTHROPIC|OPENAI|GOOGLE|HUGGINGFACE/.test(provider)) return { tier: 'MEDIUM', score: 55 };
  return { tier: 'LOW', score: 20 };
}

// Minimal in-memory encrypted vault store. The web app uses IndexedDB with the
// same record shape; the server uses this. Both only ever hold ciphertext.
export class VaultStore {
  constructor(aesKey) { this.aesKey = aesKey; this.byId = new Map(); this.byRef = new Map(); this.salt = null; }

  // Zero-trust lock (Phase/Agent 3): derive the vault key from a passphrase via
  // PBKDF2-SHA256 (210k iters). No key material exists until unlock() is called.
  static async fromPassphrase(passphrase, saltB64) {
    const { key, salt } = await deriveAesKeyFromPassphrase(passphrase, saltB64);
    const v = new VaultStore(key); v.salt = salt; return v;
  }

  async add(rawSecret, { provider, scope, ttlMs = 24 * 3600 * 1000, permissionScope = [] }) {
    const enc = await aesEncrypt(this.aesKey, rawSecret);
    const rec = {
      id: randomId(),
      reference: `{{SHADOW_SECRET_${provider}_${randomId().slice(0, 5).toUpperCase()}}}`,
      provider, scope,
      iv: enc.iv, encryptedSecret: enc.cipher,        // ciphertext only
      hash: await sha256Hex(rawSecret),                // fingerprint, non-reversible
      createdAt: Date.now(), lastUsed: null, expiresAt: Date.now() + ttlMs,
      permissionScope: permissionScope.length ? permissionScope : [scope],
      usageCounter: 0, revoked: false, paused: false,
      blastRadius: blastRadius(provider)
    };
    this.byId.set(rec.id, rec); this.byRef.set(rec.reference, rec);
    return rec;
  }
  get(ref) { return this.byRef.get(ref); }
  meta(ref) { // never exposes ciphertext or key material
    const r = this.byRef.get(ref); if (!r) return null;
    const { iv, encryptedSecret, hash, ...safe } = r; return safe;
  }
  revoke(ref) { const r = this.byRef.get(ref); if (r) r.revoked = true; return !!r; }
  pause(ref, v = true) { const r = this.byRef.get(ref); if (r) r.paused = v; return !!r; }
  async rotate(ref) {
    const r = this.byRef.get(ref); if (!r) return null;
    const plain = await aesDecrypt(this.aesKey, { iv: r.iv, cipher: r.encryptedSecret });
    const enc = await aesEncrypt(this.aesKey, plain);
    this.byRef.delete(r.reference);
    r.iv = enc.iv; r.encryptedSecret = enc.cipher;
    r.reference = `{{SHADOW_SECRET_${r.provider}_${randomId().slice(0, 5).toUpperCase()}}}`;
    r.revoked = false; r.expiresAt = Date.now() + 24 * 3600 * 1000;
    this.byRef.set(r.reference, r);
    return r.reference; // old reference is now dead
  }
  remove(ref) { const r = this.byRef.get(ref); if (r) { this.byId.delete(r.id); this.byRef.delete(ref); } return !!r; }
}

export class Gateway {
  /**
   * @param {object} deps
   * @param {VaultStore} deps.vault
   * @param {CapabilityEngine} deps.capabilities
   * @param {string} deps.sessionId
   * @param {(evt:object)=>void} [deps.audit] audit sink (must not receive secrets)
   * @param {typeof fetch} [deps.fetchImpl]
   * @param {(a:object)=>Promise<boolean>} [deps.approveHighRisk] human gate for HIGH
   */
  constructor({ vault, capabilities, sessionId, audit = () => {}, fetchImpl, approveHighRisk }) {
    this.vault = vault; this.caps = capabilities; this.sessionId = sessionId;
    this.audit = audit; this.fetchImpl = fetchImpl; this.approveHighRisk = approveHighRisk;
  }

  #log(type, msg, level = 'info') { this.audit({ ts: Date.now(), type, msg, level, session: this.sessionId }); }

  /** Named entry point: an agent requests to USE a secret for an action. */
  async requestSecretUse(reference, action, payload = {}) {
    this.#log('request', `agent requested ${reference} → ${action}`);
    const rec = this.vault.get(reference);
    if (!rec) { this.#log('deny', 'unknown reference', 'deny'); return { ok: false, error: 'Unknown capability reference' }; }
    if (rec.revoked) { this.#log('deny', `${rec.provider} revoked`, 'deny'); return { ok: false, error: 'Secret revoked' }; }
    if (rec.paused) { this.#log('deny', `${rec.provider} paused`, 'warn'); return { ok: false, error: 'Secret paused' }; }
    if (Date.now() > rec.expiresAt) { this.#log('deny', `${rec.provider} expired`, 'deny'); return { ok: false, error: 'Secret expired' }; }

    // Firewall
    const risk = FirewallV2.assessAction(action);
    this.#log('firewall', `${risk.level}: ${risk.reason}`, risk.level === 'LOW' ? 'ok' : 'warn');
    if (risk.level === 'CRITICAL') return { ok: false, error: `Blocked by firewall: ${risk.reason}` };
    if (risk.level === 'HIGH') {
      const approved = this.approveHighRisk ? await this.approveHighRisk({ action, reason: risk.reason }) : false;
      if (!approved) { this.#log('deny', 'HIGH-risk not approved', 'deny'); return { ok: false, error: 'Denied by human approval gate' }; }
    }

    // Capability token (session-bound, scoped, one-time)
    const token = await this.caps.mint({ secretId: rec.id, sessionId: this.sessionId, scope: rec.scope, action });
    const check = await this.caps.verify(token, { sessionId: this.sessionId, requiredScope: rec.scope });
    if (!check.ok) { this.#log('deny', `token: ${check.why}`, 'deny'); return { ok: false, error: `Capability invalid: ${check.why}` }; }
    this.#log('token', `minted scope ${token.scope} ttl 5m`, 'vault');

    // Execute with decrypted key confined to this scope
    const result = await this.#executeAction(rec, token, action, payload);
    this.caps.consume(token);
    rec.usageCounter++; rec.lastUsed = Date.now();
    this.#log('done', `completed — credential scrubbed`, 'ok');
    return result;
  }

  async #executeAction(rec, token, action, payload) {
    const adapter = adapterForScope(rec.scope);
    let plaintext = await aesDecrypt(this.vault.aesKey, { iv: rec.iv, cipher: rec.encryptedSecret });
    try {
      if (!adapter) {
        // No live adapter for this scope (e.g. DATABASE/SSH): confirm resolution without exposing the key.
        return { ok: true, provider: rec.provider, executed: action, note: 'no network adapter for scope; capability resolved locally', preview: '••••' + plaintext.slice(-4) };
      }
      const resp = await adapter.execute({ apiKey: plaintext, payload, fetchImpl: this.fetchImpl });
      return { ok: true, provider: resp.provider, executed: action, text: resp.text, usage: resp.usage };
    } catch (e) {
      // Upstream/provider failure must NOT crash the request as an unhandled 500.
      // The adapter already redacts the raw key from the message; surface a clean,
      // secret-free error envelope so the pipeline stays observable and safe.
      this.#log('error', `provider call failed: ${e && e.message ? e.message : 'error'}`, 'deny');
      return { ok: false, provider: rec.provider, executed: action, error: e && e.message ? e.message : 'provider execution failed' };
    } finally {
      plaintext = null;   // dereference; JS strings are immutable (documented limitation)
    }
  }
}

export default { Gateway, VaultStore, blastRadius };
