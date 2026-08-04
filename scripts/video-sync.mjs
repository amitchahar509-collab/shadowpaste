#!/usr/bin/env node
// ShadowPaste — video staleness detector.
//
// WHAT THIS IS FOR
// ----------------
// A demo video is a claim frozen in time. The repository moves; the video does
// not. The dangerous case is not a video that looks dated — it is a video that
// confidently shows a number, a command or a decision that the code no longer
// produces. This maps source paths to the videos that depend on them and reports
// which ones a change has invalidated.
//
// WHAT IT DELIBERATELY DOES NOT DO
// --------------------------------
// It does not re-render anything. Rendering is a paid action, and an automatic
// re-render on every commit would spend money on a change that may not affect a
// single frame. It reports; a human decides. It also does not touch videos whose
// inputs did not change — re-cutting an unaffected video introduces risk for no
// benefit.
//
// USAGE
//   node scripts/video-sync.mjs            report stale scripts and renders
//   node scripts/video-sync.mjs --mark     record HEAD as the synced commit
//   node scripts/video-sync.mjs --json     machine-readable output for CI

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const STATE_FILE = "docs/videos/.sync-state.json";

/**
 * Which source paths each video's claims depend on.
 *
 * A path listed here means: if this changes, the video may now be showing
 * something untrue. Be generous — a false "stale" costs a review, a missed one
 * ships a wrong claim.
 */
const DEPENDENCIES = {
  "01-what-shadowpaste-does": [
    "src/lib/security/secret-patterns.ts",
    "src/lib/policy.ts",
    "src/lib/tool-registry.ts",
    "cli/index.ts",
    "README.md",
  ],
  "02-install-and-first-run": ["package.json", "README.md", ".env.example", "docker-compose.yml", "prisma/schema.prisma"],
  "03-first-scan": ["src/lib/security/detector.ts", "src/lib/security/secret-patterns.ts", "cli/index.ts"],
  "04-secret-virtualization": [
    "src/lib/security/detector.ts",
    "src/lib/security/secret-patterns.ts",
    "src/lib/security/fake-secrets.ts",
    "src/lib/security/vault.ts",
    "src/lib/workspace.ts",
  ],
  "05-restore": ["src/lib/workspace.ts", "src/lib/security/vault.ts", "cli/index.ts"],
  "06-mcp-gateway": [
    "src/lib/gateway.ts",
    "src/lib/policy.ts",
    "src/lib/risk.ts",
    "src/lib/security/preflight.ts",
    "src/lib/tools/adapters.ts",
    "src/app/api/mcp/route.ts",
  ],
  "07-attack-blocked": [
    "src/lib/gateway.ts",
    "src/lib/policy.ts",
    "src/lib/security/preflight.ts",
    "src/lib/tools/adapters.ts",
  ],
  "08-mcp-client-setup": ["src/app/api/mcp/route.ts", "src/lib/oauth.ts", "README.md"],
  "09-vault-capability-tokens": ["src/lib/security/vault.ts", "src/lib/security/capability.ts"],
  "10-audit-chain": ["src/lib/observability/audit-chain.ts", "src/app/api/v1/audit/verify/route.ts"],
  "11-oauth-mcp": ["src/lib/oauth.ts", "src/app/oauth", "src/app/.well-known"],
  "12-cli-walkthrough": ["cli/index.ts", "src/lib/workspace.ts"],
  "13-api-walkthrough": ["src/app/api", "docs/API.md"],
  "14-import-a-project": [
    "src/app/api/workspace/upload/route.ts",
    "src/app/api/workspace/clone/route.ts",
    "src/app/api/workspace/import/route.ts",
    "src/lib/archive.ts",
    "src/lib/import-budget.ts",
  ],
  "15-alerting": ["src/lib/observability/alerts.ts", "src/lib/gateway.ts"],
  "16-security-architecture": [
    "src/lib/oauth.ts",
    "src/lib/policy.ts",
    "src/lib/security/vault.ts",
    "src/lib/security/preflight.ts",
    "src/lib/observability/audit-chain.ts",
    "src/lib/security/sanitize-output.ts",
    "src/lib/workspace.ts",
    "docs/SECURITY.md",
  ],
  "17-developer-workflow": ["cli/index.ts", "src/lib/workspace.ts", "src/lib/gateway.ts", "README.md"],
  "L1-show-hn-demo": ["src/lib/policy.ts", "src/lib/security/detector.ts", "src/lib/gateway.ts", "README.md"],
  "L2-product-hunt": ["README.md", "src/lib/tool-registry.ts"],
  "L3-github-banner": ["README.md"],
  "R1-reel-redaction": ["src/lib/security/sanitize-output.ts", "src/lib/security/detector.ts"],
  "R2-reel-denied-call": ["src/lib/policy.ts", "src/lib/gateway.ts"],
  "R3-reel-detection": ["src/lib/security/secret-patterns.ts", "src/lib/security/detector.ts"],
};

/**
 * Claims that appear on screen as literal numbers. If one of these moves, every
 * video that states it is not merely stale — it is WRONG, and that is a harder
 * failure than a dated screenshot.
 */
const NUMERIC_CLAIMS = [
  { id: "patterns", label: "detection patterns", get: countPatterns, videos: ["01", "04", "L1", "R3"] },
  { id: "tools", label: "MCP tools", get: countTools, videos: ["06", "08", "02"] },
  { id: "hardDeny", label: "hard-denied tools", get: countHardDeny, videos: ["01", "06", "07", "L1", "16"] },
  { id: "alertRules", label: "alert rules", get: countAlertRules, videos: ["15", "16"] },
  { id: "cliCommands", label: "CLI commands", get: countCliCommands, videos: ["12", "01"] },
];

function read(p) {
  try { return readFileSync(p, "utf8"); } catch { return ""; }
}
function countPatterns() {
  return (read("src/lib/security/secret-patterns.ts").match(/^\s*P\(/gm) || []).length;
}
function countTools() {
  const m = read("src/lib/tool-registry.ts");
  return (m.match(/name:\s*"[a-z]+\.[a-z.]+"/g) || []).length;
}
function countHardDeny() {
  const s = read("src/lib/policy.ts");
  const block = s.slice(s.indexOf("HARD_DENY"), s.indexOf("}", s.indexOf("HARD_DENY")));
  return (block.match(/"[a-z]+\.[a-z.]+":/g) || []).length;
}
function countAlertRules() {
  return (read("src/lib/observability/alerts.ts").match(/^\s{2}\{\s*$/gm) || []).length;
}
function countCliCommands() {
  return (read("cli/index.ts").match(/\.command\("/g) || []).length;
}

function git(cmd) {
  try { return execSync(`git ${cmd}`, { encoding: "utf8" }).trim(); } catch { return ""; }
}

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return null; }
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const head = git("rev-parse HEAD");
  const state = loadState();

  const claims = {};
  for (const c of NUMERIC_CLAIMS) claims[c.id] = c.get();

  if (args.includes("--mark")) {
    writeFileSync(
      STATE_FILE,
      JSON.stringify({ commit: head, markedAt: new Date().toISOString(), claims }, null, 2) + "\n"
    );
    console.log(`[video-sync] marked ${head.slice(0, 7)} as synced`);
    for (const c of NUMERIC_CLAIMS) console.log(`  ${c.label}: ${claims[c.id]}`);
    return;
  }

  if (!state) {
    console.log("[video-sync] no sync state yet — run with --mark once the current videos are correct.");
    console.log("[video-sync] current claim values:");
    for (const c of NUMERIC_CLAIMS) console.log(`  ${c.label}: ${claims[c.id]}`);
    process.exit(0);
  }

  const changed = git(`diff --name-only ${state.commit} HEAD`).split("\n").filter(Boolean);

  // Which videos have a dependency among the changed paths?
  const stale = [];
  for (const [video, deps] of Object.entries(DEPENDENCIES)) {
    const hits = changed.filter((f) => deps.some((d) => f === d || f.startsWith(d.endsWith("/") ? d : d + "/")));
    if (hits.length) stale.push({ video, because: hits });
  }

  // Which on-screen numbers actually moved? This is the serious category.
  const wrong = [];
  for (const c of NUMERIC_CLAIMS) {
    const before = state.claims?.[c.id];
    if (before !== undefined && before !== claims[c.id]) {
      wrong.push({ claim: c.label, from: before, to: claims[c.id], videos: c.videos });
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ since: state.commit, head, changedFiles: changed.length, stale, wrong }, null, 2));
    process.exit(wrong.length ? 1 : 0);
  }

  console.log(`[video-sync] comparing ${state.commit.slice(0, 7)}..${head.slice(0, 7)} — ${changed.length} files changed\n`);

  if (wrong.length) {
    console.log("WRONG ON SCREEN — a stated number changed. Re-record, do not just re-render:\n");
    for (const w of wrong) {
      console.log(`  ${w.claim}: ${w.from} -> ${w.to}`);
      console.log(`    affects: ${w.videos.join(", ")}`);
    }
    console.log("");
    console.log("  Also update docs/videos/FACTS.md — scripts are written against it.\n");
  }

  if (stale.length) {
    console.log("STALE — inputs changed, review whether the video still matches:\n");
    for (const s of stale) {
      console.log(`  ${s.video}`);
      for (const f of s.because.slice(0, 4)) console.log(`    ${f}`);
      if (s.because.length > 4) console.log(`    …and ${s.because.length - 4} more`);
    }
    console.log("");
  }

  if (!stale.length && !wrong.length) {
    console.log("Nothing stale. No video needs re-recording or re-rendering.\n");
  }

  const untouched = Object.keys(DEPENDENCIES).filter((v) => !stale.some((s) => s.video === v));
  console.log(`Unaffected (do not re-render): ${untouched.length}/${Object.keys(DEPENDENCIES).length}`);

  process.exit(wrong.length ? 1 : 0);
}

main();
