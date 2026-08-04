# Verified facts — the only claims a ShadowPaste video may make

Every number and behaviour below was verified by executing it against this
repository or the live deployment. **A script may not state anything that is not
on this page or independently verified and added to it.**

This exists because the failure mode for developer video is not bad production —
it is a confident claim that turns out to be false. One wrong number in a demo
costs more trust than the video buys.

Last verified: commit `474bfc7`.

## Detection

| Claim | Value | How verified |
|---|---|---|
| Detection patterns | **501** | `SECRET_PATTERNS.length` |
| Distinct providers | **322** | distinct `provider` in the catalog |
| Corpus recall | **0 false negatives** on 1,000 files / 100k secrets | `bun tests/load-secret-detector.ts` |
| Extra detection layers | Shannon entropy, base64 pre-decode, canonicalization ladder (percent-decode → NFKC → invisible-char removal) | source + unit tests |
| Entropy floor for generic patterns | 4.2 bits/char | `MIN_GENERIC_ENTROPY` |

## MCP gateway

| Claim | Value | How verified |
|---|---|---|
| Tools | **28** across **8** adapters (`fs`, `github`, `db`, `shell`, `network`, `stripe`, `ai`, `shadowpaste`) | live `tools/list` |
| Risk levels | low 9 · medium 3 · high 7 · critical 9 | tool registry |
| Risk thresholds | ≥80 critical · ≥50 high · ≥25 medium · else low | `src/lib/risk.ts` |
| Policy decisions | `allow_once`, `allow_always`, `ask`, `deny`, `blocked`, `sandbox` | `src/lib/policy.ts` |
| Permanently denied tools | **6** — `github.repo.delete`, `db.schema.drop`, `fs.execute`, `db.export`, `stripe.charge`, `stripe.customer.delete` | `HARD_DENY` |
| Protocol versions | `2025-06-18`, `2025-03-26`, `2024-11-05` | live `initialize` |
| Transports | Streamable HTTP + HTTP+SSE | live |

## Live blocked-attack results (production, via MCP client)

| Attack | Result |
|---|---|
| SSRF → `169.254.169.254` | `blocked`, risk 95/critical |
| SSRF → `192.168.1.1` (webhook) | `blocked`, risk 95/critical |
| Path traversal → `../../../../etc/passwd` | `blocked`, risk 90/critical |
| `SELECT passwordHash FROM "User"` | `blocked`, risk 90, `SQL_FORBIDDEN_COLUMN` |
| `FROM "Agent", "User" u` (cross-tenant join) | `blocked`, risk 85, `SQL_FORBIDDEN_TABLE` |
| `cat /etc/passwd; rm -rf /` | `blocked`, risk 90, `COMMAND_REJECTED` |
| `github.repo.delete` | `deny`, risk 95 |
| `db.schema.drop` | `deny`, risk 95 |

Every one returned `executed: false`.

## Crypto and identity

| Claim | Value |
|---|---|
| Vault | AES-GCM-256 (WebCrypto), PBKDF2-SHA256 210k iterations |
| Credential injection | HMAC-SHA256 single-use capability tokens, TTL + usage limit 1 |
| OAuth 2.1 | PKCE **S256 only**, exact-match redirect URI, single-use codes, rotating refresh with family revocation |
| RFCs implemented | 8414 metadata · 7591 dynamic registration · 7009 revocation · 9728 protected-resource metadata |
| Audit chain | `H(n) = sha256(H(n-1) ‖ canonical(row_n))`; `GET /api/v1/audit/verify` returns 409 on divergence |

## Product surface

| Claim | Value |
|---|---|
| CLI commands | `init`, `protect`, `restore`, `status`, `open`, `daemon` |
| Dashboard modules | 14 |
| Import methods | folder drag-drop, folder picker, archive (`.zip`/`.tar`/`.tar.gz`/`.tgz`), local path, public HTTPS git clone |
| Alert rules | 8, with dedupe, cooldown and thresholds |
| Test suite | 197 unit tests / 498 assertions; war suite 10/10 |

## Measured performance

| Metric | Value | Caveat to state on screen |
|---|---|---|
| End-to-end import | ~0.33 MB/s | measured on a synthetic tree; scanning dominates |
| Import ceiling | ~9.9 MB serverless (60 s deadline), 100 MB self-hosted | Vercel caps uploads at ~4.5 MB before the app runs |

## Things a video must NOT claim

These are real limitations. If a script implies otherwise, the script is wrong.

- **The sandbox is a policy decision, not container isolation.** Critical calls route to an approval queue; they do not run isolated.
- **`db.migrate` and `ai.train` are registered but not implemented** — they return `NOT_IMPLEMENTED`.
- **No SOC 2, no SLA.** Pre-1.0 open source.
- **Workspaces are ephemeral on serverless.** Durable storage needs `SHADOWPASTE_WORKSPACE_ROOT` on a mounted volume.
- **Rate limits are per-instance without Redis.**
- No customers, no funding, no benchmarks against competitors, no testimonials. None exist.
