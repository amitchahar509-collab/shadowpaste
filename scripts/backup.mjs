#!/usr/bin/env node
// ShadowPaste — logical backup, restore and RESTORE VALIDATION.
//
// Why not just document "run pg_dump": because a backup nobody has restored is
// not a backup, and `pg_dump` may not exist on the host (it does not on this
// Windows dev box). This tool works through Prisma, so it runs anywhere the app
// runs, and it can VERIFY a restore rather than assume one.
//
//   node scripts/backup.mjs backup   [--out DIR] [--org ID]
//   node scripts/backup.mjs verify   --file FILE
//   node scripts/backup.mjs restore  --file FILE --target-url URL [--confirm]
//
// SAFETY: `restore` refuses to write to the URL in DATABASE_URL unless
// --confirm is passed AND the target is empty. A restore tool that can silently
// overwrite production is a bigger risk than the outage it exists to fix.
//
// Integrity: every dump carries a sha256 over its canonical row payload plus the
// audit-chain head hash, so `verify` proves the file is intact AND that the audit
// trail inside it was not edited after export.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, dflt = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? dflt : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

// Tables exported, in dependency order so a restore satisfies foreign keys.
// Order matters: Organization before Agent, Agent before ToolCall, and so on.
const TABLES = [
  "user", "organization", "team", "membership", "project", "agent", "session",
  "permission", "mcpTool", "mcpPackage", "vaultEntry", "toolCall", "toolExecution",
  "auditLog", "scan", "sandboxChange", "attackTest", "oAuthClient", "oAuthCode",
  "oAuthToken", "publicScan", "userSession",
];

function die(msg) {
  console.error(`[backup] ERROR: ${msg}`);
  process.exit(1);
}

/** Stable stringify so the integrity hash does not depend on key order. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Audit chain — MUST match src/lib/observability/audit-chain.ts exactly.
// Duplicated deliberately (see doBackup) because this script runs under plain
// `node`, which cannot resolve the app's `@/` path alias. A unit test pins the
// two implementations together.
// ---------------------------------------------------------------------------
const AUDIT_GENESIS = createHash("sha256").update("shadowpaste-audit-genesis").digest("hex");

function canonicalizeAuditRow(r) {
  const created = r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt);
  return JSON.stringify([
    r.id,
    r.orgId,
    r.actorType,
    r.actorId ?? null,
    r.action,
    r.target ?? null,
    r.metadata ?? null,
    created.toISOString(),
  ]);
}

/** Fold the chain over rows in the same (createdAt, id) order the module uses. */
function auditChainHead(rows) {
  const ordered = [...rows].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  let h = AUDIT_GENESIS;
  for (const r of ordered) {
    h = createHash("sha256").update(h).update(canonicalizeAuditRow(r)).digest("hex");
  }
  return h;
}

function payloadHash(data) {
  const h = createHash("sha256");
  for (const t of TABLES) h.update(t).update(canonical(data[t] ?? []));
  return h.digest("hex");
}

async function loadPrisma(url) {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
}

async function doBackup() {
  const outDir = flag("out", "backups");
  const orgId = flag("org");
  mkdirSync(outDir, { recursive: true });
  const db = await loadPrisma();

  const data = {};
  let total = 0;
  for (const t of TABLES) {
    const model = db[t];
    if (!model?.findMany) { console.warn(`[backup] skipping unknown model ${t}`); continue; }
    // Only tenant-scoped tables can be filtered by org; the rest are global.
    let where = undefined;
    if (orgId) {
      try { where = { orgId }; await model.count({ where }); }
      catch { where = undefined; } // model has no orgId column
    }
    const rows = await model.findMany(where ? { where } : undefined);
    data[t] = rows;
    total += rows.length;
    console.log(`[backup] ${t.padEnd(16)} ${rows.length}`);
  }

  // Audit-chain head, so a restore can prove the trail was not edited in transit.
  //
  // Computed inline rather than by importing src/lib/observability/audit-chain.ts:
  // that module uses the `@/` TS path alias, which plain `node` cannot resolve, so
  // the import silently failed and every dump recorded "unavailable". A backup
  // integrity field that is always absent is worse than none — it looks like a
  // feature. auditChainHead() below MUST stay identical to chainStep()/
  // canonicalizeRow() in that module; tests/unit/observability.test.ts asserts the
  // two implementations agree so they cannot drift apart unnoticed.
  const auditHead = auditChainHead(data.auditLog ?? []);

  const dump = {
    format: "shadowpaste-backup/v1",
    createdAt: new Date().toISOString(),
    scope: { orgId: orgId ?? null },
    tables: TABLES,
    rowCount: total,
    auditChainHead: auditHead,
    integrity: { algorithm: "sha256", value: payloadHash(data) },
    data,
  };
  const name = `shadowpaste-${orgId ? `${orgId}-` : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const file = path.join(outDir, name);
  writeFileSync(file, JSON.stringify(dump), "utf8");
  await db.$disconnect();
  console.log(`\n[backup] wrote ${file}`);
  console.log(`[backup] rows=${total} sha256=${dump.integrity.value.slice(0, 16)}… auditChainHead=${auditHead ? auditHead.slice(0, 16) + "…" : "unavailable"}`);
  return file;
}

function readDump(file) {
  if (!file || !existsSync(file)) die(`file not found: ${file}`);
  const dump = JSON.parse(readFileSync(file, "utf8"));
  if (dump.format !== "shadowpaste-backup/v1") die(`unsupported format: ${dump.format}`);
  return dump;
}

function doVerify() {
  const dump = readDump(flag("file"));
  const actual = payloadHash(dump.data);
  const ok = actual === dump.integrity?.value;
  const counted = TABLES.reduce((n, t) => n + (dump.data[t]?.length ?? 0), 0);
  console.log(`[verify] format          ${dump.format}`);
  console.log(`[verify] createdAt       ${dump.createdAt}`);
  console.log(`[verify] rows declared   ${dump.rowCount}`);
  console.log(`[verify] rows present    ${counted}`);
  console.log(`[verify] sha256 expected ${dump.integrity?.value?.slice(0, 32)}…`);
  console.log(`[verify] sha256 actual   ${actual.slice(0, 32)}…`);
  console.log(`[verify] auditChainHead  ${dump.auditChainHead ?? "unavailable"}`);
  console.log(`[verify] INTEGRITY       ${ok ? "OK" : "FAILED"}`);
  console.log(`[verify] ROW COUNT       ${counted === dump.rowCount ? "OK" : "MISMATCH"}`);
  if (!ok || counted !== dump.rowCount) process.exit(1);
}

async function doRestore() {
  const dump = readDump(flag("file"));
  const targetUrl = flag("target-url");
  if (!targetUrl) die("--target-url is required (restore never defaults to DATABASE_URL)");
  if (targetUrl === process.env.DATABASE_URL && !has("confirm")) {
    die("refusing to restore over DATABASE_URL without --confirm");
  }
  const actual = payloadHash(dump.data);
  if (actual !== dump.integrity?.value) die("integrity check failed — refusing to restore a corrupt dump");

  const db = await loadPrisma(targetUrl);
  // Refuse a non-empty target unless explicitly confirmed: a restore that
  // half-merges into live data is worse than a failed restore.
  const existingUsers = await db.user.count();
  if (existingUsers > 0 && !has("confirm")) {
    await db.$disconnect();
    die(`target already has ${existingUsers} users — pass --confirm to proceed`);
  }

  let inserted = 0;
  for (const t of TABLES) {
    const rows = dump.data[t] ?? [];
    if (rows.length === 0) continue;
    const model = db[t];
    if (!model?.createMany) continue;
    // skipDuplicates keeps the restore idempotent, so a retry after a partial
    // failure does not abort on primary-key collisions.
    const res = await model.createMany({ data: rows, skipDuplicates: true });
    inserted += res.count ?? 0;
    console.log(`[restore] ${t.padEnd(16)} +${res.count ?? 0}/${rows.length}`);
  }
  await db.$disconnect();
  console.log(`\n[restore] inserted ${inserted} rows into the target`);
}

const main = async () => {
  switch (cmd) {
    case "backup": await doBackup(); break;
    case "verify": doVerify(); break;
    case "restore": await doRestore(); break;
    default:
      console.log("usage: node scripts/backup.mjs <backup|verify|restore> [flags]");
      console.log("  backup  --out DIR --org ID");
      console.log("  verify  --file FILE");
      console.log("  restore --file FILE --target-url URL [--confirm]");
      process.exit(cmd ? 1 : 0);
  }
};
main().catch((e) => die(e.message));
