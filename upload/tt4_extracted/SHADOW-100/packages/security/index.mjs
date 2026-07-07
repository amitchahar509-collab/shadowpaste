// @shadowpaste/security — detectors, provider classifier, entropy engine,
// prompt-injection shield, and Agent Firewall V2. Pure functions, isomorphic.

// ---- Detection matrix (credential-class rules are virtualizable) ----
export const detectors = [
  { id: 'PEM_RSA_KEY', virtualize: true, weight: 60, regex: () => /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----|-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/gi },
  { id: 'DB_URI_STRING', virtualize: true, weight: 40, regex: () => /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
  { id: 'BACKEND_URLS', virtualize: true, weight: 8, regex: () => /https?:\/\/[a-z0-9-]+\.(?:firebaseio\.com|firebaseapp\.com|supabase\.(?:co|in|net))[^\s"'<>]*/gi },
  { id: 'CREDENTIAL_KEYS', virtualize: true, weight: 35, regex: () => /sk-ant-[A-Za-z0-9_-]{20,}\b|sk-(proj-)?[A-Za-z0-9_-]{8,}\b|AIza[a-zA-Z0-9_-]{10,}\b|gh[opsur]_[A-Za-z0-9]{20,}\b|github_pat_[A-Za-z0-9_]{20,}\b|AKIA[A-Z0-9]{12,20}\b|ASIA[A-Z0-9]{12,20}\b|stripe_(sk|rk)_(test|live)_[A-Za-z0-9]{8,}\b|[sr]k_(test|live)_[A-Za-z0-9]{12,}\b|glpat-[A-Za-z0-9\-]{20,}\b|hf_[A-Za-z0-9]{20,}\b|ya29\.[A-Za-z0-9_\-]{20,}|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9\-_]+\b|xox[baprmtv]-[0-9]+-[A-Za-z0-9]+\b/gi },
  { id: 'JWT_BEARER_TOKEN', virtualize: true, weight: 20, regex: () => /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b|\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*\b/gi },
  { id: 'COOKIES_PASSWORDS', virtualize: true, weight: 15, regex: () => /\b(session_id|sid|auth_token|password|passwd|secret_password)[:= ]*[A-Za-z0-9_\-@#$!%*?&]{8,64}\b/gi }
];

// ---- Database engine classifier ----
export function classifyDatabase(raw) {
  if (/^mongodb(\+srv)?:/i.test(raw)) return 'db.mongodb';
  if (/^postgres(ql)?:/i.test(raw)) return 'db.postgres';
  if (/^mysql:/i.test(raw)) return 'db.mysql';
  if (/^mariadb:/i.test(raw)) return 'db.mariadb';
  if (/^rediss?:/i.test(raw)) return 'db.redis';
  if (/^amqps?:/i.test(raw)) return 'db.amqp';
  if (/^s?ftp:/i.test(raw)) return 'db.ftp';
  return 'db.query';
}

// ---- Provider classifier (context-aware) ----
export function classifyProvider(raw, contextHint = '') {
  const ctx = (contextHint || '').toLowerCase();
  if (/^-----BEGIN/i.test(raw)) return { provider: 'SSH', scope: 'ssh.connect' };
  if (/^(mongodb(\+srv)?|postgres(ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\//i.test(raw)) return { provider: 'DATABASE', scope: classifyDatabase(raw) };
  if (/firebaseio\.com|firebaseapp\.com/i.test(raw)) return { provider: 'FIREBASE', scope: 'firebase.db' };
  if (/supabase\.(co|in|net)/i.test(raw)) return { provider: 'SUPABASE', scope: 'supabase.rest' };
  if (/^sk-ant-/i.test(raw)) return { provider: 'ANTHROPIC', scope: 'anthropic.messages' };
  if (/^sk-(proj-)?/i.test(raw) && !/^[sr]k_(test|live)/i.test(raw)) return { provider: 'OPENAI', scope: 'openai.chat' };
  if (/^hf_/i.test(raw)) return { provider: 'HUGGINGFACE', scope: 'huggingface.inference' };
  if (/^ya29\./i.test(raw)) return { provider: 'OAUTH', scope: 'oauth.google' };
  if (/^AIza/i.test(raw)) return { provider: ctx.includes('firebase') ? 'FIREBASE' : 'GOOGLE', scope: 'google.generativelanguage' };
  if (/^(ghp_|gho_|ghs_|ghu_|ghr_|github_pat_)/i.test(raw)) return { provider: 'GITHUB', scope: 'github.repo' };
  if (/^glpat-/i.test(raw)) return { provider: 'GITLAB', scope: 'gitlab.api' };
  if (/^AKIA/.test(raw)) return { provider: 'AWS_ACCESS_KEY', scope: 'aws.sts' };
  if (/^ASIA/.test(raw)) return { provider: 'AWS_SESSION', scope: 'aws.sts' };
  if (/^(stripe_)?[sr]k_(test|live)_/i.test(raw)) return { provider: 'STRIPE', scope: 'stripe.charges' };
  if (/^xox[baprmtv]-/i.test(raw)) return { provider: 'SLACK', scope: 'slack.chat' };
  if (/discord\.com\/api\/webhooks/i.test(raw)) return { provider: 'DISCORD', scope: 'discord.webhook' };
  if (/^\d{6,10}:[A-Za-z0-9_-]{35}$/.test(raw)) return { provider: 'TELEGRAM', scope: 'telegram.bot' };
  if (/^(Bearer\s|eyJ)/i.test(raw)) return { provider: 'JWT', scope: 'auth.bearer' };
  // context refinement for opaque high-entropy tokens
  if (ctx.includes('aws') && ctx.includes('secret')) return { provider: 'AWS_SECRET_KEY', scope: 'aws.sts' };
  if (ctx.includes('cloudflare')) return { provider: 'CLOUDFLARE', scope: 'cloudflare.api' };
  if (ctx.includes('vercel')) return { provider: 'VERCEL', scope: 'vercel.deploy' };
  if (ctx.includes('netlify')) return { provider: 'NETLIFY', scope: 'netlify.deploy' };
  // No weak GENERIC fallback: an opaque high-entropy value in a credential
  // context is an environment secret, not "generic". Callers still get a real,
  // virtualizable classification.
  return { provider: 'ENV_SECRET', scope: 'env.secret' };
}

// ---- Entropy engine (Shannon + context scoring) ----
export function shannonEntropy(str) {
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  let e = 0;
  for (const k in freq) { const p = freq[k] / str.length; e -= p * Math.log2(p); }
  return e;
}
export function entropyScan(text) {
  const found = [];
  const re = /[A-Za-z0-9+/=_\-]{20,}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    if (tok.includes('SHADOW_SECRET') || tok.includes('REDACTED')) continue;
    if (/^[0-9.\-]+$/.test(tok)) continue;
    if (!/[0-9]/.test(tok) || !/[A-Za-z]/.test(tok)) continue;
    const before = text.slice(Math.max(0, m.index - 48), m.index).toLowerCase();
    const hasCtx = /(key|token|secret|password|passwd|api|auth|bearer|credential|access)/.test(before);
    const ent = shannonEntropy(tok);
    // combined gate: short tokens (20-23) need credential context; long tokens (24+)
    // pass on raw entropy, or on a slightly lower bar when context is present.
    if (tok.length < 24) { if (!hasCtx || ent < 3.2) continue; }
    else if (ent < 3.9 && !(hasCtx && ent >= 3.2)) continue;
    found.push({ token: tok, entropy: +ent.toFixed(2), context: before, index: m.index });
  }
  return found;
}

// ---- Prompt-injection shield (Phase 7 defense; categorized for Firewall V2) ----
export const InjectionShield = {
  categories: {
    JAILBREAK: [/ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts)/i, /you\s+are\s+now\s+(dan|jailbroken|unrestricted)/i, /pretend\s+(there\s+are\s+)?no\s+(rules|restrictions|guardrails)/i],
    SECRET_EXTRACTION: [/(reveal|show|display|expose|print|output|tell\s+me|what\s+is)\s+.{0,30}(the\s+)?(raw\s+|actual\s+|real\s+|underlying\s+|decrypted\s+)?(value\s+of\s+)?.{0,20}(secret|api[\s_-]?key|credential|token|password|private\s+key)/i, /(print|list|dump|export|leak)\s+(all\s+)?(the\s+)?(secrets|api[\s_-]?keys|credentials|env|environment\s+variables|vault)/i, /(decrypt|unmask|decode|expand|resolve)\s+.{0,25}(shadow_secret|secret|token|credential|placeholder)/i],
    EXFILTRATION: [/send\s+.{0,40}(secret|api[\s_-]?key|credential|token|password).{0,40}(to|http|https|url|server|webhook|endpoint|email)/i, /(post|upload|forward|transmit)\s+.{0,30}(secret|key|credential|token)/i],
    TOOL_ABUSE: [/(bypass|disable|turn\s+off|override)\s+.{0,25}(firewall|security|guardrail|policy|shield|protection)/i, /use\s+.{0,20}(admin|root|sudo)\s+.{0,20}(access|privilege)/i],
    SOCIAL_ENGINEERING: [/(i\s+am|this\s+is)\s+(the\s+)?(owner|admin|developer|ceo).{0,30}(give|show|send|reveal)/i, /for\s+(debugging|testing|audit)\s+purposes.{0,30}(reveal|show|print).{0,20}(secret|key|credential)/i]
  },
  scan(text) {
    const hits = [];
    for (const [cat, pats] of Object.entries(this.categories)) {
      for (const p of pats) { if (p.test(text)) { hits.push(cat); break; } }
    }
    return { injection: hits.length > 0, categories: [...new Set(hits)] };
  }
};

// ---- Agent Firewall V2 (WHO / WHAT / WHY / RISK) ----
export const FirewallV2 = {
  assessPrompt(text, { session } = {}) {
    const inj = InjectionShield.scan(text);
    const reasons = [];
    let level = 'LOW';
    if (inj.categories.includes('EXFILTRATION') || inj.categories.includes('SECRET_EXTRACTION')) {
      level = 'CRITICAL'; reasons.push('Secret extraction / exfiltration attempt — no reveal path exists');
    } else if (inj.categories.includes('JAILBREAK') || inj.categories.includes('TOOL_ABUSE') || inj.categories.includes('SOCIAL_ENGINEERING')) {
      level = 'HIGH'; reasons.push('Prompt attempts to bypass controls (' + inj.categories.join(', ') + ')');
    } else if (/(delete|drop|truncate|destroy|wipe)\b.{0,40}\b(prod|production|database|db|table|bucket)/i.test(text)) {
      level = 'HIGH'; reasons.push('Destructive action against production data');
    }
    return { who: session || 'unknown-session', what: 'prompt-submit', why: inj.categories.join(',') || 'benign', level, reasons, injection: inj };
  },
  assessAction(action) {
    const a = (action || '').toLowerCase();
    if (/(exfil|send[\s._-]?key|reveal|export[\s._-]?secret|print[\s._-]?secret|leak)/.test(a)) return { level: 'CRITICAL', reason: 'Action would expose the raw credential' };
    if (/(delete|drop|destroy|wipe|remove).*(prod|db|database|bucket|resource)/.test(a)) return { level: 'HIGH', reason: 'Destructive resource action — human approval required' };
    if (/(write|update|modify|insert|create).*(db|database|table|record)/.test(a)) return { level: 'HIGH', reason: 'Database mutation — human approval required' };
    if (/(admin|billing|payment|transfer|charge)/.test(a)) return { level: 'MEDIUM', reason: 'Elevated-privilege scope requested' };
    if (/(chat|complete|generate|embed|read|list|models)/.test(a)) return { level: 'LOW', reason: 'Scoped read/generate action' };
    return { level: 'LOW', reason: 'Scoped action' };
  }
};

export default { detectors, classifyDatabase, classifyProvider, shannonEntropy, entropyScan, InjectionShield, FirewallV2 };
