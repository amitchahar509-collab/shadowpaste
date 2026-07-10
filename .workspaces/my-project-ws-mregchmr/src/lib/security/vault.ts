// @shadowpaste/security — encrypted vault + credential injection
// Real AES-GCM-256 encrypted storage. AI agents NEVER receive raw secrets.
// Flow: Claude asks "use GitHub" → ShadowPaste checks identity/permission/policy
//       → mints a scoped, time-limited capability token → injects the real secret
//       into the tool adapter ONLY for the duration of execution → secret is
//       redacted from audit logs → token is consumed (single-use).

import { db } from "@/lib/db";
import { aesEncrypt, aesDecrypt, generateAesKey, generateHmacKey, sha256Hex } from "./crypto";
import { CapabilityEngine, type CapabilityToken } from "./capability";
import { classifyProvider, providerLabel } from "./detector";

// Singleton vault key (process-bound, never persisted to disk in plaintext).
// In production this would be unwrapped from a KMS at boot.
let _vaultKey: CryptoKey | null = null;
let _capEngine: CapabilityEngine | null = null;

export async function getVaultKey(): Promise<CryptoKey> {
  if (!_vaultKey) _vaultKey = await generateAesKey(false);
  return _vaultKey;
}

export async function getCapabilityEngine(): Promise<CapabilityEngine> {
  if (!_capEngine) {
    const hmacKey = await generateHmacKey(false);
    _capEngine = new CapabilityEngine(hmacKey);
  }
  return _capEngine;
}

// ---- Vault entry storage ----
// Secrets are stored encrypted in the VaultEntry table. The raw value lives only
// in memory during a tool call and is NEVER returned to the client or written to
// audit logs in plaintext.

export interface StoredSecret {
  id: string;
  name: string;
  provider: string;
  scope: string;
  fingerprint: string; // sha256 of raw, for dedup
  masked: string;
  encrypted: { iv: number[]; cipher: string };
  createdAt: Date;
}

export async function storeSecret(raw: string, opts: { name?: string; contextHint?: string; orgId?: string; projectId?: string } = {}): Promise<StoredSecret> {
  const key = await getVaultKey();
  const encrypted = await aesEncrypt(key, raw);
  const { provider, scope } = providerLabel(raw, opts.contextHint || "");
  const fingerprint = await sha256Hex(raw);
  const masked = raw.length <= 12 ? raw.slice(0, 4) + "***" : raw.slice(0, 8) + "..." + raw.slice(-4);
  const name = opts.name || `${provider}_${fingerprint.slice(0, 8)}`;

  const row = await db.vaultEntry.create({
    data: {
      name,
      provider,
      scope,
      fingerprint,
      masked,
      encryptedIv: JSON.stringify(encrypted.iv),
      encryptedCipher: encrypted.cipher,
      orgId: opts.orgId || "default",
      projectId: opts.projectId || null,
    },
  });

  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    scope: row.scope,
    fingerprint: row.fingerprint,
    masked: row.masked,
    encrypted,
    createdAt: row.createdAt,
  };
}

export async function retrieveSecret(id: string): Promise<string | null> {
  const key = await getVaultKey();
  const row = await db.vaultEntry.findUnique({ where: { id } });
  if (!row) return null;
  try {
    return await aesDecrypt(key, { iv: JSON.parse(row.encryptedIv), cipher: row.encryptedCipher });
  } catch {
    return null;
  }
}

export async function listSecrets(orgId = "default"): Promise<Array<{ id: string; name: string; provider: string; scope: string; masked: string; fingerprint: string; createdAt: Date }>> {
  const rows = await db.vaultEntry.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => ({ id: r.id, name: r.name, provider: r.provider, scope: r.scope, masked: r.masked, fingerprint: r.fingerprint, createdAt: r.createdAt }));
}

export async function deleteSecret(id: string): Promise<void> {
  await db.vaultEntry.delete({ where: { id } });
}

// ---- Credential injection for tool calls ----
// Given a tool scope (e.g. "github.repo") and a session, find a matching vaulted
// secret, mint a single-use capability token, and return BOTH the raw secret
// (for the tool adapter only) and the token (for audit). The raw secret must
// never be logged.

export interface InjectedCredential {
  token: CapabilityToken;
  raw: string;        // ONLY for the tool adapter; never log this
  secretId: string;
  provider: string;
  scope: string;
}

export async function injectCredential(opts: {
  sessionId: string;
  scope: string;            // e.g. "github.repo", "stripe.charges"
  orgId?: string;
  ttlMs?: number;
}): Promise<InjectedCredential | null> {
  const orgId = opts.orgId || "default";
  // Find a vaulted secret matching the requested scope (prefix match)
  const row = await db.vaultEntry.findFirst({
    where: { orgId, scope: { startsWith: opts.scope.split(".")[0] } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;

  const key = await getVaultKey();
  const raw = await aesDecrypt(key, { iv: JSON.parse(row.encryptedIv), cipher: row.encryptedCipher });
  if (!raw) return null;

  const engine = await getCapabilityEngine();
  const token = await engine.mint({
    secretId: row.id,
    sessionId: opts.sessionId,
    scope: opts.scope,
    action: opts.scope,
    ttlMs: opts.ttlMs ?? 5 * 60 * 1000,
    oneTime: true,
    usageLimit: 1,
  });

  return { token, raw, secretId: row.id, provider: row.provider, scope: row.scope };
}

export async function consumeCredential(token: CapabilityToken): Promise<void> {
  const engine = await getCapabilityEngine();
  engine.consume(token);
}

// ---- Redaction for audit logs ----
// Replaces any raw secret value in an arbitrary string with its vault reference.
export function redactSecrets(text: string, secrets: Array<{ raw: string; reference: string }>): string {
  let out = text;
  for (const s of secrets) {
    if (s.raw && s.raw.length > 4) {
      out = out.split(s.raw).join(s.reference);
    }
  }
  return out;
}

// Scan arbitrary text for secrets and auto-vault any found (used by scanner + file tools).
export async function scanAndVault(text: string, opts: { orgId?: string; projectId?: string; contextHint?: string } = {}): Promise<{ text: string; vaulted: number; findings: Array<{ provider: string; reference: string }> }> {
  const { scanForSecrets, virtualizeText } = await import("./detector");
  const findings = scanForSecrets(text, opts.contextHint);
  if (findings.length === 0) return { text, vaulted: 0, findings: [] };

  const refs: Array<{ raw: string; reference: string }> = [];
  for (const f of findings) {
    const stored = await storeSecret(f.raw, { orgId: opts.orgId, projectId: opts.projectId, contextHint: opts.contextHint });
    refs.push({ raw: f.raw, reference: `{{SHADOW_SECRET_${stored.provider}_${stored.id.slice(-5)}}}` });
  }
  const redacted = redactSecrets(text, refs);
  return {
    text: redacted,
    vaulted: findings.length,
    findings: refs.map((r) => ({ provider: classifyProvider(r.raw).provider, reference: r.reference })),
  };
}
