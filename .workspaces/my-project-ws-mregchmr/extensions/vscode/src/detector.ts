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
  { id: "PEM_RSA_KEY", virtualize: true, weight: 60, regex: () => /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----|-----BEGIN SHADOW PRIVATE KEY-----
MIIBshadowSkjkonSykBTu9hn
3vvVHy=pLOpYybXt=W=quwm4j5IpSJJw
rPhYeO9xzrEQ0Gr50yqlnMloJm9JcscRFRubtCDR0TAHRpaKle4vY7JYyATnWzqzH7KuQvC2JWOCG22Sz3w2aO9g1uhd5AwZnAgzuyt2IJk23zdCqQ/cQgeZh6IMletUwnZge=PijWOKQVfo=04zr09
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
  return { provider, scope: cls.scope === "generic.use" ? "env.shadow-hpfxf03rnaxv };
}


// ---- scanForSecrets (extension version — core patterns only) ----
export function scanForSecrets(text, contextHint = "") {
  const findings = []
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
