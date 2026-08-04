// ShadowPaste — import size budget.
//
// THE MISMATCH THIS CLOSES
// ------------------------
// Archive extraction allowed 100 MB (and the upload route allowed 200 MB), but
// importing a project costs far more than extracting it: every file is scanned
// with 501 patterns plus entropy, secrets are vaulted, fakes are written, and
// the tree is copied. Measured end to end on a realistic source tree:
//
//     1 MB /  27 files -> analyze 1.0s + workspace  4.6s =  5.6s
//     2 MB /  54 files -> analyze 1.8s + workspace  4.8s =  6.6s
//     4 MB / 108 files -> analyze 3.5s + workspace  9.4s = 12.9s
//     8 MB / 215 files -> analyze 6.7s + workspace 16.0s = 22.7s
//
// Roughly linear at ~0.33 MB/s. A 100 MB import therefore needs ~300 SECONDS,
// against the 60 s maxDuration in vercel.json — over the deadline by 5x.
//
// The failure mode was the bad one: the request was accepted, ran past the
// platform deadline, and died as a gateway timeout with the workspace half
// written and no explanation the user could act on. A limit that is honest
// about the deadline turns that into an immediate, explicit 413.
//
// WHY THIS IS NOT JUST A SMALLER CONSTANT
// ---------------------------------------
// A persistent host (Docker, Render, Fly) has no per-request deadline, and a
// self-hosted user importing a large monorepo is a legitimate case we should not
// break. So the budget is derived from the deadline that actually applies:
// tight when a request must finish inside a platform timeout, generous when
// nothing is going to kill the process. Both are overridable.

/** Measured end-to-end import throughput, MB/s. See the table above. */
export const MEASURED_IMPORT_MB_PER_SEC = 0.33;

/**
 * Fraction of the deadline the scan may consume. The rest pays for upload
 * transfer, archive extraction, database writes and cold start — none of which
 * are free, and all of which happen inside the same request.
 */
const DEADLINE_BUDGET_FRACTION = 0.5;

/** Platform request deadline in seconds, or null when the host has none. */
function requestDeadlineSec(): number | null {
  const explicit = Number(process.env.SHADOWPASTE_IMPORT_DEADLINE_SEC);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  // Vercel/Lambda kill the invocation; vercel.json sets maxDuration to 60.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) return 60;
  return null;
}

function computeMaxBytes(): number {
  const override = Number(process.env.SHADOWPASTE_MAX_IMPORT_MB);
  if (Number.isFinite(override) && override > 0) return Math.round(override * 1024 * 1024);

  const deadline = requestDeadlineSec();
  if (deadline === null) {
    // No request deadline. Keep the previous generous ceiling so self-hosted
    // imports of large repositories keep working exactly as before.
    return 100 * 1024 * 1024;
  }
  const mb = deadline * DEADLINE_BUDGET_FRACTION * MEASURED_IMPORT_MB_PER_SEC;
  // Never go below 1 MB however tight the deadline — a floor that small would
  // reject ordinary projects and be worse than the timeout it prevents.
  return Math.max(1 * 1024 * 1024, Math.round(mb * 1024 * 1024));
}

/**
 * File-count ceiling. Per-file cost is dominated by open/read/scan/write
 * syscalls, so a tree of many tiny files can blow the deadline while sitting
 * well under the byte budget. Derived from the byte budget assuming a
 * conservative 4 KB average source file.
 */
function computeMaxFiles(bytes: number): number {
  const override = Number(process.env.SHADOWPASTE_MAX_IMPORT_FILES);
  if (Number.isFinite(override) && override > 0) return Math.round(override);
  return Math.max(200, Math.min(5000, Math.round(bytes / 4096)));
}

export const IMPORT_MAX_BYTES = computeMaxBytes();
export const IMPORT_MAX_FILES = computeMaxFiles(IMPORT_MAX_BYTES);

/** Directories never worth importing — skipped before they count against budget. */
export const IMPORT_SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".workspaces", "vendor", "target",
]);

export const importLimitMb = () => Math.round((IMPORT_MAX_BYTES / 1048576) * 10) / 10;

/**
 * Error body for an over-budget import. States the limit, why it exists and how
 * to raise it, because "413" alone leaves the user with nothing to do.
 */
export function overBudgetError(what: "size" | "files") {
  const deadline = requestDeadlineSec();
  const reason = deadline
    ? `this deployment must finish an import within ${deadline}s, and importing scans every file for secrets (~${MEASURED_IMPORT_MB_PER_SEC} MB/s)`
    : `the configured import ceiling`;
  return {
    error: what === "size"
      ? `project too large to import (limit ${importLimitMb()} MB)`
      : `project has too many files to import (limit ${IMPORT_MAX_FILES})`,
    reason,
    limit: what === "size" ? `${importLimitMb()} MB` : `${IMPORT_MAX_FILES} files`,
    hint: deadline
      ? "Import a subdirectory, or self-host on a runtime without a request deadline. SHADOWPASTE_MAX_IMPORT_MB raises the ceiling if your platform allows longer requests."
      : "Set SHADOWPASTE_MAX_IMPORT_MB to raise the ceiling.",
  };
}
