// @shadowpaste/engine — V12 format-preserving virtualization engine.
//
// Contract: given arbitrary source text (a .env, JSON, YAML, source file, or an
// entire concatenated project), replace ONLY the secret substrings and leave
// every other byte — indentation, newlines, comments, quotes, key names,
// surrounding structure — exactly as it was.
//
// It never reformats. It only slices out detected secret spans and splices in a
// reference (PROTECT) or a detector label (TEST). Overlapping matches are
// resolved deterministically (earliest start, then longest) so one secret is
// never double-replaced or a key name clipped.

import { classifyProvider, classifyDatabase } from '../security/index.mjs';

// ---- Provider label refinement (removes the weak GENERIC fallback) ----
// classifyProvider stays the single classification source; we only refine the
// human/label layer the vault + UI show.
export function providerLabel(raw, ctx = '') {
  const cls = classifyProvider(raw, ctx);
  let provider = cls.provider;
  if (provider === 'DATABASE') {
    const map = { 'db.mongodb': 'MONGODB', 'db.postgres': 'POSTGRES', 'db.mysql': 'MYSQL',
      'db.mariadb': 'MYSQL', 'db.redis': 'REDIS', 'db.amqp': 'AMQP', 'db.ftp': 'FTP' };
    provider = map[cls.scope] || 'DATABASE';
  }
  if (provider === 'SSH') provider = 'SSH_PRIVATE_KEY';
  if (provider === 'GENERIC') provider = 'ENV_SECRET';   // no weak generic fallback
  return { provider, scope: cls.scope === 'generic.use' ? 'env.secret' : cls.scope };
}

// ---- Detectors ----
// Two families:
//  (a) SELF_CONTAINED — the match IS the secret; replace the whole match.
//  (b) ASSIGNMENT      — key = "value"; replace ONLY the value (group `valGroup`).
const TELEGRAM = /\b\d{6,10}:[A-Za-z0-9_-]{35}\b/g;

const SELF_CONTAINED = [
  // PEM / SSH private keys and certificates (multi-line block)
  { id: 'PEM', re: () => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----|-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g },
  // Database / broker connection URIs (whole URI is sensitive)
  { id: 'DB_URI', re: () => /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
  // Vendor-shaped API keys / tokens
  { id: 'VENDOR', re: () => /sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9\-]{20,}|AKIA[A-Z0-9]{12,20}|ASIA[A-Z0-9]{12,20}|(?:stripe_)?[sr]k_(?:test|live)_[A-Za-z0-9]{16,}|xox[baprmtv]-[0-9A-Za-z-]{10,}|hf_[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9_\-]{20,}|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9\-_]+/gi },
  // Telegram bot token
  { id: 'TELEGRAM', re: () => new RegExp(TELEGRAM.source, 'g') },
  // Standalone JWT (the token itself; the word "Bearer" is handled by ASSIGNMENT)
  { id: 'JWT', re: () => /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g }
];

// Assignment / header / config detectors — capture the VALUE only.
// group 1 = prefix (key + operator + optional opening quote), group 2 = value.
const ASSIGNMENT = [
  // KEY = "value" / key: 'value' — secret-ish key names, quoted or bare.
  { id: 'KV',
    re: () => /((?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|private[_-]?key|db[_-]?pass(?:word)?|aws_secret_access_key|session[_-]?id|cookie|token)\s*[:=]\s*["']?)([^\s"'`,;]{6,512})/gi },
  // Authorization: Bearer <token>  → keep the header + "Bearer ", replace token
  { id: 'BEARER',
    re: () => /((?:authorization\s*:?\s*)?bearer\s+)([A-Za-z0-9\-._~+/]{12,}=*)/gi }
];

const SKIP_VALUE = /^(?:true|false|null|undefined|none|example|changeme|your[_-]?\w+|xxx+|<[^>]+>|\{\{[^}]+\}\}|\[DETECTED_)/i;

// Deterministic short id derived from the raw secret so the same secret always
// maps to the same reference within one document (stable, non-reversible).
function shortId(raw, salt = '') {
  let h = 0x811c9dc5;
  const s = salt + raw;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36).toUpperCase().padStart(5, '0').slice(0, 5);
}

/**
 * Virtualize secrets in `text` without altering any other byte.
 * @param {string} text
 * @param {object} opts
 * @param {'PROTECT'|'TEST'} opts.mode  PROTECT → {{SHADOW_SECRET_P_ID}};  TEST → [DETECTED_P_SECRET]
 * @param {string} opts.salt  optional per-session salt for reference ids
 * @returns {{ text:string, count:number, findings:Array }}
 */
export function virtualizeText(text, { mode = 'PROTECT', salt = '' } = {}) {
  if (typeof text !== 'string' || text.length === 0) return { text: text ?? '', count: 0, findings: [] };

  const spans = []; // { start, end, raw }
  const pushSpan = (start, end, raw) => {
    if (!raw || raw.length < 6) return;
    if (SKIP_VALUE.test(raw)) return;
    if (raw.includes('SHADOW_SECRET') || raw.includes('DETECTED_')) return;
    spans.push({ start, end, raw });
  };

  for (const d of SELF_CONTAINED) {
    const re = d.re(); let m;
    while ((m = re.exec(text)) !== null) {
      pushSpan(m.index, m.index + m[0].length, m[0]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  for (const d of ASSIGNMENT) {
    const re = d.re(); let m;
    while ((m = re.exec(text)) !== null) {
      const valStart = m.index + m[1].length;
      pushSpan(valStart, valStart + m[2].length, m[2]);
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  if (spans.length === 0) return { text, count: 0, findings: [] };

  // Resolve overlaps: earliest start wins, then longest.
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const chosen = [];
  let lastEnd = -1;
  for (const s of spans) {
    if (s.start >= lastEnd) { chosen.push(s); lastEnd = s.end; }
  }

  // Stable reference per unique raw value.
  const refByRaw = new Map();
  const findings = [];
  const refFor = (raw) => {
    if (refByRaw.has(raw)) return refByRaw.get(raw);
    const { provider } = providerLabel(raw);
    const token = mode === 'TEST'
      ? `[DETECTED_${provider}_SECRET]`
      : `{{SHADOW_SECRET_${provider}_${shortId(raw, salt)}}}`;
    refByRaw.set(raw, token);
    findings.push({ provider, reference: token, occurrences: 0, length: raw.length });
    return token;
  };

  // Splice from left to right — everything outside chosen spans is copied verbatim.
  let out = '', cursor = 0;
  for (const s of chosen) {
    const token = refFor(s.raw);
    out += text.slice(cursor, s.start) + token;
    cursor = s.end;
    const f = findings.find(x => x.reference === token); if (f) f.occurrences++;
  }
  out += text.slice(cursor);

  return { text: out, count: chosen.length, findings };
}

/**
 * AI-compatibility preamble. Prepend this to virtualized text so the model
 * treats `{{SHADOW_SECRET_*}}` as an intentional, resolvable reference rather
 * than missing data it should ask the user to fill in.
 */
export function aiPreamble() {
  return [
    'NOTE FOR THE AI ASSISTANT:',
    'This project was processed by ShadowPaste. Any token of the form',
    '`{{SHADOW_SECRET_<PROVIDER>_<ID>}}` is a live, encrypted credential reference —',
    'it is NOT missing data. Do the following:',
    '- Treat each reference as a valid secret that exists at runtime.',
    '- Do NOT ask the user to paste the real key, and do NOT invent a placeholder.',
    '- Keep every reference exactly as written when you edit or return the code.',
    '- Continue implementing normally; the real value is injected by the ShadowPaste runtime.',
    ''
  ].join('\n');
}

/** True if any raw secret still survives in `serialized` (export-safety guard). */
export function containsAnyRaw(serialized, rawSecrets) {
  const blob = typeof serialized === 'string' ? serialized : JSON.stringify(serialized);
  return rawSecrets.some(r => r && blob.includes(r));
}

export default { virtualizeText, providerLabel, containsAnyRaw, aiPreamble };
