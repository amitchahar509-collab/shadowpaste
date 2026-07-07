// @shadowpaste/capability — real capability-token engine (Phase 3/4).
// Tokens are session-bound, scoped, time-limited, HMAC-signed, and single-use
// by nonce. A capability reference is NOT a password: without a validly signed
// token minted for the current session + scope, the gateway refuses to act.

import { hmacSign, hmacVerify, randomBytes, bufToB64, randomId } from '../crypto/index.mjs';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

// Canonical serialization so signing input is stable regardless of key order.
function canonical(payload) {
  return JSON.stringify({
    secretId: payload.secretId,
    sessionId: payload.sessionId,
    scope: payload.scope,
    action: payload.action,
    nonce: payload.nonce,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
    oneTime: !!payload.oneTime,
    usageLimit: payload.usageLimit ?? null
  });
}

export class CapabilityEngine {
  /** @param {CryptoKey} hmacKey signing key (never leaves this process) */
  constructor(hmacKey) {
    this.hmacKey = hmacKey;
    this.consumedNonces = new Set();   // replay protection
    this.usageByNonce = new Map();      // usage-limit accounting
  }

  async mint({ secretId, sessionId, scope, action, ttlMs = DEFAULT_TTL_MS, oneTime = true, usageLimit = 1 }) {
    if (!secretId || !sessionId || !scope) throw new Error('mint requires secretId, sessionId, scope');
    const now = Date.now();
    const payload = {
      secretId, sessionId, scope, action: action || scope,
      nonce: bufToB64(randomBytes(12)),
      createdAt: now, expiresAt: now + ttlMs,
      oneTime, usageLimit
    };
    payload.signature = await hmacSign(this.hmacKey, canonical(payload));
    return payload;
  }

  /**
   * Validate a token against the live session + requested scope.
   * Rejects: bad signature, expired, wrong session, wrong scope, replayed nonce, usage exhausted.
   * @returns {{ok:boolean, why?:string}}
   */
  async verify(token, { sessionId, requiredScope } = {}) {
    if (!token || typeof token !== 'object') return { ok: false, why: 'missing token' };
    const { signature, ...unsigned } = token;
    if (!signature) return { ok: false, why: 'unsigned token' };
    if (!(await hmacVerify(this.hmacKey, canonical(unsigned), signature))) return { ok: false, why: 'invalid signature (tampered)' };
    if (sessionId && token.sessionId !== sessionId) return { ok: false, why: 'session mismatch' };
    if (Date.now() > token.expiresAt) return { ok: false, why: 'token expired' };
    if (requiredScope && token.scope !== requiredScope) return { ok: false, why: `scope mismatch (need ${requiredScope})` };
    if (token.oneTime && this.consumedNonces.has(token.nonce)) return { ok: false, why: 'nonce already consumed (replay)' };
    const used = this.usageByNonce.get(token.nonce) || 0;
    if (token.usageLimit != null && used >= token.usageLimit) return { ok: false, why: 'usage limit exhausted' };
    return { ok: true };
  }

  /** Mark a token spent after a successful action. */
  consume(token) {
    if (!token) return;
    if (token.oneTime) this.consumedNonces.add(token.nonce);
    this.usageByNonce.set(token.nonce, (this.usageByNonce.get(token.nonce) || 0) + 1);
  }
}

export function newSessionId() { return 'sess_' + randomId(); }

export default { CapabilityEngine, newSessionId };
