// ShadowPaste — Agent Session DNA
// Every AI session gets a cryptographic identity: Ed25519 keypair + session fingerprint.
// No anonymous AI actions. Sessions are verifiable, revocable, and bound to secrets.
//
// Phase 1: Session Genesis (Ed25519 keypair, session ID, fingerprint)
// Phase 6: Session Kill Switch (instant revoke)
// Phase 4: Cryptographic Flight Recorder (hash chain signing)

import { randomBytes, randomId, bufToB64, b64ToBuf, sha256Hex } from "./crypto"
import { db } from "@/lib/db"

export interface SessionDNA {
  sessionId: string
  publicKeyB64: string      // Ed25519 public key (32 bytes, base64)
  privateKeyRef: string     // Reference to private key storage (never plaintext)
  fingerprint: string       // SHA-256 of public key (session identity)
  createdAt: number
  agentId: string
  agentName: string
  workspacePath: string | null
  trustScore: number
  status: "active" | "revoked" | "expired"
  expiresAt: number
}

// In-memory private key store (NEVER exported as plaintext)
// Production: would use Keychain/TPM/Secret Service. Fallback: encrypted local.
const privateKeyStore = new Map<string, CryptoKey>()

// Active sessions (in-memory + persisted to DB)
const activeSessions = new Map<string, SessionDNA>()

export async function createSessionDNA(opts: {
  agentId: string
  agentName: string
  workspacePath?: string
  trustScore?: number
  ttlMs?: number
}): Promise<{ session: SessionDNA; privateKey: CryptoKey }> {
  const sessionId = "sdna_" + randomId()
  const keyPair = await crypto.subtle.generateKey("Ed25519", false, ["sign", "verify"])
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey)
  const publicKeyB64 = bufToB64(rawPub)
  const fingerprint = await sha256Hex(publicKeyB64)

  const session: SessionDNA = {
    sessionId,
    publicKeyB64,
    privateKeyRef: `key_${sessionId}`,
    fingerprint: fingerprint.slice(0, 16),
    createdAt: Date.now(),
    agentId: opts.agentId,
    agentName: opts.agentName,
    workspacePath: opts.workspacePath || null,
    trustScore: opts.trustScore ?? 50,
    status: "active",
    expiresAt: Date.now() + (opts.ttlMs ?? 8 * 60 * 60 * 1000), // 8h default
  }

  // Store private key in memory (NEVER exported)
  privateKeyStore.set(session.privateKeyRef, keyPair.privateKey)
  activeSessions.set(sessionId, session)

  // Persist session to DB (for crash recovery + audit)
  try {
    await db.toolCall.create({
      data: {
        agentId: opts.agentId,
        toolName: "session.dna.create",
        input: JSON.stringify({ sessionId, fingerprint }),
        output: JSON.stringify({ status: "active", trustScore: session.trustScore }),
        riskScore: 0,
        riskLevel: "low",
        decision: "allowed",
        reason: "Session DNA created",
        duration: 0,
      },
    })
  } catch {}

  return { session, privateKey: keyPair.privateKey }
}

export function getSession(sessionId: string): SessionDNA | null {
  const s = activeSessions.get(sessionId)
  if (!s) return null
  if (s.status === "revoked") return { ...s, status: "revoked" }
  if (Date.now() > s.expiresAt) return { ...s, status: "expired" }
  return s
}

export function getPrivateKey(sessionId: string): CryptoKey | null {
  const session = activeSessions.get(sessionId)
  if (!session || session.status !== "active" || Date.now() > session.expiresAt) return null
  return privateKeyStore.get(session.privateKeyRef) || null
}

// Sign data with session private key
export async function signWithSession(sessionId: string, data: string): Promise<string | null> {
  const privKey = getPrivateKey(sessionId)
  if (!privKey) return null
  const sig = await crypto.subtle.sign("Ed25519", privKey, new TextEncoder().encode(data))
  return bufToB64(sig)
}

// Verify a signature against session public key
export async function verifySessionSignature(sessionId: string, data: string, sigB64: string): Promise<boolean> {
  const session = activeSessions.get(sessionId)
  if (!session) return false
  try {
    const pubKey = await crypto.subtle.importKey("raw", b64ToBuf(session.publicKeyB64), "Ed25519", false, ["verify"])
    return await crypto.subtle.verify("Ed25519", pubKey, b64ToBuf(sigB64), new TextEncoder().encode(data))
  } catch {
    return false
  }
}

// Phase 6: Kill Switch — instant revoke
export function revokeSession(sessionId: string, reason: string): boolean {
  const session = activeSessions.get(sessionId)
  if (!session) return false
  session.status = "revoked"
  // Remove private key from memory — session can no longer sign
  privateKeyStore.delete(session.privateKeyRef)
  // Mark in DB
  try {
    db.toolCall.create({
      data: {
        agentId: session.agentId,
        toolName: "session.dna.revoke",
        input: JSON.stringify({ sessionId, reason }),
        output: JSON.stringify({ status: "revoked" }),
        riskScore: 100,
        riskLevel: "critical",
        decision: "denied",
        reason: `Session killed: ${reason}`,
        duration: 0,
      },
    })
  } catch {}
  return true
}

// Check if session is valid (active + not expired)
export function isSessionValid(sessionId: string): boolean {
  const s = activeSessions.get(sessionId)
  if (!s) return false
  return s.status === "active" && Date.now() <= s.expiresAt
}

// List all active sessions (for dashboard)
export function listActiveSessions(): SessionDNA[] {
  return Array.from(activeSessions.values()).filter((s) => s.status === "active" && Date.now() <= s.expiresAt)
}

// Phase 6: Anomaly detection triggers
export interface AnomalyTrigger {
  type: "secret_extraction" | "dangerous_command" | "permission_abuse" | "prompt_injection"
  detail: string
  riskScore: number
}

export function checkAnomaly(sessionId: string, action: string, input: string): AnomalyTrigger | null {
  const lower = (action + " " + input).toLowerCase()

  // Secret extraction attempt
  if (/(reveal|show|dump|export|leak).*(secret|api.?key|credential|token|password|vault)/i.test(lower)) {
    return { type: "secret_extraction", detail: "Secret extraction attempt detected", riskScore: 95 }
  }

  // Dangerous command
  if (/(drop|truncate|delete.?from|rm.?-rf|format|mkfs)/i.test(lower)) {
    return { type: "dangerous_command", detail: "Dangerous command detected", riskScore: 90 }
  }

  // Prompt injection
  if (/(ignore.*(previous|prior|above).*(instruction|rule|prompt)|you.?are.?now|disregard.*(safety|rule|guardrail)|jailbroken|unrestricted)/i.test(lower)) {
    return { type: "prompt_injection", detail: "Prompt injection attempt detected", riskScore: 85 }
  }

  // Permission abuse (trying to access admin/root without authorization)
  if (/(sudo|admin|root|privilege.?escalation)/i.test(lower)) {
    return { type: "permission_abuse", detail: "Privilege escalation attempt", riskScore: 80 }
  }

  return null
}

// Auto-revoke on high-risk anomaly
export function evaluateAnomaly(sessionId: string, anomaly: AnomalyTrigger): boolean {
  if (anomaly.riskScore >= 85) {
    revokeSession(sessionId, `${anomaly.type}: ${anomaly.detail}`)
    return true // session killed
  }
  return false
}
