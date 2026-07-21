// @shadowpaste/security — secret detector (SYNCED COPY for VS Code extension).
// AUTO-SYNCED from src/lib/security/detector.ts. Do not edit manually.
// Uses core detection patterns (SELF_CONTAINED + ASSIGNMENT + classifyProvider).
// The 500-pattern catalog is not included (extension context).

// @shadowpaste/security — secret detector + provider classifier + entropy engine
// Ported from packages/security/index.mjs + packages/engine/index.mjs.
// ONE source of truth for secret detection across Web App, MCP Gateway, Scanner, Extension.


export interface Detector {
  id: string;
  virtualize: boolean;
  weight: number;
  regex: () => RegExp;
}

export const detectors: Detector[] = [
  { id: "PEM_RSA_KEY", virtualize: true, weight: 60, regex: () => /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----|-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gi },
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
  return { provider, scope: cls.scope === "generic.use" ? "env.secret" : cls.scope };
}


// ---- scanForSecrets (extension version — core patterns only) ----
export function scanForSecrets(text: string, contextHint = ""): SecretFinding[] {
  const findings: SecretFinding[] = []
  for (const d of detectors) {
    const re = d.regex()
    let m
    while ((m = re.exec(text)) !== null) {
      const raw = m[0]
      if (raw.length < 6) { if (raw.length === 0) re.lastIndex++; continue }
      const { provider, scope } = providerLabel(raw, contextHint)
      const line = text.slice(0, m.index).split("\n").length
      findings.push({ type: "secret", severity: "critical", detector: d.id, provider, scope, raw, masked: raw.length <= 12 ? raw.slice(0, 4) + "***" : raw.slice(0, 8) + "..." + raw.slice(-4), line, column: 0 })
      if (raw.length === 0) re.lastIndex++
    }
  }
  return findings
}

// ---- SecretFinding + virtualizeText (synced from main detector) ----
export interface SecretFinding {
  type: "secret";
  severity: "low" | "medium" | "high" | "critical";
  detector: string;
  provider: string;
  scope: string;
  raw: string;
  masked: string;
  line: number;
  column: number;
}

const SKIP_VALUE = /^(?:true|false|null|undefined|none|example|changeme|your[_-]?\w+|xxx+|<[^>]+>|\{\{[^}]+\}\}|\[DETECTED_)/i;

function shortId(raw: string, salt = ""): string {
  let h = 0x811c9dc5;
  const s = salt + raw;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36).toUpperCase().padStart(5, "0").slice(0, 5);
}

export function virtualizeText(text: string, opts: { mode?: string; salt?: string } = {}) {
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
  // Use the detectors array (each detector has a regex() function)
  for (const d of detectors) {
    const re = d.regex(); let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) { pushSpan(m.index, m.index + m[0].length, m[0]); if (m[0].length === 0) re.lastIndex++; }
  }
  if (spans.length === 0) return { text, count: 0, findings: [], raws: [] as Array<{ raw: string; provider: string; reference: string }> };
  spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const chosen: typeof spans = []; let lastEnd = -1;
  for (const s of spans) { if (s.start >= lastEnd) { chosen.push(s); lastEnd = s.end; } }
  const refByRaw = new Map<string, string>(); const findings: Array<{ provider: string; reference: string; occurrences: number; length: number }> = [];
  const raws: Array<{ raw: string; provider: string; reference: string }> = [];
  const refFor = (raw: string): string => {
    if (refByRaw.has(raw)) return refByRaw.get(raw)!;
    const { provider } = providerLabel(raw, salt);
    const token = mode === "TEST" ? `[DETECTED_${provider}_SECRET]` : `{{SHADOW_SECRET_${provider}_${shortId(raw, salt)}}}`;
    refByRaw.set(raw, token); findings.push({ provider, reference: token, occurrences: 0, length: raw.length });
    raws.push({ raw, provider, reference: token });
    return token;
  };
  let out = ""; let cursor = 0;
  for (const s of chosen) { const token = refFor(s.raw); out += text.slice(cursor, s.start) + token; cursor = s.end; const f = findings.find(x => x.reference === token); if (f) f.occurrences++; }
  out += text.slice(cursor);
  return { text: out, count: chosen.length, findings, raws };
}
