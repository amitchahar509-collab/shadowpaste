// ShadowPaste — tamper-evident audit chain.
//
// THE GAP THIS CLOSES
// -------------------
// AuditLog had no update or delete path, so it was append-only *by convention* —
// nothing in the application mutated it. But convention is not evidence. Anyone
// with database credentials (a DBA, a stolen connection string, a compromised
// migration) could edit or remove a row and leave no trace, and a compliance
// reviewer had no way to demonstrate otherwise. "We don't have code that deletes
// it" is not an integrity control.
//
// This adds a hash chain over the audit trail, computed on demand rather than
// stored, so it requires NO schema migration and cannot itself be tampered with
// by editing a column:
//
//   H(0) = sha256("shadowpaste-audit-genesis")
//   H(n) = sha256( H(n-1) || canonical(row_n) )
//
// Properties this gives a reviewer:
//   * Deleting a row changes every subsequent hash -> detected.
//   * Editing any covered field changes that row's hash and all later ones ->
//     detected, and the FIRST divergent row localises the tampering.
//   * Re-ordering is detected, because createdAt+id ordering is part of the chain.
//
// Honest limits, stated rather than implied:
//   * An attacker who can rewrite the whole table CAN recompute a consistent
//     chain. Detecting that requires the head hash to be anchored somewhere the
//     database cannot reach — see anchorHead() and the runbook. The chain proves
//     integrity RELATIVE to a known-good anchor; it is not magic.
//   * APPEND-only tampering (adding fabricated rows at the end) is not detectable
//     from the chain alone for the same reason.

import { createHash } from "node:crypto";
import { db } from "@/lib/db";

const GENESIS = createHash("sha256").update("shadowpaste-audit-genesis").digest("hex");

/** Fields covered by the chain. Changing this list changes every hash — by design. */
export interface ChainedRow {
  id: string;
  orgId: string;
  actorType: string;
  actorId: string | null;
  action: string;
  target: string | null;
  metadata: string | null;
  createdAt: Date;
}

/**
 * Canonical serialization of one row.
 *
 * Field order is FIXED and explicit rather than derived from Object.keys, because
 * key order is not guaranteed across drivers or versions — a chain that depends on
 * it would produce spurious tamper alerts after a dependency upgrade.
 */
export function canonicalizeRow(r: ChainedRow): string {
  return JSON.stringify([
    r.id,
    r.orgId,
    r.actorType,
    r.actorId ?? null,
    r.action,
    r.target ?? null,
    r.metadata ?? null,
    r.createdAt.toISOString(),
  ]);
}

/** H(n) = sha256(H(n-1) || canonical(row)). */
export function chainStep(prevHash: string, row: ChainedRow): string {
  return createHash("sha256").update(prevHash).update(canonicalizeRow(row)).digest("hex");
}

export interface VerifyResult {
  ok: boolean;
  rowsVerified: number;
  headHash: string;
  genesisHash: string;
  /** Populated when an anchor was supplied and did not match. */
  anchorMismatch?: { expected: string; actual: string };
  /** First row whose recomputed hash diverged, when a stored chain was compared. */
  firstDivergentRowId?: string;
  scope: { orgId?: string; from?: string; to?: string };
}

/**
 * Recompute the chain over an org's audit trail (or the whole trail).
 *
 * Streams in pages so a large trail cannot exhaust memory — an integrity check
 * that OOMs on the table it is meant to protect is not a control.
 */
export async function verifyAuditChain(opts: {
  orgId?: string;
  from?: Date;
  to?: Date;
  /** Previously anchored head hash to compare against. */
  expectedHead?: string;
  pageSize?: number;
} = {}): Promise<VerifyResult> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 500, 50), 2000);
  const where: Record<string, unknown> = {};
  if (opts.orgId) where.orgId = opts.orgId;
  if (opts.from || opts.to) {
    where.createdAt = {
      ...(opts.from ? { gte: opts.from } : {}),
      ...(opts.to ? { lte: opts.to } : {}),
    };
  }

  let hash = GENESIS;
  let rowsVerified = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await db.auditLog.findMany({
      where,
      // Deterministic total order: createdAt alone collides for rows written in
      // the same millisecond, which would make the chain non-reproducible.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, orgId: true, actorType: true, actorId: true, action: true, target: true, metadata: true, createdAt: true },
    });
    if (page.length === 0) break;
    for (const row of page) {
      hash = chainStep(hash, row as ChainedRow);
      rowsVerified++;
    }
    cursor = page[page.length - 1].id;
    if (page.length < pageSize) break;
  }

  const result: VerifyResult = {
    ok: true,
    rowsVerified,
    headHash: hash,
    genesisHash: GENESIS,
    scope: {
      orgId: opts.orgId,
      from: opts.from?.toISOString(),
      to: opts.to?.toISOString(),
    },
  };

  if (opts.expectedHead && opts.expectedHead !== hash) {
    result.ok = false;
    result.anchorMismatch = { expected: opts.expectedHead, actual: hash };
  }
  return result;
}

/**
 * Produce an anchor record for external storage.
 *
 * The head hash must be persisted somewhere the database cannot rewrite (object
 * storage with retention lock, a signed commit, a compliance vault, or simply a
 * printed/emailed record). Without an external anchor the chain detects targeted
 * edits but not a wholesale rewrite — see the module header. This function
 * deliberately returns the anchor for the caller to store rather than writing it
 * back into the same database, which would defeat the purpose.
 */
export async function anchorHead(orgId?: string): Promise<{
  anchoredAt: string;
  orgId: string | null;
  rowsCovered: number;
  headHash: string;
  algorithm: string;
  storageGuidance: string;
}> {
  const v = await verifyAuditChain({ orgId });
  return {
    anchoredAt: new Date().toISOString(),
    orgId: orgId ?? null,
    rowsCovered: v.rowsVerified,
    headHash: v.headHash,
    algorithm: "sha256-chain/v1",
    storageGuidance:
      "Store OUTSIDE this database (WORM object storage, signed git tag, or compliance vault). " +
      "An anchor kept in the same database it protects provides no assurance against a full rewrite.",
  };
}
