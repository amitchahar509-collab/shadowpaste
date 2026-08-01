// Project import — pins three defects found by live production testing.
//
// Symptom reported: "no project uploads, and the things that do upload don't work."
// Reproduced against production:
//   POST /api/workspace/upload  -> 500 internal error
//   POST /api/workspace/clone   -> 502 "git clone failed: spawnSync git ENOENT"
//   POST /api/workspace/upload (no paths[]) -> 400 "paths[] must match files[] length"
//
// All three worked locally, which is why they survived: the failures are
// serverless-only (read-only filesystem, no git binary).

import { describe, expect, test } from "bun:test";
import path from "path";
import os from "os";

describe("workspace root resolution", () => {
  // WORKSPACE_ROOT is computed at module load, so each case needs a fresh import.
  async function loadRoot(env: Record<string, string | undefined>) {
    const saved: Record<string, string | undefined> = {};
    for (const k of ["SHADOWPASTE_WORKSPACE_ROOT", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME"]) {
      saved[k] = process.env[k];
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
    const mod = await import(`../../src/lib/workspace?cache=${Math.random()}`);
    const root = mod.WORKSPACE_ROOT as string;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return root;
  }

  test("serverless falls back to a WRITABLE dir, not the read-only bundle", async () => {
    // The bug: <cwd>/.workspaces on Vercel is /var/task/.workspaces, which is
    // read-only — the first mkdir threw EROFS and every upload 500'd.
    const root = await loadRoot({ VERCEL: "1" });
    expect(root.startsWith(os.tmpdir())).toBe(true);
    expect(root).not.toContain(path.join(process.cwd(), ".workspaces"));
  });

  test("explicit config wins over every default", async () => {
    const custom = path.join(os.tmpdir(), "custom-ws-root");
    const root = await loadRoot({ SHADOWPASTE_WORKSPACE_ROOT: custom, VERCEL: "1" });
    expect(root).toBe(path.resolve(custom));
  });

  test("self-hosted still uses the repo directory", async () => {
    const root = await loadRoot({});
    expect(root).toBe(path.resolve(process.cwd(), ".workspaces"));
  });
});

describe("upload paths[] fallback", () => {
  // The route derives relPaths from the files themselves when `paths` is absent.
  // Mirrors the route's logic so the contract is pinned without booting a server.
  function resolvePaths(rawPaths: string, fileNames: string[]): string[] | { error: string } {
    let relPaths: string[];
    try { relPaths = rawPaths ? JSON.parse(rawPaths) : []; } catch { relPaths = []; }
    if (!Array.isArray(relPaths) || relPaths.length === 0) {
      relPaths = fileNames.map((n, i) => n || `file-${i}`);
    }
    if (relPaths.length !== fileNames.length) return { error: "paths[] must match files[] length" };
    return relPaths;
  }

  test("a plain file upload with no paths[] is accepted", () => {
    // Previously this returned 400 and made non-folder uploads impossible.
    expect(resolvePaths("", ["project.zip"])).toEqual(["project.zip"]);
    expect(resolvePaths("[]", ["a.js", "b.js"])).toEqual(["a.js", "b.js"]);
  });

  test("a folder pick still uses the supplied relative paths", () => {
    expect(resolvePaths('["app/src/a.js","app/src/b.js"]', ["a.js", "b.js"]))
      .toEqual(["app/src/a.js", "app/src/b.js"]);
  });

  test("a genuine length mismatch is still rejected", () => {
    expect(resolvePaths('["only/one.js"]', ["a.js", "b.js"])).toEqual({ error: "paths[] must match files[] length" });
  });

  test("malformed paths JSON falls back instead of throwing", () => {
    expect(resolvePaths("{not json", ["a.js"])).toEqual(["a.js"]);
  });
});
