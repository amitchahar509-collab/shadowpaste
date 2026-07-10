// @shadowpaste/security — capability-token engine (Phase 3/4)
// Ported from packages/capability/index.mjs. Tokens are session-bound, scoped,
// time-limited, HMAC-signed, and single-use by nonce. A capability reference is
// NOT a password: without a validly signed token minted for the current session
// + scope, the gateway refuses to act.

import { hmacSign, hmacVerify, randomBytes, bufToB64, randomId } from "./crypto";

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export interface CapabilityToken {
  secretId: string;
  sessionId: string;
  scope: string;
  action: string;
  nonce: string;
  createdAt: number;
  expiresAt: number;
  oneTime: boolean;
  usageLimit: number | null;
  signature?: string;
}

function canonical(payload: Omit<CapabilityToken, "signature">): string {
  return JSON.stringify({
    secretId: payload.secretId,
    sessionId: payload.sessionId,
    scope: payload.scope,
    action: payload.action,
    nonce: payload.nonce,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
    oneTime: !!payload.oneTime,
    usageLimit: payload.usageLimit ?? null,
  });
}

export class CapabilityEngine {
  private hmacKey: CryptoKey;
  private consumedNonces = new Set<string>();
  private usageByNonce = new Map<string, number>();

  constructor(hmacKey: CryptoKey) {
    this.hmacKey = hmacKey;
  }

  async mint(opts: {
    secretId: string;
    sessionId: string;
    scope: string;
    action?: string;
    ttlMs?: number;
    oneTime?: boolean;
    usageLimit?: number;
  }): Promise<CapabilityToken> {
    const { secretId, sessionId, scope, action, ttlMs = DEFAULT_TTL_MS, oneTime = true, usageLimit = 1 } = opts;
    if (!secretId || !sessionId || !scope) throw new Error("mint requires secretId, sessionId, scope");
    const now = Date.now();
    const payload: Omit<CapabilityToken, "signature"> = {
      secretId,
      sessionId,
      scope,
      action: action || scope,
      nonce: bufToB64(randomBytes(12)),
      createdAt: now,
      expiresAt: now + ttlMs,
      oneTime,
      usageLimit,
    };
    const signature = await hmacSign(this.hmacKey, canonical(payload));
    return { ...payload, signature };
  }

  async verify(
    token: CapabilityToken | null | undefined,
    opts: { sessionId?: string; requiredScope?: string } = {}
  ): Promise<{ ok: boolean; why?: string }> {
    if (!token || typeof token !== "object") return { ok: false, why: "missing token" };
    const { signature, ...unsigned } = token;
    if (!signature) return { ok: false, why: "unsigned token" };
    const valid = await hmacVerify(this.hmacKey, canonical(unsigned), signature);
    if (!valid) return { ok: false, why: "invalid signature (tampered)" };
    if (opts.sessionId && token.sessionId !== opts.sessionId) return { ok: false, why: "session mismatch" };
    if (Date.now() > token.expiresAt) return { ok: false, why: "token expired" };
    if (opts.requiredScope && token.scope !== opts.requiredScope) return { ok: false, why: `scope mismatch (need ${opts.requiredScope})` };
    if (token.oneTime && this.consumedNonces.has(token.nonce)) return { ok: false, why: "nonce already consumed (replay)" };
    const used = this.usageByNonce.get(token.nonce) || 0;
    if (token.usageLimit != null && used >= token.usageLimit) return { ok: false, why: "usage limit exhausted" };
    return { ok: true };
  }

  consume(token: CapabilityToken): void {
    if (!token) return;
    if (token.oneTime) this.consumedNonces.add(token.nonce);
    this.usageByNonce.set(token.nonce, (this.usageByNonce.get(token.nonce) || 0) + 1);
  }
}

export function newSessionId(): string {
  return "sess_" + randomId();
}
