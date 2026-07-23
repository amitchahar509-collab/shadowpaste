// Post-build asset copy for `output: "standalone"`.
//
// Next's standalone bundle deliberately excludes .next/static and public/ —
// they must be copied in beside server.js. This used to be a shell one-liner
// (`cp -r ...`), which fails on Windows: Bun's builtin shell rejects `cp -r`
// ("illegal option -- r") and cmd.exe has no `cp` at all. fs.cpSync is portable.
//
// It also resolves server.js rather than assuming .next/standalone/server.js,
// so a mis-inferred file-tracing root produces a clear error instead of a
// bundle that is missing every stylesheet and image at runtime.

import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("  ✗ .next/standalone not found — did `next build` run with output: \"standalone\"?");
  process.exit(1);
}

// Breadth-first search for server.js (normally at the top level).
function findServer(dir, depth = 0) {
  if (depth > 6) return null;
  if (existsSync(path.join(dir, "server.js"))) return dir;
  for (const entry of readdirSync(dir)) {
    const child = path.join(dir, entry);
    if (entry === "node_modules" || !statSync(child).isDirectory()) continue;
    const found = findServer(child, depth + 1);
    if (found) return found;
  }
  return null;
}

const appDir = findServer(standalone);
if (!appDir) {
  console.error("  ✗ No server.js found under .next/standalone.");
  process.exit(1);
}

if (path.resolve(appDir) !== path.resolve(standalone)) {
  console.warn(`  ! standalone output is nested at ${path.relative(root, appDir)}`);
  console.warn("    (check outputFileTracingRoot in next.config.ts)");
}

const copies = [
  [path.join(root, ".next", "static"), path.join(appDir, ".next", "static")],
  [path.join(root, "public"), path.join(appDir, "public")],
];

for (const [from, to] of copies) {
  if (!existsSync(from)) continue;
  cpSync(from, to, { recursive: true });
  console.log(`  ✓ ${path.relative(root, from)} → ${path.relative(root, to)}`);
}

console.log(`  ✓ standalone server ready: ${path.relative(root, path.join(appDir, "server.js"))}`);
