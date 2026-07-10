# ShadowPaste for VS Code

A VS Code extension that connects your editor to the ShadowPaste backend
(`http://localhost:3000` by default). Three commands:

1. **ShadowPaste: Scan Workspace for Secrets** — scans every open workspace
   text document **locally** using the same detector as the backend
   (`src/detector.ts` is a byte-for-byte port of
   `src/lib/security/detector.ts`), applies the same trust-score + grade
   formula (`src/lib/scanner.ts::computeTrustScore` + `scoreToGrade`), and
   renders the findings in a Webview panel. The V20 backend's `/api/scan`
   is GitHub-specific (`scanGitHubRepo` calls `api.github.com/repos/${owner}/${name}`),
   so the extension scans the workspace locally rather than posting a
   non-existent `vscode-workspace` repo to GitHub.
2. **ShadowPaste: Protect Secrets in Active Document** — runs the **same**
   detector regex as the backend (`src/detector.ts` is a byte-for-byte port
   of `src/lib/security/detector.ts`), replaces each secret with a
   `{{SHADOW_SECRET_<PROVIDER>_<ID>}}` reference, and `POST`s each raw
   secret to `/api/vault` for AES-GCM encrypted at-rest storage.
3. **ShadowPaste: Show MCP Config (Claude Desktop / Cursor)** —
   `GET /api/mcp-config` and shows the JSON config in an untitled editor or
   copies it to the clipboard.

## Why a local copy of the detector?

The Phase 1 invariant is "the same secret behaves the same everywhere."
The backend's `@shadowpaste/security` barrel can't be imported directly
here (the extension runs in VS Code's Node host, not Next.js's bundler),
so `src/detector.ts` is a **byte-identical** copy of the
`SELF_CONTAINED` + `ASSIGNMENT` patterns from
`src/lib/security/detector.ts`. When the backend patterns change, update
both files together.

## Configuration

Open **Settings → Extensions → ShadowPaste** or edit `.vscode/settings.json`:

```jsonc
{
  "shadowpaste.serverUrl": "http://localhost:3000", // base URL — never hardcoded in fetches
  "shadowpaste.apiKey": ""                          // optional eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadowJQOeUMF_oh_Kz0VrgrGWpsm6XuQdBXLno4UVyNAYjR4zLGUEqkMtPwZRJ1Jc
}
```

The extension makes outbound HTTP calls to the configured `serverUrl`
under the relative paths `/api/vault` (POST) and `/api/mcp-config` (GET).
Workspace scanning is performed locally with the detector port — no
`/api/scan` round-trip. The default `serverUrl` matches the local dev
server (`bun run dev`).

## Build (scaffold only — do NOT npm install in this repo)

This folder ships only the source. To compile it locally:

```bash
cd extensions/vscode
npm install            # installs @types/vscode, @types/node, typescript
npm run compile        # tsc -p .  →  out/extension.js
```

Then **F5** in VS Code (or `vsce package`) to load the extension. See
<https://code.visualstudio.shadow-BUkc4YvvTGaPVek5ku8nWvi5AA6zeSuGu> for
the full workflow.

## Files

| File | Role |
|------|------|
| `package.json` | VS Code manifest: `engines.vscode`, `activationEvents`, `contributes.commands` (3), `contributes.configuration` (`serverUrl`, `apiKey`). |
| `src/extension.ts` | Command implementations + Webview + diagnostics. |
| `src/detector.ts` | Local copy of the `@shadowpaste/security` detector (must stay in sync with `src/lib/security/detector.ts`). |
| `tsconfig.json` | Strict TS config targeting `ES2020` / CommonJS / `out/`. |

## Permissions / network

The extension only makes outbound HTTP requests to the configured
`shadowpaste.serverUrl`. No telemetry, no third-party endpoints.
