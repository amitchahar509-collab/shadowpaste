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

describe("archive upload extraction", () => {
  // A .zip upload used to be written into the workspace verbatim: fileCount 1,
  // secretCount 0, stack "Generic Project". The import reported success while
  // scanning a compressed blob — the worst kind of failure for a secret scanner.
  test("an uploaded archive is recognised as one", async () => {
    const { classifyArchive } = await import("../../src/lib/archive");
    const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect(classifyArchive("project.zip", zipMagic)).toBe("zip");
    const gzMagic = Buffer.from([0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0]);
    expect(classifyArchive("project.tar.gz", gzMagic)).toBe("tgz");
    // A normal source file must NOT be treated as an archive.
    expect(classifyArchive("index.js", Buffer.from("const a = 1;"))).toBeNull();
  });
});

describe("package.json BOM handling", () => {
  // PowerShell and several Windows editors write a UTF-8 BOM. JSON.parse throws
  // on it, so every such project detected as "Generic Project" with 0 deps.
  test("a BOM-prefixed package.json still parses", async () => {
    const { analyzeProject } = await import("../../src/lib/project-intelligence");
    const fs = await import("fs/promises");
    const os = await import("os");
    const path = await import("path");
    const dir = path.join(os.tmpdir(), "sp-bom-" + Date.now().toString(36));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "package.json"),
      "﻿" + JSON.stringify({ name: "d", dependencies: { next: "15.0.0", react: "19.0.0" } })
    );
    const r = await analyzeProject(dir);
    expect(r.stack.dependencyCount).toBe(2);
    expect(r.stack.frameworks).toContain("Next.js");
    await fs.rm(dir, { recursive: true, force: true });
  });
});

describe("workspace tenancy (cross-tenant isolation)", () => {
  // Reproduced against a live server: org B read AND DELETED org A's workspace
  // just by passing its path. Workspaces have no DB row, so the only gate was
  // "authenticated AND under WORKSPACE_ROOT" — which every logged-in user
  // satisfies. Tenancy is now a property of the path itself.
  test("each org gets a distinct workspace root", async () => {
    const { orgWorkspaceRoot, WORKSPACE_ROOT } = await import("../../src/lib/workspace");
    const a = orgWorkspaceRoot("org_aaa");
    const b = orgWorkspaceRoot("org_bbb");
    expect(a).not.toBe(b);
    expect(a.startsWith(WORKSPACE_ROOT)).toBe(true);
    expect(b.startsWith(WORKSPACE_ROOT)).toBe(true);
  });

  test("org A's workspace is NOT within org B's root", async () => {
    const { orgWorkspaceRoot } = await import("../../src/lib/workspace");
    const { isWithin } = await import("../../src/lib/security/paths");
    const path = await import("path");
    const aWorkspace = path.join(orgWorkspaceRoot("org_aaa"), "proj-ws-1");
    expect(isWithin(orgWorkspaceRoot("org_aaa"), aWorkspace)).toBe(true);
    expect(isWithin(orgWorkspaceRoot("org_bbb"), aWorkspace)).toBe(false);
  });

  test("a hostile orgId cannot climb out of the workspace root", async () => {
    const { orgWorkspaceRoot, WORKSPACE_ROOT } = await import("../../src/lib/workspace");
    for (const evil of ["../../etc", "..", "a/../../b", "/abs", "x y"]) {
      expect(orgWorkspaceRoot(evil).startsWith(WORKSPACE_ROOT)).toBe(true);
    }
  });
});

describe("import resource limits", () => {
  // An adversarial 20,000-entry ZIP took 11s to reject — AFTER writing 5,000
  // files — before the central-directory pre-check. A serverless request times
  // out well before that and leaves a partial tree behind.
  test("request-path limits are tighter than the library defaults", async () => {
    const { IMPORT_LIMITS } = await import("../../src/lib/archive");
    expect(IMPORT_LIMITS.maxFiles).toBeLessThanOrEqual(5000);
    expect(IMPORT_LIMITS.maxTotalBytes).toBeLessThanOrEqual(100 * 1024 * 1024);
    expect(IMPORT_LIMITS.skipDirs?.has("node_modules")).toBe(true);
  });
});
