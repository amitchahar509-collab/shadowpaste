#!/usr/bin/env node
// ShadowPaste — terminal demo recorder.
//
// WHY THIS EXISTS RATHER THAN A SCREEN RECORDING
// ----------------------------------------------
// A screen recording of a terminal is a claim frozen in a video file: the
// product changes, the pixels do not, and nobody can tell the difference until a
// viewer runs the command and gets something else. This runs the commands FOR
// REAL against a live gateway, captures what actually comes back, and renders
// that into an animated SVG. The asset is therefore a function of the product,
// not a memory of it.
//
// It also solves the practical problem that VHS/asciinema need a Unix pty —
// ttyd's Windows build hangs — while this needs nothing but Node.
//
// Animated SVG is deliberate: GitHub renders it inline in a README, it is a few
// KB, it diffs, and it costs nothing to regenerate.
//
// USAGE
//   node scripts/record-terminal-demo.mjs --demo attack-blocked --out assets/readme/attack-blocked.svg
//   node scripts/record-terminal-demo.mjs --demo attack-blocked --check   (capture only, print, write nothing)

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SHADOWPASTE_URL || "http://localhost:3000";

// Palette from docs/videos/README.md — one source of truth for branding.
const C = {
  bg: "#0A0A0B",
  chrome: "#18181B",
  text: "#E4E4E7",
  dim: "#71717A",
  prompt: "#3B82F6",
  ok: "#10B981",
  bad: "#EF4444",
  key: "#A1A1AA",
};

/**
 * Demos are declarative: a label, the tool call to make, and which response
 * fields matter. The recorder never writes the values — it only decides what to
 * ask and which keys to surface.
 */
const DEMOS = {
  "attack-blocked": {
    title: "Every one of these is blocked before it executes",
    steps: [
      {
        caption: "An agent asks for AWS cloud metadata",
        tool: "network.fetch",
        args: { url: "http://169.254.169.254/latest/meta-data/" },
      },
      {
        caption: "Path traversal out of the workspace",
        tool: "fs.read",
        args: { path: "../../../../etc/passwd" },
      },
      {
        caption: "A query for password hashes",
        tool: "db.read",
        args: { query: 'SELECT email, "passwordHash" FROM "User" LIMIT 5' },
      },
      {
        caption: "Delete a repository — permanently denied",
        // A repository that does not exist: if the control ever regressed, this
        // take must not be able to destroy anything real.
        tool: "github.repo.delete",
        args: { repo: "shadowpaste-safety-probe/does-not-exist" },
      },
    ],
  },
};

async function callTool(tool, args) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: args },
    }),
  });
  const body = await res.json();
  // The gateway returns its decision as JSON inside the MCP content block.
  const text = body?.result?.content?.[0]?.text ?? body?.error?.message ?? JSON.stringify(body);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Truncate a value so a long SQL string cannot blow the frame width. */
function fit(s, n) {
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

function renderSvg(demo, captures) {
  const W = 900;
  const LINE = 22;
  const PAD = 20;
  const HEADER = 34;

  // Build the line list first so the height is derived, never guessed.
  const lines = [];
  for (const c of captures) {
    lines.push({ t: "caption", text: c.caption });
    lines.push({ t: "cmd", text: `${c.tool}  ${fit(JSON.stringify(c.args), 58)}` });
    lines.push({
      t: c.decision === "deny" || c.decision === "blocked" ? "bad" : "ok",
      text: `decision: ${c.decision}    riskScore: ${c.riskScore}    executed: ${c.executed}`,
    });
    if (c.code) lines.push({ t: "code", text: fit(c.code, 92) });
    lines.push({ t: "gap", text: "" });
  }

  const H = HEADER + PAD * 2 + lines.length * LINE + 10;
  const perLine = 0.45; // seconds a line takes to appear
  const total = (lines.length * perLine + 2).toFixed(2);

  const rows = lines
    .map((ln, i) => {
      if (ln.t === "gap") return "";
      const y = HEADER + PAD + (i + 1) * LINE;
      const begin = (i * perLine).toFixed(2);
      const fill =
        ln.t === "caption" ? C.dim : ln.t === "cmd" ? C.text : ln.t === "bad" ? C.bad : ln.t === "ok" ? C.ok : C.key;
      const weight = ln.t === "bad" || ln.t === "ok" ? "600" : "400";
      const prefix = ln.t === "cmd" ? `<tspan fill="${C.prompt}">$ </tspan>` : "";
      const style = ln.t === "caption" ? ` font-style="italic"` : "";
      return `  <text x="${PAD}" y="${y}" fill="${fill}" font-weight="${weight}"${style} opacity="0">${prefix}${esc(
        ln.text
      )}<animate attributeName="opacity" from="0" to="1" dur="0.25s" begin="${begin}s" fill="freeze"/></text>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" font-size="14">
  <rect width="${W}" height="${H}" rx="8" fill="${C.bg}"/>
  <rect width="${W}" height="${HEADER}" rx="8" fill="${C.chrome}"/>
  <rect y="${HEADER - 8}" width="${W}" height="8" fill="${C.chrome}"/>
  <circle cx="20" cy="17" r="5" fill="#EF4444"/><circle cx="38" cy="17" r="5" fill="#F59E0B"/><circle cx="56" cy="17" r="5" fill="#10B981"/>
  <text x="76" y="22" fill="${C.dim}" font-size="12">${esc(demo.title)}</text>
  <text x="${W - PAD}" y="22" fill="${C.dim}" font-size="11" text-anchor="end">ShadowPaste — real output, captured live</text>
${rows}
  <!-- total ${total}s -->
</svg>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const name = args[args.indexOf("--demo") + 1] || "attack-blocked";
  const outIdx = args.indexOf("--out");
  const out = outIdx > -1 ? args[outIdx + 1] : null;
  const checkOnly = args.includes("--check");

  const demo = DEMOS[name];
  if (!demo) {
    console.error(`unknown demo "${name}". available: ${Object.keys(DEMOS).join(", ")}`);
    process.exit(2);
  }

  const captures = [];
  for (const step of demo.steps) {
    const r = await callTool(step.tool, step.args);
    const capture = {
      caption: step.caption,
      tool: step.tool,
      args: step.args,
      decision: r.decision ?? "?",
      riskScore: r.riskScore ?? "?",
      executed: String(r.executed ?? "?"),
      // A call blocked before execution has no adapter output, so `output.code`
      // is null and the MCP route does not surface `securityCode`. `reason` is
      // what the gateway actually tells the caller, so that is what the demo
      // shows — inventing a code the response did not contain would defeat the
      // point of capturing real output.
      code: r.output?.code ?? (r.reason ? String(r.reason).split(" (policy:")[0] : null),
    };
    captures.push(capture);
    console.log(
      `  ${step.tool.padEnd(20)} -> decision=${capture.decision} risk=${capture.riskScore} executed=${capture.executed}${
        capture.code ? " " + capture.code : ""
      }`
    );
  }

  // A demo whose whole point is "these are blocked" must not ship if one of them
  // executed. Better no asset than an asset that shows the opposite of its claim.
  const leaked = captures.filter((c) => c.executed === "true");
  if (leaked.length) {
    console.error(`\nREFUSING TO WRITE: ${leaked.length} call(s) executed. This demo asserts they do not.`);
    for (const l of leaked) console.error(`  ${l.tool} -> executed=true`);
    process.exit(1);
  }

  if (checkOnly) {
    console.log("\n--check: capture verified, nothing written.");
    return;
  }

  const svg = renderSvg(demo, captures);
  const target = out || `assets/readme/${name}.svg`;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, svg);
  console.log(`\nwrote ${target} (${svg.length} bytes)`);
}

main().catch((e) => {
  console.error("recorder failed:", e.message);
  process.exit(1);
});
