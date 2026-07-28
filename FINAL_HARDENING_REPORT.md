# ShadowPaste — Final Production Hardening Report

**Date:** 2026-07-26 · **Scope:** bug discovery, MCP audit/rebuild, tool completion,
AI-client compatibility, deployment prep, security re-verification, release checklist.

> Every claim below is backed by a command that was executed and its output.
> Anything not executed is marked **NOT_VERIFIED**. Anything blocked on an outside
> account or resource is marked **EXTERNAL_DEPENDENCY_REQUIRED**. Nothing is faked.

---

## 0. Correction to the previous pass (important)

The previous report claimed the CI failure was caused solely by the SQLite
`DATABASE_URL`, and marked the repair "verified locally". **That diagnosis was
incomplete.** Querying the real GitHub Actions history this pass showed the run for
that very fix (`af1b836`) still **failed**, with GitHub reporting *"This run likely
failed because of a workflow file issue."*

The true root cause: `.github/workflows/ci.yml` was **invalid YAML** — the
`Verify standalone output` step used an inline scalar containing `": "` inside an
echo string, which YAML parses as a nested mapping. The workflow never parsed, so
**no job ever executed**. The `DATABASE_URL` repair was necessary but not sufficient.

Lesson applied: local `prisma validate` proved the *inputs* were right but could not
prove the *workflow* was runnable. Both are now verified — the YAML parses (5 jobs)
and a real run was triggered and observed.

---

## 1. Bugs discovered and fixed this pass — 6

| # | Severity | Bug | Root cause | Files | Fix | Evidence |
|---|---|---|---|---|---|---|
| 0 | **Critical** | CI workflow was unparseable YAML → **no job had ever run** | `Verify standalone output` used an inline scalar containing `": "`, read by YAML as a nested mapping | `.github/workflows/ci.yml` | Converted to a block scalar and removed the ambiguous `:` from the echo text | `yaml.safe_load` now parses; 5 jobs enumerated; a real run was triggered and reached `in_progress` (previously it died at parse) |
| A | **High** | MCP `initialize` ignored the client's requested protocol version, always answering `2024-11-05` | Hardcoded `MCP_PROTOCOL_VERSION` in the `initialize` result | `src/lib/mcp/server.ts` | Added `negotiateProtocolVersion()` + `SUPPORTED_PROTOCOL_VERSIONS` (`2025-06-18`, `2025-03-26`, `2024-11-05`); echo the client's version when supported, newest when not, baseline when absent | Live: client `2025-06-18`→`2025-06-18`, `2025-03-26`→`2025-03-26`, `2099-01-01`→`2025-06-18`, none→`2024-11-05` |
| B | Medium | The 3 `shadowpaste.*` tools had no risk-engine entry, so the engine used the generic default (15) while `tools/list` advertised 10/5/5 | Missing `TOOL_RISK` entries; prefix lookup fell through | `src/lib/risk.ts` | Added explicit entries matching the registry | Programmatic diff over all 28: `NO DRIFT` |
| C | Low | `/api/health` reported `version: "20.0.0"` while `package.json` and the MCP handshake both said `1.0.0` | Stale internal phase number | `src/app/api/health/route.ts` | Report `1.0.0` | Live `/api/health` |
| D | Medium | 14 environment variables were read by code but undocumented — including every AI provider key, making the AI feature undiscoverable | `.env.example` not updated as features landed | `.env.example` | Documented AI keys, `AI_PROVIDER_ORDER`, `NETWORK_ALLOWED_HOSTS`, Stripe price IDs, `STRIPE_ALLOW_LIVE`, `SEED_TOKEN`, aliases | `comm` diff of used-vs-documented is now empty |
| E | Medium | README Quick Start (`cp .env.example .env && bun run db:push`) fails for a new user since the SQLite→PostgreSQL migration | Onboarding docs not updated with the provider change | `README.md` | Quick Start now starts Postgres (`docker compose up -d db`) or points `DATABASE_URL` at a hosted one; added Configuration + Deployment sections | Claims verified against the actual files |

**Not a bug (investigated, correctly left alone):** during the previous pass all
`/api/auth/*` routes returned 404. Traced to a corrupted 408 MB Next.js dev cache —
after `rm -rf .next`, signup returned 200. **No code was changed.** Likewise a
production signup 500 was confirmed to be the intentional `AUTH_PEPPER` guard;
with a pepper supplied it returns 200.

---

## 2. MCP audit (Phase 2) — no rebuild required

Audited JSON-RPC handling, registry, dispatcher, schemas, metadata, risk/policy
integration, credential resolution and audit logging. The architecture is sound; the
defects were **metadata drift and protocol negotiation**, both fixed in place. A
rewrite would have added risk without benefit, so none was performed.

Verified: `initialize` / `initialized` / `ping` / `tools/list` / `tools/call`,
`-32700` on malformed JSON, `-32601` on unknown method, `-32602` on invalid params,
`tools/list` = 28 tools with valid JSON Schema and a `required[]` array derived from
the same source of truth as the runtime validator.

---

## 3. Tool inventory — 28 total

**Implemented with a real adapter: 20** (was 17)

Newly completed this pass:
- **`shell.read`** — strict allowlist of exact binary+argument pairs, `execFile`
  with an argv array (**no shell**, so metacharacter injection is impossible), cwd
  pinned inside `.workspace/`, 10 s timeout, 64 KB output cap.
- **`github.admin`** — bounded allowlist of six **read-only** administrative queries;
  anything else is refused and the supported list is returned.
- **`stripe.customer.delete`** — real `DELETE /v1/customers/{id}`, test-key enforced
  (a live key is refused unless `STRIPE_ALLOW_LIVE=true`).

**Intentionally unavailable: 8** — each returns a distinct, documented structured
error; none returns the generic `NOT_IMPLEMENTED`:

| Tool | Code | Why (honest) |
|---|---|---|
| `fs.execute`, `github.repo.delete`, `db.schema.drop`, `db.export`, `stripe.charge` | `POLICY_DENIED` | Permanently denied by global policy — they never reach an adapter |
| `shell.exec` | `SANDBOX_REQUIRED` | Arbitrary execution needs container/cgroup isolation (memory/CPU/PID caps) this runtime cannot provide → **EXTERNAL_DEPENDENCY_REQUIRED** |
| `ai.train` | `PROVIDER_NOT_CONFIGURED` | No training-job pipeline exists → **EXTERNAL_DEPENDENCY_REQUIRED** |
| `db.migrate` | `MIGRATION_RUNNER_UNAVAILABLE` | Migrations belong to the deploy pipeline, not a runtime MCP call (deliberate design) |

**Live sweep across all 28: zero `NOT_IMPLEMENTED`.**

---

## 4. AI client compatibility (Phase 4)

Protocol negotiation now works for Claude connectors (`2025-06-18`), the
Cursor/ChatGPT era (`2025-03-26`) and the original (`2024-11-05`), plus both
transports (`Streamable HTTP` and `HTTP+SSE`), permissive CORS, and token auth via
header **or** query parameter for clients that cannot set headers.

**NOT_VERIFIED:** live handshakes with the actual ChatGPT, Gemini, Codex, Cursor,
Windsurf and VS Code MCP clients. None of those hosts can be run here. What *is*
verified is standards conformance, which is what those clients consume.

---

## 5. Deployment (Phase 5) — EXTERNAL_DEPENDENCY_REQUIRED

**The application was NOT deployed. I will not claim otherwise.**

Checked for credentials and tooling; all absent:
`RENDER_API_KEY`, `RENDER_SERVICE_ID`, `FLY_API_TOKEN`, `VERCEL_TOKEN`,
`RAILWAY_TOKEN` — unset. `render`, `fly`, `vercel` CLIs — not installed.

Configuration **is** complete and validated: `render.yaml` (1 web service, Docker
runtime, `healthCheckPath: /api/health`, `preDeployCommand` running
`prisma db push`, `autoDeploy: true`, managed Postgres, auto-generated secrets),
plus `Dockerfile`, `docker-compose.yml`, `vercel.json`, `Caddyfile`, `.env.example`.

**To deploy, an operator must:** connect the repo as a Render Blueprint (or supply a
`RENDER_API_KEY`), then set `NEXT_PUBLIC_APP_URL` to the assigned URL.

---

## 6. Security results (Phase 6)

| Control | Result | Evidence |
|---|---|---|
| Command injection (new `shell.read`) | ✅ PASS | 8/8 injection vectors rejected (`;`, `&&`, `\|`, backticks, `$()`, path escape, `rm -rf`, `node -e`) |
| Shell allowlist | ✅ PASS | `git push` refused; `node --version` executed (`v24.18.0`) |
| Admin surface bounding | ✅ PASS | unsupported action refused with supported list |
| Prompt injection | see §7 | re-run this pass |
| Tenant isolation / replay / rate limit / billing | see §7 | re-run this pass |
| SSRF, SQL validation, traversal, secret leakage | ✅ PASS | unit + integration suites |
| Metadata integrity | ✅ PASS | 0 drift across 28 tools |

---

## 7. Test summary

Unit tier (no server): **119 assertions, 0 failures** —
`mcp-adapters-unit` 36/36 · `mcp-schema-validation` 49/49 · `ai-provider-unit` 9/9 ·
`mcp-hardening-unit` 25/25 (new) · `load-secret-detector` PASS.

Integration: `mcp-adapters-integration` 14/14 (now asserts 20/28 implemented) ·
`mcp-client-integration` PASS.

Attack battery re-run results are recorded in §Attack Battery below.

`tsc` both projects: **0 errors** · `eslint src/ tests/`: **0 problems**.

---

## 8. Remaining work

**BUG:** none known and unfixed.

**TECHNICAL_DEBT**
- `src/middleware.ts` uses the convention Next 16 deprecates in favour of `proxy.ts`
  (warning only; renaming carries regression risk and was not attempted).
- No structured logging, metrics or tracing (raw `console.*`).
- No separate readiness/liveness probes (single `/api/health`).
- Flight Recorder exists but its wiring into every mutation path is **NOT_VERIFIED**.
- `load-mcp-calls.ts` (load test) patched but not executed.

**EXTERNAL_DEPENDENCY_REQUIRED**
1. GitHub OAuth App + 2. Google OAuth App — real federated login (`/oauth/*` are stubs)
3. `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` — live AI generation
4. Stripe test key — live refund/customer-delete round-trips
5. GitHub test org + fine-grained PAT — live GitHub adapter round-trips
6. Linux container runtime (cgroups) — `shell.exec` resource limits
7. Render/Fly account or API key — deployment
8. Deployed HTTPS instance — representative load testing

**NOT_VERIFIED**
- Live handshakes with specific third-party MCP clients (ChatGPT, Gemini, Codex,
  Cursor, Windsurf, VS Code MCP) — those hosts cannot be run here. Standards
  conformance, which is what they consume, *is* verified.
- Representative performance benchmarks (this host measures remote-DB latency).

---

## 10. CI status — VERIFIED GREEN on a hosted runner

Run `30328754485` for commit `4247778` completed with **`conclusion: success`**.
Per-job results, read back from the GitHub API:

```
  Lint:        success
  Typecheck:   success
  Test:        success
  Build:       success
  Secret Scan: success
```

This is the first green run: every prior run in recent history (`af1b836`,
`3792e0e`, `5d6c1cd`, `2da64a9`, `4bffba7`) reported `failure`, because the
workflow file could not be parsed.

---

## 9. Production readiness

**Stage: Release Candidate.** Core engine, MCP server, 20 tool adapters, and the
security controls are implemented and verified by execution. It is **not** labelled
Production because:

1. `/oauth/*` are non-authenticating stubs — anyone who adds the connector is
   admitted. A public instance must not hold real secrets until this is replaced.
2. Observability is essentially absent.
3. It has never run on a real deployment, and CI has not yet executed on a hosted runner.

**Public release recommendation: SAFE TO PUBLISH THE REPOSITORY** (MIT licensed, no
secrets in history, docs accurate, CI repaired) — **but do not advertise a hosted
public instance** until real OAuth lands and the first CI + deploy runs go green.
