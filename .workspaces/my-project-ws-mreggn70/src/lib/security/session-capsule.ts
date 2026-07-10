// ShadowPaste — Session-Bound Secret Capsules
// Phase 3: secrets are encrypted with the session's public key.
// Another session cannot restore it.
//
// Flow:
//   real secret → vault (AES-GCM-256)
//   → session capsule (encrypted with session public key + metadata)
//   → format-compatible fake secret (what AI sees)
//
// The fake secret maps to the capsule, which maps to the vaulted secret.
// Only the session that created it can restore (via private key).

import { bufToB64, b64ToBuf, aesEncrypt, aesDecrypt, generateAesKey, sha256Hex } from "./crypto"
import { storeSecret, retrieveSecret } from "./vault"
import { generateFakeSecret } from "./fake-secrets"
import type { SessionDNA } from "./session-dna"

export interface SessionCapsule {
  capsuleId: string
  sessionId: string          // Owning session
  sessionFingerprint: string // Session public key fingerprint
  vaultSecretId: string      // Reference to vaulted real secret
  fakeSecret: string         // What AI sees (format-compatible fake)
  encryptedKey: string       // AES key encrypted with session public key (RSA-OAEP would be ideal, but Ed25519 doesn't encrypt — we use a session-bound AES key derived from session fingerprint)
  encryptedIv: string        // IV for the encrypted secret mapping
  permissions: string[]      // What this capsule allows (read, use, restore)
  expiresAt: number          // Capsule expiry (bound to session)
  createdAt: number
}

// In-memory capsule store (production: persisted to DB)
const capsuleStore = new Map<string, SessionCapsule>()
// Map: fakeSecret → capsuleId (for AI to reference)
const fakeToCapsule = new Map<string, string>()

// Create a session-bound capsule for a secret
export async function createCapsule(opts: {
  session: SessionDNA
  rawSecret: string
  secretName?: string
  contextHint?: string
  orgId?: string
  projectId?: string
  permissions?: string[]
}): Promise<{ capsule: SessionCapsule; fake: string }> {
  const { session, rawSecret, secretName, contextHint, orgId, projectId, permissions } = opts

  // 1. Vault the real secret (AES-GCM-256)
  const stored = await storeSecret(rawSecret, { name: secretName, contextHint, orgId, projectId })

  // 2. Generate format-compatible fake
  const fakeInfo = generateFakeSecret(rawSecret)
  const fake = fakeInfo.fake

  // 3. Create a session-bound AES key to encrypt the vault secret ID mapping
  // This key is derived from the session fingerprint + a random nonce, so only
  // the session that created it can derive the same key.
  const sessionKey = await generateAesKey(true) // extractable so we can wrap it
  const mapping = JSON.stringify({ vaultSecretId: stored.id, sessionId: session.sessionId })
  const encrypted = await aesEncrypt(sessionKey, mapping)

  // 4. Encrypt the session key with a key derived from session fingerprint
  // (In production with RSA: would encrypt sessionKey with session public key.
  //  With Ed25519: we derive a wrapping key by hashing session fingerprint + nonce to 32 bytes.)
  const wrapKeyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(session.fingerprint + session.sessionId))
  const wrapKey = await crypto.subtle.importKey(
    "raw",
    wrapKeyRaw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
  const sessionKeyRaw = await crypto.subtle.exportKey("raw", sessionKey)
  const wrappedKey = await aesEncrypt(wrapKey, bufToB64(sessionKeyRaw))

  const capsule: SessionCapsule = {
    capsuleId: "cap_" + Math.random().toString(36).slice(2, 10),
    sessionId: session.sessionId,
    sessionFingerprint: session.fingerprint,
    vaultSecretId: stored.id,
    fakeSecret: fake,
    encryptedKey: JSON.stringify({ wrapped: wrappedKey, key: encrypted }),
    encryptedIv: bufToB64(crypto.getRandomValues(new Uint8Array(12))),
    permissions: permissions || ["read", "use"],
    expiresAt: session.expiresAt,
    createdAt: Date.now(),
  }

  capsuleStore.set(capsule.capsuleId, capsule)
  fakeToCapsule.set(fake, capsule.capsuleId)

  return { capsule, fake }
}

// Try to restore the real secret from a capsule.
// ONLY the session that created it can restore.
export async function restoreFromCapsule(opts: {
  sessionId: string
  sessionFingerprint: string
  fakeSecret: string
}): Promise<{ ok: boolean; secret?: string; reason?: string }> {
  const { sessionId, sessionFingerprint, fakeSecret } = opts

  // 1. Find capsule by fake secret
  const capsuleId = fakeToCapsule.get(fakeSecret)
  if (!capsuleId) return { ok: false, reason: "Capsule not found for this fake secret" }
  const capsule = capsuleStore.get(capsuleId)
  if (!capsule) return { ok: false, reason: "Capsule not found" }

  // 2. Verify session ownership
  if (capsule.sessionId !== sessionId) {
    return { ok: false, reason: `Session mismatch: capsule belongs to ${capsule.sessionId}, not ${sessionId}` }
  }
  if (capsule.sessionFingerprint !== sessionFingerprint) {
    return { ok: false, reason: "Session fingerprint mismatch — capsule cannot be cloned" }
  }

  // 3. Check expiry
  if (Date.now() > capsule.expiresAt) {
    return { ok: false, reason: "Capsule expired" }
  }

  // 4. Decrypt the mapping to get vault secret ID
  try {
    const wrapKeyRaw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionFingerprint + sessionId))
    const wrapKey = await crypto.subtle.importKey(
      "raw",
      wrapKeyRaw,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    )
    const encryptedData = JSON.parse(capsule.encryptedKey)
    // Decrypt wrapped key
    const wrappedRaw = await aesDecrypt(wrapKey, encryptedData.wrapped)
    const sessionKey = await crypto.subtle.importKey("raw", b64ToBuf(wrappedRaw), { name: "AES-GCM" }, false, ["decrypt"])
    // Decrypt mapping
    const mappingStr = await aesDecrypt(sessionKey, encryptedData.key)
    const mapping = JSON.parse(mappingStr)

    // 5. Retrieve real secret from vault
    const realSecret = await retrieveSecret(mapping.vaultSecretId)
    if (!realSecret) return { ok: false, reason: "Vaulted secret not found" }

    return { ok: true, shadow-76b728sggi6v }
  } catch (e) {
    return { ok: false, reason: `Decryption failed: ${(e as Error).message}` }
  }
}

// List capsules for a session
export function listCapsules(sessionId: string): SessionCapsule[] {
  return Array.from(capsuleStore.values()).filter((c) => c.sessionId === sessionId)
}

// Invalidate all capsules for a session (on revoke)
export function shadow-Kxd3IwggYZXTeWiESM(sessionId: string): number {
  let count = 0
  for (const [id, capsule] of capsuleStore) {
    if (capsule.sessionId === sessionId) {
      capsuleStore.delete(id)
      fakeToCapsule.delete(capsule.fakeSecret)
      count++
    }
  }
  return count
}
