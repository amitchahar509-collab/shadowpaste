// @shadowpaste/auth — isomorphic auth PRIMITIVES (V15 Phase 2).
// Password hashing (PBKDF2-SHA256), access/refresh token mint/verify/rotate (HMAC),
// and brute-force lockout. These are the verifiable building blocks.
//
// NOT included here (needs a real server + DB, unverifiable in this environment):
// HTTP routes, secure-cookie transport, CSRF middleware, OAuth redirect flow,
// WebAuthn ceremony, and persistent session/user storage. See server/ + prisma/.

import { hmacSign, hmacVerify, randomBytes, bufToB64, b64ToBuf } from '../crypto/index.mjs';

const g = globalThis;
const subtle = g.crypto.subtle;
const enc = new TextEncoder();

// ---- Password hashing (PBKDF2-SHA256, 210k) ----
export async function hashPassword(password, saltB64) {
  const salt = saltB64 ? b64ToBuf(saltB64) : randomBytes(16);
  const baseKey = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, baseKey, 256);
  return { hash: bufToB64(bits), salt: bufToB64(salt), iterations: 210000 };
}
export async function verifyPassword(password, record) {
  const again = await hashPassword(password, record.salt);
  // constant-time-ish compare via HMAC-of-equal-length would be ideal; length is fixed here
  const a = again.hash, b = record.hash;
  if (a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- Tokens (HMAC-signed; a compact JWT-shaped payload) ----
const ACCESS_TTL = 15 * 60 * 1000;         // 15 min
const REFRESH_TTL = 30 * 24 * 3600 * 1000; // 30 days

export class TokenService {
  constructor(hmacKey) { this.key = hmacKey; this.revokedRefresh = new Set(); }
  #canon(p) { const { sig, ...rest } = p; return JSON.stringify(rest); }
  async mintAccess(userId, orgId, role, ttl = ACCESS_TTL) {
    const p = { t: 'access', sub: userId, org: orgId, role, iat: Date.now(), exp: Date.now() + ttl, jti: bufToB64(randomBytes(9)) };
    p.sig = await hmacSign(this.key, this.#canon(p)); return p;
  }
  async mintRefresh(userId, ttl = REFRESH_TTL) {
    const p = { t: 'refresh', sub: userId, iat: Date.now(), exp: Date.now() + ttl, jti: bufToB64(randomBytes(12)) };
    p.sig = await hmacSign(this.key, this.#canon(p)); return p;
  }
  async verify(token, expectedType) {
    if (!token || typeof token !== 'object') return { ok: false, why: 'missing' };
    if (expectedType && token.t !== expectedType) return { ok: false, why: 'wrong type' };
    if (!token.sig || !(await hmacVerify(this.key, this.#canon(token), token.sig))) return { ok: false, why: 'bad signature' };
    if (Date.now() > token.exp) return { ok: false, why: 'expired' };
    if (token.t === 'refresh' && this.revokedRefresh.has(token.jti)) return { ok: false, why: 'revoked' };
    return { ok: true, claims: token };
  }
  /** Rotate: verify old refresh, revoke it, issue a fresh refresh + access pair. */
  async rotateRefresh(oldRefresh, orgId, role) {
    const v = await this.verify(oldRefresh, 'refresh');
    if (!v.ok) return { ok: false, why: v.why };
    this.revokedRefresh.add(oldRefresh.jti);
    return { ok: true, access: await this.mintAccess(oldRefresh.sub, orgId, role), refresh: await this.mintRefresh(oldRefresh.sub) };
  }
  logout(refresh) { if (refresh && refresh.jti) this.revokedRefresh.add(refresh.jti); }
}

// ---- Brute-force lockout ----
export class LoginThrottle {
  constructor({ max = 5, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000 } = {}) {
    this.max = max; this.windowMs = windowMs; this.lockMs = lockMs; this.map = new Map();
  }
  #rec(id) { let r = this.map.get(id); if (!r) { r = { fails: 0, first: Date.now(), lockedUntil: 0 }; this.map.set(id, r); } return r; }
  check(id) {
    const r = this.#rec(id);
    if (r.lockedUntil > Date.now()) return { allowed: false, retryInMs: r.lockedUntil - Date.now() };
    return { allowed: true };
  }
  fail(id) {
    const r = this.#rec(id);
    if (Date.now() - r.first > this.windowMs) { r.fails = 0; r.first = Date.now(); }
    r.fails++;
    if (r.fails >= this.max) r.lockedUntil = Date.now() + this.lockMs;
    return { fails: r.fails, locked: r.lockedUntil > Date.now() };
  }
  success(id) { this.map.delete(id); }
}

export default { hashPassword, verifyPassword, TokenService, LoginThrottle };
