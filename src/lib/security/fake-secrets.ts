// ShadowPaste Core 1.0 — Format-Compatible Fake Secret Generator
// The key innovation: AI agents see secrets that LOOK real (same format) but are fake.
// Code still runs, tests don't break, AI understands the format, real secret never leaves vault.
//
// Examples:
//   OpenAI sk-proj-abc123...  →  sk-shadow-safe-abc123...  (same shape, clearly fake)
//   postgres://user:pass@host →  postgres://shadow:shadow@shadow-host (valid URL, fake creds)
//   AKIAIOSFODNN7EXAMPLE      →  AKIASHADOWFAKEKEY00       (same AWS shape, invalid checksum)

import { randomBytes } from "crypto"
import { classifyProvider, providerLabel, scanForSecrets } from "./detector"

export interface FakeSecret {
  raw: string
  fake: string
  provider: string
  scope: string
  note: string
}

// Generate a random alphanumeric suffix of given length
function rand(len: number, charset = "abcdefghijklmnopqrstuvwxyz0123456789"): string {
  const bytes = randomBytes(len)
  let out = ""
  for (let i = 0; i < len; i++) out += charset[bytes[i] % charset.length]
  return out
}

// Generate a format-compatible fake for any secret
export function generateFakeSecret(raw: string): FakeSecret {
  const cls = providerLabel(raw)
  const provider = cls.provider
  const scope = cls.scope
  let fake = ""
  let note = ""

  switch (provider) {
    case "OPENAI":
      if (raw.startsWith("sk-proj-")) {
        fake = `sk-proj-shadow-${rand(40, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")}`
      } else if (raw.startsWith("sk-ant-")) {
        fake = `sk-ant-shadow-${rand(80, "A-Za-z0-9_-")}`
      } else {
        fake = `sk-shadow-${rand(40, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      }
      note = "Fake OpenAI key — same format, invalid for API calls, safe for AI to see"
      break

    case "ANTHROPIC":
      fake = `sk-ant-shadow-${rand(90, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")}`
      note = "Fake Anthropic key — same format, safe for AI"
      break

    case "GITHUB":
      fake = `ghp_shadow${rand(30, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      note = "Fake GitHub token — same ghp_ prefix, invalid for API"
      break

    case "AWS_ACCESS_KEY":
      // AWS keys are 20 chars, start with AKIA, have a checksum — fake ones fail checksum
      fake = `AKIA${rand(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`.replace(/EXAMPLE$/, "FAKE00")
      note = "Fake AWS access key — same format, fails AWS checksum validation"
      break

    case "AWS_SESSION":
      fake = `ASIA${rand(16, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      note = "Fake AWS session token — same format, invalid"
      break

    case "AWS_SECRET_KEY":
      fake = rand(40, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/+=")
      note = "Fake AWS secret key — 40 chars, safe placeholder"
      break

    case "STRIPE":
      // Stripe keys: sk_live_... or sk_test_...
      if (raw.includes("rk_")) {
        fake = `rk_test_shadow${rand(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      } else {
        fake = `sk_test_shadow${rand(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      }
      note = "Fake Stripe key — test mode prefix, same shape, invalid"
      break

    case "GOOGLE":
      fake = `AIzaShadow${rand(27, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")}`
      note = "Fake Google API key — same AIza prefix, invalid"
      break

    case "DATABASE":
      fake = fakeDatabaseUri(raw, provider)
      note = "Fake database URI — valid format, shadow credentials, unreachable host"
      break

    case "SLACK":
      fake = `xoxb-shadow-${rand(10, "0123456789")}-${rand(12, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")}`
      note = "Fake Slack token — same xoxb prefix, invalid"
      break

    case "JWT":
      // JWT shape: header.payload.signature
      fake = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaGFkb3ciOiJzYWZlIiwidGVzdCI6dHJ1ZX0.shadow${rand(20, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")}`
      note = "Fake JWT — valid structure, shadow claims, invalid signature"
      break

    case "SSH":
    case "SSH_PRIVATE_KEY":
      fake = "-----BEGIN SHADOW PRIVATE KEY-----\nMIIBshadow" + rand(200, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/+=\n") + "\n-----END SHADOW PRIVATE KEY-----"
      note = "Fake SSH key — PEM block shape, invalid key material"
      break

    case "HUGGINGFACE":
      fake = `hf_shadow${rand(30, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      note = "Fake HuggingFace token — same hf_ prefix, invalid"
      break

    case "DISCORD":
      fake = `https://discord.com/api/webhooks/${rand(18, "0123456789")}/shadow${rand(40, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")}`
      note = "Fake Discord webhook — valid URL shape, nonexistent endpoint"
      break

    case "TELEGRAM":
      fake = `${rand(9, "0123456789")}:shadow${rand(35, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")}`
      note = "Fake Telegram bot token — same bot:token format, invalid"
      break

    case "OAUTH":
      fake = `ya29.shadow-${rand(40, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-")}`
      note = "Fake OAuth token — same ya29 prefix, invalid"
      break

    case "FIREBASE":
      fake = raw.replace(/:[^@]+@/, ":shadow@").replace(/firebaseio\.com/, "shadow.firebaseio.com")
      note = "Fake Firebase URL — valid URL, unreachable host"
      break

    case "SUPABASE":
      fake = raw.replace(/:[^@]+@/, ":shadow@").replace(/supabase\.(co|in|net)/, "shadow.supabase.co")
      note = "Fake Supabase URL — valid URL, unreachable host"
      break

    case "GITLAB":
      fake = `glpat-shadow-${rand(16, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")}`
      note = "Fake GitLab token — same glpat prefix, invalid"
      break

    default:
      // ENV_SECRET or unknown — generate a shadow-safe placeholder of same length
      if (raw.length > 20) {
        fake = `shadow-${rand(Math.min(raw.length - 7, 40), "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")}`
      } else {
        fake = `shadow-${rand(12)}`
      }
      note = "Fake secret — shadow-safe placeholder, same approximate length"
  }

  return { raw, fake, provider, scope, note }
}

function fakeDatabaseUri(raw: string, _provider: string): string {
  // Parse the URI and replace credentials + host
  try {
    const parsed = new URL(raw)
    parsed.username = "shadow"
    parsed.password = "shadow"
    // Replace hostname with shadow-host
    parsed.hostname = "shadow-db.internal"
    if (parsed.port) parsed.port = "5432"
    return parsed.toString().replace(/%40/g, "@")
  } catch {
    // Fallback: regex replace
    return raw
      .replace(/\/\/[^:]+:[^@]+@/, "//shadow:shadow@")
      .replace(/@[^/]+/, "@shadow-db.internal:5432")
  }
}

// Batch: virtualize an entire text blob, replacing all secrets with format-compatible fakes
export interface VirtualizeFakesResult {
  text: string
  count: number
  replacements: Array<{ raw: string; fake: string; provider: string; line: number }>
}

export function virtualizeWithFakes(text: string, contextHint = ""): VirtualizeFakesResult {
  const findings = scanForSecrets(text, contextHint)
  if (findings.length === 0) return { text, count: 0, replacements: [] }

  // Sort by index descending so replacements don't shift earlier indices
  const sorted = [...findings].sort((a, b) => {
    const ai = text.indexOf(a.raw)
    const bi = text.indexOf(b.raw)
    return bi - ai
  })

  let result = text
  const replacements: VirtualizeFakesResult["replacements"] = []

  for (const f of sorted) {
    const fake = generateFakeSecret(f.raw)
    const idx = result.indexOf(f.raw)
    if (idx === -1) continue
    const lineNum = result.slice(0, idx).split("\n").length
    result = result.slice(0, idx) + fake.fake + result.slice(idx + f.raw.length)
    replacements.push({ raw: f.raw, fake: fake.fake, provider: f.provider, line: lineNum })
  }

  return { text: result, count: replacements.length, replacements }
}
