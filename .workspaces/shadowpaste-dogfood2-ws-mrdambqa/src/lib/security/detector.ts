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
MIIBshadowNkfFnDO0Y21jcROsjQs0bC6ZShDUxLoA+jU6pUJIxycbyIGTFvBDrl6If1l3RlxeJOuEeng01oQ6b9l=36fGpNd/xGU+p4terhxyEwzCfYVtzEAcNjzDBcveTJNz7wqTmtLDgFD9rYbDO/csVw4zxXJreXDMui52UtcUs4wDPns5jVLfdIklvyxocoo4jnOA3Wa
6oGl
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
  return { provider, scope: cls.scope === "generic.use" ? "env.shadow-b5fnivm61549 };
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
  const seen = new Set(findings.map((f) => f.raw));
  for (const p of SECRET_PATTERNS) {
    if (p.confidence < 0.3) continue; // skip very-low-confidence patterns to reduce FP
    const re = new RegExp(p.regex.source, p.regex.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw = m[0];
      if (raw.length < 12 || seen.has(raw)) { if (raw.length === 0) re.lastIndex++; continue; }
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
MIIBshadowqrIt21Gr4Der
R34ogicbjcTyQ2K6Lj3XHglYT3SWu5DrCsY3DGx
1UYNcY
cBzA

o2OVNtSis5128uKNm0ngxb17g1Fd
fC3fN/2W8CBc9QJ9a2Hfc1GX3Jurh=ybH8++haHqNszWin1cs1lse=yxB0qZHR/j/kBckVS355gMs1NPNpkNIHq9tYMW10v15OCsYm26J
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
