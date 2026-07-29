#!/usr/bin/env node
// Coverage gate for the security core.
//
// WHY THIS EXISTS INSTEAD OF bunfig's coverageThreshold
// ----------------------------------------------------
// bunfig.toml accepts [test.coverageThreshold], and Bun 1.3.14 accepts it
// without complaint — but it does not fail the run. Verified directly: with
// line = 0.99 and function = 0.99 against ~50%/~44% actual, `bun test` still
// exited 0, both with the CLI flag and with `coverage = true` in config.
//
// A threshold that silently never fires is worse than none: it looks like
// enforcement in the repo and in CI while permitting any regression. So the
// gate is implemented here, where its behaviour is verifiable.
//
//   node scripts/check-coverage.mjs
//
// Thresholds are set just below the measured values so a real regression fails
// while an incidental refactor does not. Raise them as coverage improves. Do
// not lower them to make a build pass — that defeats the point of the file.

import { spawnSync } from "node:child_process";

const MIN_LINES = 48.0;
const MIN_FUNCS = 42.0;

// No shell: passing args through a shell triggers DEP0190 and would need
// escaping. Bun ships as bun.exe on Windows, so resolve the binary directly.
const run = spawnSync(
  process.platform === "win32" ? "bun.exe" : "bun",
  ["test", "tests/unit/", "--coverage", "--coverage-reporter=text"],
  { encoding: "utf8" }
);

const output = `${run.stdout || ""}${run.stderr || ""}`;
process.stdout.write(output);

if (run.status !== 0) {
  console.error(`\n[coverage] test run failed (exit ${run.status}) — not evaluating thresholds.`);
  process.exit(run.status || 1);
}

// Bun's text reporter prints: " All files | <funcs> | <lines> | <uncovered>"
const row = output.split("\n").find((l) => /^\s*All files\s*\|/.test(l));
if (!row) {
  console.error("\n[coverage] could not find the 'All files' summary row — refusing to pass a gate I cannot evaluate.");
  process.exit(1);
}

const cells = row.split("|").map((c) => c.trim());
const funcs = Number.parseFloat(cells[1]);
const lines = Number.parseFloat(cells[2]);

if (!Number.isFinite(funcs) || !Number.isFinite(lines)) {
  console.error(`\n[coverage] could not parse the summary row: ${row}`);
  process.exit(1);
}

const failures = [];
if (lines < MIN_LINES) failures.push(`lines ${lines.toFixed(2)}% < ${MIN_LINES}%`);
if (funcs < MIN_FUNCS) failures.push(`functions ${funcs.toFixed(2)}% < ${MIN_FUNCS}%`);

console.log(
  `\n[coverage] security core — lines ${lines.toFixed(2)}% (min ${MIN_LINES}%), ` +
  `functions ${funcs.toFixed(2)}% (min ${MIN_FUNCS}%)`
);
console.log("[coverage] scope: modules imported by tests/unit/**. NOT a whole-repo figure — see bunfig.toml.");

if (failures.length) {
  console.error(`[coverage] FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("[coverage] PASS");
