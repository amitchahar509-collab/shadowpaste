// @shadowpaste/crypto — isomorphic WebCrypto helpers (browser + Node >=20).
// AES-GCM-256 encryption, HMAC-SHA256 signing, PBKDF2 passphrase wrapping.
// No plaintext is ever persisted by callers of this module.

const g = globalThis;
const subtle = g.crypto && g.crypto.subtle;
if (!subtle) throw new Error('WebCrypto unavailable: requires a secure context (https/localhost) or Node >=20');

const enc = new TextEncoder();
const dec = new TextDecoder();

export function randomBytes(n) { return g.crypto.getRandomValues(new Uint8Array(n)); }
export function randomId() {
  return g.crypto.randomUUID ? g.crypto.randomUUID()
    : Array.from(randomBytes(16)).map(b => b.toString(16).padStart(2, '0')).join('');
}
export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
export function b64ToBuf(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---- AES-GCM ----
export async function generateAesKey(extractable = false) {
  return subtle.generateKey({ name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt']);
}
export async function aesEncrypt(key, plaintext) {
  const iv = randomBytes(12);
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  return { iv: Array.from(iv), cipher: bufToB64(cipher) };
}
export async function aesDecrypt(key, record) {
  const iv = new Uint8Array(record.iv);
  const cipherBuf = typeof record.cipher === 'string' ? b64ToBuf(record.cipher) : record.cipher;
  const plainBuf = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
  return dec.decode(plainBuf);
}

// ---- HMAC-SHA256 (capability signing) ----
export async function generateHmacKey(extractable = false) {
  return subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, extractable, ['sign', 'verify']);
}
export async function importHmacKey(rawSecret) {
  return subtle.importKey('raw', enc.encode(rawSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function hmacSign(key, data) {
  return bufToB64(await subtle.sign('HMAC', key, enc.encode(data)));
}
// constant-time-ish verify via WebCrypto verify (avoids string compare timing leaks)
export async function hmacVerify(key, data, sigB64) {
  try { return await subtle.verify('HMAC', key, b64ToBuf(sigB64), enc.encode(data)); }
  catch { return false; }
}

// ---- SHA-256 hex (dedupe / fingerprint, never reversible to plaintext) ----
export async function sha256Hex(str) {
  const buf = await subtle.digest('SHA-256', enc.encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- PBKDF2 passphrase wrapping (optional zero-trust vault lock) ----
export async function deriveAesKeyFromPassphrase(passphrase, saltB64, iterations = 210000) {
  const salt = saltB64 ? b64ToBuf(saltB64) : randomBytes(16);
  const baseKey = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
  return { key, salt: bufToB64(salt), iterations };
}

export default {
  randomBytes, randomId, bufToB64, b64ToBuf,
  generateAesKey, aesEncrypt, aesDecrypt,
  generateHmacKey, importHmacKey, hmacSign, hmacVerify,
  sha256Hex, deriveAesKeyFromPassphrase
};
