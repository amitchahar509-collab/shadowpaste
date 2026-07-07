// @shadowpaste/sync — client-side encrypted sync (V15 Phase 4).
// The device encrypts every secret under a passphrase-derived key BEFORE upload.
// The server stores only the resulting bundle (salt + ciphertext + metadata) and can
// never derive plaintext without the passphrase (which never leaves the device).
//
// NOT included (needs a real server, unverifiable here): the upload/download HTTP API,
// per-user storage, and auth. This module is the client crypto + versioning/merge logic,
// which is what proves the "server never sees plaintext" property.

import { deriveAesKeyFromPassphrase, aesEncrypt, aesDecrypt, randomId } from '../crypto/index.mjs';

export class SyncManager {
  /** @param {string} passphrase user secret; never transmitted */
  constructor(passphrase) { this.passphrase = passphrase; this.deviceId = 'dev_' + randomId().slice(0, 8); }

  /** Encrypt a list of {reference, provider, plaintext} into an uploadable bundle. */
  async pack(secrets, { version = 1, saltB64 } = {}) {
    const { key, salt } = await deriveAesKeyFromPassphrase(this.passphrase, saltB64);
    const entries = [];
    for (const s of secrets) {
      const enc = await aesEncrypt(key, s.plaintext);
      entries.push({ reference: s.reference, provider: s.provider, iv: enc.iv, cipher: enc.cipher, updatedAt: Date.now() });
    }
    return { format: 'shadowpaste.sync.v1', version, salt, device: this.deviceId, count: entries.length, entries };
  }

  /** Decrypt a bundle back to {reference, provider, plaintext}. Wrong passphrase throws. */
  async unpack(bundle) {
    const { key } = await deriveAesKeyFromPassphrase(this.passphrase, bundle.salt);
    const out = [];
    for (const e of bundle.entries) {
      out.push({ reference: e.reference, provider: e.provider, plaintext: await aesDecrypt(key, { iv: e.iv, cipher: e.cipher }) });
    }
    return out;
  }

  /**
   * Conflict handling: merge a local and remote bundle without decrypting.
   * Higher bundle.version wins overall; within equal versions, per-reference latest
   * updatedAt wins (last-write-wins). Returns a new merged bundle (version bumped).
   */
  merge(localBundle, remoteBundle) {
    if (localBundle.version !== remoteBundle.version) {
      return (localBundle.version > remoteBundle.version) ? localBundle : remoteBundle;
    }
    const byRef = new Map();
    for (const e of [...remoteBundle.entries, ...localBundle.entries]) {
      const prev = byRef.get(e.reference);
      if (!prev || e.updatedAt > prev.updatedAt) byRef.set(e.reference, e);
    }
    return { ...localBundle, version: localBundle.version + 1, entries: [...byRef.values()], count: byRef.size };
  }
}

/** Static check any test/CI can run: does a bundle contain a given plaintext? (must be false) */
export function bundleLeaks(bundle, plaintext) {
  return JSON.stringify(bundle).includes(plaintext);
}

export default { SyncManager, bundleLeaks };
