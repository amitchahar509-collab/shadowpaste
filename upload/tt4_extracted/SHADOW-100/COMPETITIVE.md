# ShadowPaste — Market Position (Agent 10, no exaggeration)

## Category
ShadowPaste sits between a **secrets manager** (1Password/Infisical/Doppler) and an **AI gateway**
(Cloudflare AI Gateway, Portkey, LiteLLM). Its specific niche: **keeping raw credentials out of the AI/LLM
context while still letting an agent use them** — a problem the others don't directly solve.

## Honest comparison
| | ShadowPaste | 1Password (agent vault) | Infisical | Doppler | AI Gateways |
|---|---|---|---|---|---|
| Secret storage/encryption | ✔ local AES-GCM | ✔ (cloud, audited) | ✔ | ✔ | ~ partial |
| **Keeps secret out of LLM prompt** | ✔ core feature | ~ not the focus | ✗ | ✗ | ✗ |
| Capability tokens (scoped/expiring) | ✔ | ✔ | partial | partial | ✗ |
| Prompt-injection firewall | ✔ | ✗ | ✗ | ✗ | some |
| Browser-side interception (ChatGPT/Claude…) | ✔ extension | ✗ | ✗ | ✗ | ✗ |
| Runs fully local / offline | ✔ | ✗ | self-host | ✗ | ✗ |
| Team sync / RBAC / SSO / audit compliance | ✗ **missing** | ✔ | ✔ | ✔ | ✔ |
| SOC2 / SLA / support | ✗ | ✔ | ✔ | ✔ | ✔ |

## Unique advantage (defensible)
The **browser-side secret interceptor + local capability runtime**: a user can paste a key into ChatGPT and the
model provably never receives it, yet an agent can still act with it. No incumbent does exactly this.

## Missing for enterprise (do not claim these exist)
- Multi-user vault sync, RBAC, SSO/SCIM, org audit export.
- Server-side persistent encrypted store (current server vault is process-memory only).
- Compliance posture (SOC2/ISO), signed releases, SBOM.
- Live provider execution behind a hardened proxy (currently verified only against a mock).

## Plausible pricing path (not a claim of traction)
- **Free / OSS:** local web app + extension + self-host runtime.
- **Team ($/seat):** hosted runtime, shared encrypted vault, RBAC, audit export.
- **Enterprise:** SSO/SCIM, on-prem, compliance, support SLA.
