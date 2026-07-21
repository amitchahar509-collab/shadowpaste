// @shadowpaste/security — crypto primitives
// Ported from the original engine (packages/crypto/index.mjs) to TypeScript.
// AES-GCM-256 encryption, HMAC-SHA256 signing, PBKDF2 passphrase wrapping.
// Uses Node.js WebCrypto (globalThis.crypto.subtle) — isomorphic, no native deps.
// No plaintext is ever persisted by callers of this module.

const g = globalThis;
const subtle = g.crypto?.subtle;
if (!subtle) throw new Error("WebCrypto unavailable: requires Node >= 20 or a secure context");

const enc = new TextEncoder();
const dec = new TextDecoder();

// Byte helpers are annotated as Uint8Array<ArrayBuffer> rather than the bare
// Uint8Array: since TS 5.7 the bare form widens to ArrayBufferLike, which is
// not assignable to the BufferSource that WebCrypto expects.
export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return g.crypto.getRandomValues(new Uint8Array(n));
}

export function randomId(): string {
  return g.crypto.randomUUID
    ? g.crypto.randomUUID()
    : Array.from(randomBytes(16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return Buffer.from(s, "binary").toString("base64");
}

export function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const s = Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---- AES-GCM-256 ----
export async function generateAesKey(extractable = false): Promise<CryptoKey> {
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

export interface AesRecord {
  iv: number[];
  cipher: string;
}

export async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<AesRecord> {
  const iv = randomBytes(12);
  const cipher = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { iv: Array.from(iv), cipher: bufToB64(cipher) };
}

export async function aesDecrypt(key: CryptoKey, record: AesRecord): Promise<string> {
  const iv = new Uint8Array(record.iv);
  const cipherBuf = b64ToBuf(record.cipher);
  const plainBuf = await subtle.decrypt({ name: "AES-GCM", iv }, key, cipherBuf);
  return dec.decode(plainBuf);
}

// ---- HMAC-SHA256 (capability signing) ----
export async function generateHmacKey(extractable = false): Promise<CryptoKey> {
  return subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, extractable, ["sign", "verify"]);
}

export async function importHmacKey(rawSecret: string): Promise<CryptoKey> {
  return subtle.importKey("raw", enc.encode(rawSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function hmacSign(key: CryptoKey, data: string): Promise<string> {
  return bufToB64(await subtle.sign("HMAC", key, enc.encode(data)));
}

export async function hmacVerify(key: CryptoKey, data: string, sigB64: string): Promise<boolean> {
  try {
    return await subtle.verify("HMAC", key, b64ToBuf(sigB64), enc.encode(data));
  } catch {
    return false;
  }
}

// ---- SHA-256 hex (fingerprinting, never reversible) ----
export async function sha256Hex(str: string): Promise<string> {
  const buf = await subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---- PBKDF2 passphrase wrapping (zero-trust vault lock) ----
export async function deriveAesKeyFromPassphrase(
  passphrase: string,
  saltB64?: string,
  iterations = 210000
): Promise<{ key: CryptoKey; salt: string; iterations: number }> {
  const salt = saltB64 ? b64ToBuf(saltB64) : randomBytes(16);
  const baseKey = await subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { key, salt: bufToB64(salt), iterations };
}
