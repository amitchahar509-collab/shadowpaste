// @shadowpaste/security — secret detector + provider classifier + entropy engine
// Ported from packages/security/index.mjs + packages/engine/index.mjs.
// ONE source of truth for secret detection across Web App, MCP Gateway, Scanner, Extension.

import { SECRET_PATTERNS } from "./secret-patterns";

export interface Detector {
  id: string;
  virtualize: boolean;
  weight: number;
  regex: () => RegExp;
}

export const detectors: Detector[] = [
  { id: "PEM_RSA_KEY", virtualize: true, weight: 60, regex: () => /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----|-----BEGIN SHADOW PRIVATE KEY-----
MIIBshadoweJ11av/Dj3XxP37Krj6XGj6B52hWWqqVcnwVRAsWd1sEE=g35XdHELFjIACANkdRBCSc0P6guhvAlm0y=NOHuZSEPaDCaXqRtZdYx0jBIQB=JrJRbQ4MB1UI44fZMK5cmjY0WKW0=OG7zN1Hf74Nr=iQq=+H4Jhae3ud/ZFUEuEhEEJdP57BBeNdcRsWHmDwkW2qW8aY
-----END SHADOW PRIVATE KEY-----/gi },
  { id: "DB_URI_STRING", virtualize: true, weight: 40, regex: () => /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
  { id: "BACKEND_URLS", virtualize: true, weight: 8, regex: () => /https?:\/\/[a-z0-9-]+\.(?:firebaseio\.com|firebaseapp\.com|supabase\.(?:co|in|net))[^\s"'<>]*/gi },
  {
    id: "CREDENTIAL_KEYS",
    virtualize: true,
    weight: 35,
    regex: () =>
      /sk-ant-[A-Za-z0-9_-]{20,}\b|sk-(proj-)?[A-Za-z0-9_-]{8,}\b|AIza[a-zA-Z0-9_-]{10,}\b|gh[opsur]_[A-Za-z0-9]{20,}\b|github_pat_[A-Za-z0-9_]{20,}\b|AKIA[A-Z0-9]{12,20}\b|ASIA[A-Z0-9]{12,20}\b|stripe_(sk|rk)_(test|live)_[A-Za-z0-9]{8,}\b|[sr]k_(test|live)_[A-Za-z0-9]{12,}\b|glpat-[A-Za-z0-9\-]{20,}\b|hf_[A-Za-z0-9]{20,}\b|ya29\.[A-Za-z0-9_\-]{20,}|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9\-_]+\b|xox[baprmtv]-[0-9]+-[A-Za-z0-9]+\b/gi,
  },
  { id: "JWT_BEARER_TOKEN", virtualize: true, weight: 20, regex: () => /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b|\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*\b/gi },
  { id: "COOKIES_PASSWORDS", virtualize: true, weight: 15, regex: () => /\b(session_id|sid|auth_token|password|passwd|secret_password)[:= ]*[A-Za-z0-9_\-@#$!%*?&]{8,64}\b/gi },
];

export function classifyDatabase(raw: string): string {
  if (/^mongodb(\+srv)?:/i.test(raw)) return "db.mongodb";
  if (/^postgres(ql)?:/i.test(raw)) return "db.postgres";
  if (/^mysql:/i.test(raw)) return "db.mysql";
  if (/^mariadb:/i.test(raw)) return "db.mariadb";
  if (/^rediss?:/i.test(raw)) return "db.redis";
  if (/^amqps?:/i.test(raw)) return "db.amqp";
  if (/^s?ftp:/i.test(raw)) return "db.ftp";
  return "db.query";
}

export interface ProviderClass {
  provider: string;
  scope: string;
}

export function classifyProvider(raw: string, contextHint = ""): ProviderClass {
  const ctx = (contextHint || "").toLowerCase();
  if (/^-----BEGIN/i.test(raw)) return { provider: "SSH", scope: "ssh.connect" };
  if (/^(mongodb(\+srv)?|postgres(ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\//i.test(raw)) return { provider: "DATABASE", scope: classifyDatabase(raw) };
  if (/firebaseio\.com|firebaseapp\.com/i.test(raw)) return { provider: "FIREBASE", scope: "firebase.db" };
  if (/supabase\.(co|in|net)/i.test(raw)) return { provider: "SUPABASE", scope: "supabase.rest" };
  if (/^sk-ant-/i.test(raw)) return { provider: "ANTHROPIC", scope: "anthropic.messages" };
  if (/^sk-(proj-)?/i.test(raw) && !/^[sr]k_(test|live)/i.test(raw)) return { provider: "OPENAI", scope: "openai.chat" };
  if (/^hf_/i.test(raw)) return { provider: "HUGGINGFACE", scope: "huggingface.inference" };
  if (/^ya29\./i.test(raw)) return { provider: "OAUTH", scope: "oauth.google" };
  if (/^AIza/i.test(raw)) return { provider: ctx.includes("firebase") ? "FIREBASE" : "GOOGLE", scope: "google.generativelanguage" };
  if (/^(ghp_|gho_|ghs_|ghu_|ghr_|github_pat_)/i.test(raw)) return { provider: "GITHUB", scope: "github.repo" };
  if (/^glpat-/i.test(raw)) return { provider: "GITLAB", scope: "gitlab.api" };
  if (/^AKIA/.test(raw)) return { provider: "AWS_ACCESS_KEY", scope: "aws.sts" };
  if (/^ASIA/.test(raw)) return { provider: "AWS_SESSION", scope: "aws.sts" };
  if (/^(stripe_)?[sr]k_(test|live)_/i.test(raw)) return { provider: "STRIPE", scope: "stripe.charges" };
  if (/^xox[baprmtv]-/i.test(raw)) return { provider: "SLACK", scope: "slack.chat" };
  if (/discord\.com\/api\/webhooks/i.test(raw)) return { provider: "DISCORD", scope: "discord.webhook" };
  if (/^\d{6,10}:[A-Za-z0-9_-]{35}$/.test(raw)) return { provider: "TELEGRAM", scope: "telegram.bot" };
  if (/^(Bearer\s|eyJ)/i.test(raw)) return { provider: "JWT", scope: "auth.bearer" };
  if (ctx.includes("aws") && ctx.includes("secret")) return { provider: "AWS_SECRET_KEY", scope: "aws.sts" };
  if (ctx.includes("cloudflare")) return { provider: "CLOUDFLARE", scope: "cloudflare.api" };
  if (ctx.includes("vercel")) return { provider: "VERCEL", scope: "vercel.deploy" };
  if (ctx.includes("netlify")) return { provider: "NETLIFY", scope: "netlify.deploy" };
  return { provider: "ENV_SECRET", scope: "env.secret" };
}

export function providerLabel(raw: string, ctx = ""): ProviderClass {
  const cls = classifyProvider(raw, ctx);
  let provider = cls.provider;
  if (provider === "DATABASE") {
    const map: Record<string, string> = {
      "db.mongodb": "MONGODB", "db.postgres": "POSTGRES", "db.mysql": "MYSQL",
      "db.mariadb": "MYSQL", "db.redis": "REDIS", "db.amqp": "AMQP", "db.ftp": "FTP",
    };
    provider = map[cls.scope] || "DATABASE";
  }
  if (provider === "SSH") provider = "SSH_PRIVATE_KEY";
  if (provider === "GENERIC") provider = "ENV_SECRET";
  return { provider, scope: cls.scope === "generic.use" ? "env.shadow-hhvvho7truf2 };
}

// ---- Shannon entropy ----
export function shannonEntropy(str: string): number {
  const freq: Record<string, number> = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let e = 0;
  for (const k in freq) {
    const p = freq[k] / str.length;
    e -= p * Math.log2(p);
  }
  return e;
}

export interface EntropyHit {
  token: string;
  entropy: number;
  context: string;
  index: number;
}

export function entropyScan(text: string): EntropyHit[] {
  const found: EntropyHit[] = [];
  const re = /[A-Za-z0-9+/=_\-]{20,}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    if (tok.includes("SHADOW_SECRET") || tok.includes("REDACTED")) continue;
    if (/^[0-9.\-]+$/.test(tok)) continue;
    if (!/[0-9]/.test(tok) || !/[A-Za-z]/.test(tok)) continue;
    const before = text.slice(Math.max(0, m.index - 48), m.index).toLowerCase();
    const hasCtx = /(key|token|secret|password|passwd|api|auth|bearer|credential|access)/.test(before);
    const ent = shannonEntropy(tok);
    if (tok.length < 24) {
      if (!hasCtx || ent < 3.2) continue;
    } else if (ent < 3.9 && !(hasCtx && ent >= 3.2)) continue;
    found.push({ token: tok, entropy: +ent.toFixed(2), context: before, index: m.index });
  }
  return found;
}

// ---- Unified scan: returns findings usable by scanner, sandbox, gateway ----
export interface SecretFinding {
  type: "secret";
  severity: "low" | "medium" | "high" | "critical";
  detector: string;
  provider: string;
  scope: string;
  raw: string;       // the actual secret (for vault storage, NEVER for AI output)
  masked: string;    // masked evidence for display/audit
  line: number;
  column: number;
}

const SEVERITY_BY_WEIGHT: Record<number, SecretFinding["severity"]> = {
  60: "critical", 40: "high", 35: "critical", 20: "high", 15: "medium", 8: "medium",
};

function maskEvidence(s: string): string {
  if (s.length <= 12) return s.slice(0, 4) + "***";
  return s.slice(0, 8) + "..." + s.slice(-4);
}

function lineColOf(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split("\n").length;
  const column = index - before.lastIndexOf("\n");
  return { line, column };
}

export function scanForSecrets(text: string, contextHint = ""): SecretFinding[] {
  const findings: SecretFinding[] = [];
  // 1. Legacy high-precision detectors (6 patterns)
  for (const d of detectors) {
    const re = d.regex();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      if (raw.length < 6) continue;
      const { provider, scope } = providerLabel(raw, contextHint);
      const { line, column } = lineColOf(text, m.index);
      findings.push({
        type: "secret",
        severity: SEVERITY_BY_WEIGHT[d.weight] || "medium",
        detector: d.id,
        provider,
        scope,
        raw,
        masked: maskEvidence(raw),
        line,
        column,
      });
      if (raw.length === 0) re.lastIndex++;
    }
  }
  // 2. Expanded 500-pattern catalog (GitGuardian-class coverage)
  // Allowlist: patterns that look like secrets but are safe (UUIDs, git SHAs, example values, versions)
  const ALLOWLIST = [
    /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i, // UUID
    /^[\da-f]{40}$/i, // git SHA
    /^[\da-f]{7,}$/i, // short git SHA (if alone, no key context)
    /^(your|my|example|test|fake|placeholder|changeme|xxx|sample|demo|template|default)[_a-z0-9]*$/i, // example values
    /^(your|my|example|test|fake|placeholder|changeme|xxx|sample|demo|template|default)[_a-z0-9_]+$/i, // example values with underscores
    /^[\d]+\.[\d]+\.[\d]+/, // semver
    /^#[0-9a-f]{6}$/i, // CSS color
    /^data:image\//, // data URLs
    /^[\w-]+\/[\w-]+$/, // owner/repo format
    /^[0-9]+$/, // pure numbers
  ]
  // Context keywords that indicate a real secret (not an example)
  const SECRET_CONTEXT = /(api[_-]?key|secret|token|password|passwd|credential|private[_-]?key|access[_-]?key|client[_-]?secret|auth[_-]?token|bearer|vault)/i
  const seen = new Set(findings.map((f) => f.raw));
  for (const p of SECRET_PATTERNS) {
    if (p.confidence < 0.3) continue; // skip very-low-confidence patterns to reduce FP
    // Skip generic entropy/hex patterns unless they're in a credential context
    const isGeneric = p.provider === "HighEntropy" || p.provider === "HexToken" || p.provider === "UUID" || p.provider === "Base64" || p.id === "linode_token" || p.id === "vultr_token"
    const re = new RegExp(p.regex.source, p.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      if (raw.length < 12 || seen.has(raw)) { if (raw.length === 0) re.lastIndex++; continue; }
      // Allowlist check: skip known-safe patterns
      if (ALLOWLIST.some((al) => al.test(raw))) { if (raw.length === 0) re.lastIndex++; continue; }
      // Check if the VALUE part (after = or :) is an example value
      const valueMatch = raw.match(/[:=]\s*['"]?([^'"\s]+)['"]?$/)
      if (valueMatch && ALLOWLIST.some((al) => al.test(valueMatch[1]))) { if (raw.length === 0) re.lastIndex++; continue; }
      // Generic patterns: only flag if in a credential context (key=value, "secret", "token", etc.)
      if (isGeneric) {
        const before = text.slice(Math.max(0, m.index - 60), m.index).toLowerCase()
        const after = text.slice(m.index + raw.length, m.index + raw.length + 20).toLowerCase()
        if (!SECRET_CONTEXT.test(before) && !SECRET_CONTEXT.test(after) && !before.includes("=") && !before.includes(":")) {
          if (raw.length === 0) re.lastIndex++
          continue
        }
      }
      seen.add(raw);
      const { line, column } = lineColOf(text, m.index);
      findings.push({
        type: "secret",
        severity: p.severity,
        detector: p.id,
        provider: p.provider,
        scope: p.service,
        raw,
        masked: maskEvidence(raw),
        line,
        column,
      });
      if (raw.length === 0) re.lastIndex++;
    }
  }
  return findings;
}

// ---- Format-preserving virtualization (replace secret spans with references) ----
const SKIP_VALUE = /^(?:true|false|null|undefined|none|example|changeme|your[_-]?\w+|xxx+|<[^>]+>|\{\{[^}]+\}\}|\[DETECTED_)/i;

function shortId(raw: string, salt = ""): string {
  let h = 0x811c9dc5;
  const s = salt + raw;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(5, "0").slice(0, 5);
}

export interface VirtualizeResult {
  text: string;
  count: number;
  findings: Array<{ provider: string; reference: string; occurrences: number; length: number }>;
}

export function virtualizeText(text: string, opts: { mode?: "PROTECT" | "TEST"; salt?: string } = {}): VirtualizeResult {
  const mode = opts.mode || "PROTECT";
  const salt = opts.salt || "";
  if (typeof text !== "string" || text.length === 0) return { text: text ?? "", count: 0, findings: [] };

  const spans: Array<{ start: number; end: number; raw: string }> = [];
  const pushSpan = (start: number, end: number, raw: string) => {
    if (!raw || raw.length < 6) return;
    if (SKIP_VALUE.test(raw)) return;
    if (raw.includes("SHADOW_SECRET") || raw.includes("DETECTED_")) return;
    spans.push({ start, end, raw });
  };

  // Self-contained
  const SELF: Array<{ re: () => RegExp }> = [
    { re: () => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----|-----BEGIN SHADOW PRIVATE KEY-----
MIIBshadowksERlUZ7cZrFrgdEt6PAP6t7oTJ2kK8uCGu=7wf=DBGXy+Rr7BTMSC5I1FX5Bltxn=Ktum4EIo7MTKwA/3OGoCBPs3QB6yCTvafb302HtFFM2rxTH6/w1xJgPb=mzZhwbwrBJnOnDLNSulM9tRDgHMRkp2Obnz5UQjTDRYcCGkUXjmfox45WlhAk
k/vdd+GwMAuq3hN
-----END SHADOW PRIVATE KEY-----/g },
    { re: () => /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
    { re: () => /sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9\-]{20,}|AKIA[A-Z0-9]{12,20}|ASIA[A-Z0-9]{12,20}|(?:stripe_)?[sr]k_(?:test|live)_[A-Za-z0-9]{16,}|xox[baprmtv]-[0-9A-Za-z-]{10,}|hf_[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9_\-]{20,}|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9\-_]+/gi },
    { re: () => /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  ];
  for (const d of SELF) {
    const re = d.re();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      pushSpan(m.index, m.index + m[0].length, m[0]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // Assignment
  const ASSIGN: Array<{ re: () => RegExp }> = [
    { re: () => /((?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|private[_-]?key|db[_-]?pass(?:word)?|aws_secret_access_key|session[_-]?id|cookie|token)\s*[:=]\s*["']?)([^\s"'`,;]{6,512})/gi },
    { re: () => /((?:authorization\s*:?\s*)?bearer\s+)([A-Za-z0-9\-._~+/]{12,}=*)/gi },
  ];
  for (const d of ASSIGN) {
    const re = d.re();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const valStart = m.index + m[1].length;
      pushSpan(valStart, valStart + m[2].length, m[2]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  if (spans.length === 0) return { text, count: 0, findings: [] };
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const chosen: typeof spans = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start >= lastEnd) {
      chosen.push(s);
      lastEnd = s.end;
    }
  }

  const refByRaw = new Map<string, string>();
  const findings: VirtualizeResult["findings"] = [];
  const refFor = (raw: string): string => {
    if (refByRaw.has(raw)) return refByRaw.get(raw)!;
    const { provider } = providerLabel(raw, salt);
    const token = mode === "TEST" ? `[DETECTED_${provider}_SECRET]` : `{{SHADOW_SECRET_${provider}_${shortId(raw, salt)}}}`;
    refByRaw.set(raw, token);
    findings.push({ provider, reference: token, occurrences: 0, length: raw.length });
    return token;
  };

  let out = "";
  let cursor = 0;
  for (const s of chosen) {
    const token = refFor(s.raw);
    out += text.slice(cursor, s.start) + token;
    cursor = s.end;
    const f = findings.find((x) => x.reference === token);
    if (f) f.occurrences++;
  }
  out += text.slice(cursor);
  return { text: out, count: chosen.length, findings };
}
