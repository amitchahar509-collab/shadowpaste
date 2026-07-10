# Hardware Security Report

> Task 4 — Session DNA secure storage verification.

## Status: ⚠️ FALLBACK MODE (encrypted local, not hardware-bound)

## What Was Implemented

Session DNA uses **Ed25519 keypairs** generated via WebCrypto:
```typescript
const keyPair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"])
```

- Private keys are stored **in-memory only** (`privateKeyStore: Map<string, CryptoKey>`)
- Private keys are **never exported as plaintext** (`extractable: false` on key generation)
- On session revoke, private key is deleted from memory

## Hardware Support Status

| Platform | Hardware API | Status |
|----------|-------------|--------|
| macOS | Keychain / TouchID | ⛔ NOT IMPLEMENTED — fallback mode |
| Windows | TPM / Windows Hello | ⛔ NOT IMPLEMENTED — fallback mode |
| Linux | Secret Service (libsecret) | ⛔ NOT IMPLEMENTED — fallback mode |

## Fallback Mode (current)

- **Storage**: In-memory `Map<string, CryptoKey>` (process-bound)
- **Encryption**: Keys are `CryptoKey` objects (non-extractable, never serialized to plaintext)
- **Persistence**: None — on server restart, sessions are lost (must re-authenticate)
- **Security**: Private keys cannot be exported via `crypto.subtle.exportKey()` (extractable=false)

## Why Hardware Not Implemented

1. **Sandbox limitation**: No TPM, Keychain, or Secret Service available in cloud sandbox
2. **Platform-specific**: Each OS has different hardware API (would need native modules)
3. **Priority**: Core workflow (protect/restore) works without hardware. Hardware is enterprise hardening.

## What Hardware Would Add

- **TPM/Keychain**: Private keys stored in hardware-protected storage (cannot be extracted even with process access)
- **TouchID/Windows Hello**: Biometric confirmation before signing (Phase 7 conditional restore)
- **Persistence**: Sessions survive server restart (keys recovered from hardware)

## To Implement Hardware (future)

```typescript
// macOS: use keychain module
import { setKey, getKey } from 'node-keytar'
await setKey('ShadowPaste', sessionId, privateKeyB64)

// Windows: use tpm module or Windows Hello
// Linux: use libsecret via DBus
```

**Status**: ⚠️ FALLBACK MODE — real Ed25519 cryptography, keys never exported, but not hardware-bound. Acceptable for 1.0. Enterprise hardening is a future milestone.
