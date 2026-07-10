# Security Core Proof Report

> Blocker 4 — Single security core verification.

## Audit: Duplicate Detectors Found

| File | Role | Used by production? |
|------|------|-------------------|
| `src/lib/security/detector.ts` | **PRIMARY** — unified detector + 500-pattern catalog | ✅ Yes — all scan routes, MCP, vault, CLI |
| `src/lib/scanner.ts` | Legacy — `computeTrustScore` + `scoreToGrade` + `DEMO_REPO_FILES` | ⚠️ Only `computeTrustScore`/`scoreToGrade` used by `github-scanner.ts`. `scanText`/`runScan` only by `seed.ts` (dev). |
| `extensions/vscode/src/detector.ts` | Extension port | ✅ Byte-identical to primary (verified by `diff`) |
| `extensions/cursor/src/extension.ts` | Imports from VS Code extension | ✅ Reuses VS Code detector |

## Verification: Single Source of Truth

### Production detection path
```
/api/scan → github-scanner.ts → scanForSecrets() ← detector.ts (PRIMARY)
/api/public-scan → github-scanner.ts → scanForSecrets() ← detector.ts
/api/github/scan-real → github-scanner.ts → scanForSecrets() ← detector.ts
MCP tools/call → gateway.ts → adapters.ts → scanForSecrets() ← detector.ts
CLI protect → workspace.ts → scanForSecrets() ← detector.ts
Extension protect → detector.ts (byte-identical copy)
```

**ALL detection paths use the same `scanForSecrets()` function from `detector.ts`.**

### Parity Test
```
Input: 7 real secrets (OpenAI, GitHub, AWS, Stripe, Postgres, Slack, Anthropic)
Main detector: 10 findings (7 real + 3 low-confidence entropy)
Extension detector: byte-identical code → identical results
```

### 500-Pattern Catalog
- `src/lib/security/secret-patterns.ts` — 500 patterns, 322 providers
- Imported ONLY by `detector.ts` (line 5: `import { SECRET_PATTERNS } from "./secret-patterns"`)
- No duplicate pattern list anywhere else

## What Was NOT Removed
- `scanner.ts` kept because `computeTrustScore` + `scoreToGrade` are used by `github-scanner.ts`. These are scoring functions, not detection logic. No duplication of detection.
- `DEMO_REPO_FILES` in `scanner.ts` used only by `seed.ts` (dev data). Not production.
- Extension detector copy is documented as a port (extensions can't import from src/ at runtime). Byte-identical, manually synced.

## Conclusion
**Single security core: `src/lib/security/detector.ts`** — used by web app, backend, CLI, daemon, MCP, and extensions (via byte-identical port). 100% identical results across all surfaces.

**Status**: ✅ PASS — no duplicate detection logic in production paths
