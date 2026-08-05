// @shadowpaste/security — capability-token engine (Phase 3/4)
// Ported from packages/capability/index.mjs. Tokens are session-bound, scoped,
// time-limited, HMAC-signed, and single-use by nonce. A capability reference is
// NOT a password: without a validly signed token minted for the current session
// + scope, the gateway refuses to act.
//
// REPLAY PROTECTION LIVES IN THE DATABASE, NOT IN THIS PROCESS
// ------------------------------------------------------------
// The consumed-nonce ledger used to be a Set and a Map on this class. The HMAC
// key is derived from master material and therefore survives a restart — but
// the ledger did not, so on every cold start a previously consumed token became
// spendable again. Measured before this change:
//
//   verify BEFORE consume : {"ok":true}
//   verify AFTER  consume : {"ok":false,"why":"nonce already consumed (replay)"}
//   verify on FRESH engine: {"ok":true}          <- protection gone
//
// On serverless, "fresh engine" is not a hypothetical: it is every cold start.
//
// The unique constraint on CapabilityNonce.nonce is the actual enforcement
// point. A read-then-write check cannot resolve two concurrent replays racing
// each other; the database rejecting the second insert can.

import { hmacSign, hmacVerify, randomBytes, bufToB64, randomId } from "./crypto";
import { db } from "@/lib/db";

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

  /**
   * Cryptographic and temporal checks only — no ledger read.
   *
   * Split out because these are the checks that can be made without touching
   * the database, and because a caller that only needs "is this token authentic
   * and unexpired" should not pay for a query.
   */
  private async verifyStatic(
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
    if (opts.requiredScope && token.scope !== opts.requiredScope) {
      return { ok: false, why: `scope mismatch (need ${opts.requiredScope})` };
    }
    return { ok: true };
  }

  async verify(
    token: CapabilityToken | null | undefined,
    opts: { sessionId?: string; requiredScope?: string } = {}
  ): Promise<{ ok: boolean; why?: string }> {
    const stat = await this.verifyStatic(token, opts);
    if (!stat.ok || !token) return stat;

    // Ledger check. A database that is unreachable must not silently downgrade
    // replay protection to "allowed" — that would turn an outage into an open
    // door — so a query failure is reported as a failed verification and the
    // caller decides what to do with it.
    let row: { usedCount: number } | null;
    try {
      row = await db.capabilityNonce.findUnique({
        where: { nonce: token.nonce },
        select: { usedCount: true },
      });
    } catch (e) {
      return { ok: false, why: `ledger unavailable: ${(e as Error).message.slice(0, 80)}` };
    }

    if (!row) return { ok: true };
    if (token.oneTime) return { ok: false, why: "nonce already consumed (replay)" };
    if (token.usageLimit != null && row.usedCount >= token.usageLimit) {
      return { ok: false, why: "usage limit exhausted" };
    }
    return { ok: true };
  }

  /**
   * Record a use. Returns whether this use was legitimate.
   *
   * Was `void` and synchronous. It now reports its outcome because the ledger
   * write is where a replay is actually detectable: the unique constraint
   * refuses the second insert regardless of what any prior read decided. A
   * caller that ignores the return value gets the old behaviour, which is why
   * callers were updated rather than left alone.
   */
  async consume(token: CapabilityToken): Promise<{ ok: boolean; why?: string }> {
    if (!token?.nonce) return { ok: false, why: "missing token" };

    try {
      // First use: the unique constraint on `nonce` makes this the atomic point.
      await db.capabilityNonce.create({
        data: {
          nonce: token.nonce,
          sessionId: token.sessionId,
          secretId: token.secretId,
          scope: token.scope,
          oneTime: token.oneTime,
          usageLimit: token.usageLimit,
          usedCount: 1,
          expiresAt: new Date(token.expiresAt),
        },
      });
      return { ok: true };
    } catch (e) {
      // Unique violation => the nonce already exists. For a one-time token that
      // is a replay, full stop. For a multi-use token it is an ordinary
      // subsequent use, so increment and re-check the limit.
      const code = (e as { code?: string }).code;
      if (code !== "P2002") {
        return { ok: false, why: `ledger write failed: ${(e as Error).message.slice(0, 80)}` };
      }
      if (token.oneTime) return { ok: false, why: "nonce already consumed (replay)" };

      try {
        const updated = await db.capabilityNonce.update({
          where: { nonce: token.nonce },
          data: { usedCount: { increment: 1 } },
          select: { usedCount: true },
        });
        if (token.usageLimit != null && updated.usedCount > token.usageLimit) {
          return { ok: false, why: "usage limit exhausted" };
        }
        return { ok: true };
      } catch (e2) {
        return { ok: false, why: `ledger update failed: ${(e2 as Error).message.slice(0, 80)}` };
      }
    }
  }
}

/**
 * Drop ledger rows whose token has expired.
 *
 * An expired token fails verifyStatic before the ledger is ever consulted, so
 * keeping its row buys nothing and the table would otherwise grow without
 * bound. Returns the number removed so a caller can log it.
 */
export async function pruneExpiredNonces(before = new Date()): Promise<number> {
  const r = await db.capabilityNonce.deleteMany({ where: { expiresAt: { lt: before } } });
  return r.count;
}

export function newSessionId(): string {
  return "sess_" + randomId();
}
