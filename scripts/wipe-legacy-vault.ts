// One-time migration — remove vault ciphertext that predates the persisted
// master key (audit finding C-1).
//
// Before the fix, the AES-GCM-256 vault key was generated fresh in memory on
// every boot and never persisted, so any VaultEntry written by an earlier
// process is mathematically undecryptable: the key that could read it no longer
// exists. Those rows are unrecoverable garbage that would otherwise render in
// the Vault UI as if they were live secrets.
//
// Usage:
//   bun run scripts/wipe-legacy-vault.ts          # dry run (counts only)
//   bun run scripts/wipe-legacy-vault.ts --apply  # actually delete
//
// Safe to re-run: once wiped, later rows are encrypted under the persisted key
// and are NOT touched by this script (it only ever runs when you pass --apply).

import { db } from "../src/lib/db"

async function main() {
  const apply = process.argv.includes("--apply")

  const total = await db.vaultEntry.count()
  if (total === 0) {
    console.log("\n  ✓ No vault entries found — nothing to migrate.\n")
    return
  }

  const sample = await db.vaultEntry.findMany({
    select: { id: true, name: true, provider: true, masked: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 5,
  })

  console.log(`\n  Legacy vault entries found: ${total}`)
  console.log("  These were encrypted with an ephemeral key and can no longer be decrypted.\n")
  for (const s of sample) {
    console.log(`    - ${s.name} [${s.provider}] ${s.masked}  (${s.createdAt.toISOString().slice(0, 10)})`)
  }
  if (total > sample.length) console.log(`    … and ${total - sample.length} more`)

  if (!apply) {
    console.log(`\n  DRY RUN — nothing deleted. Re-run with --apply to remove all ${total} rows.\n`)
    return
  }

  const res = await db.vaultEntry.deleteMany({})
  console.log(`\n  ✓ Deleted ${res.count} unrecoverable vault entries.`)
  console.log("  The vault now starts clean; new secrets are encrypted under the persisted master key.\n")
}

main()
  .catch((e) => { console.error("  ✗ Migration failed:", (e as Error).message); process.exit(1) })
  .finally(async () => { await db.$disconnect().catch(() => {}) })
