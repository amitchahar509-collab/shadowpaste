"use strict";
// @shadowpaste/security — secret detector (LOCAL COPY for the VS Code extension).
//
// This file is a byte-for-byte port of the SELF_CONTAINED + ASSIGNMENT patterns
// from /shadow-mY6FHBQaaf9vX9xFFErIjAVvuvsag0NEaGfI.ts. The two must stay in
// sync so that "the same secret behaves the same everywhere" (Phase 1 invariant).
//
// The full @shadowpaste/security barrel cannot be imported here (the extension
// runs in a Node + VS Code context, not the Next.js bundler), so we copy only
// the detection + virtualization surface that the extension actually needs.
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectors = void 0;
exports.classifyDatabase = classifyDatabase;
exports.classifyProvider = classifyProvider;
exports.providerLabel = providerLabel;
exports.scanForSecrets = scanForSecrets;
exports.virtualizeText = virtualizeText;
exports.detectors = [
    { id: "PEM_RSA_KEY", virtualize: true, weight: 60, regex: () => /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----|-----BEGIN SHADOW PRIVATE KEY-----
MIIBshadowSwh7caE9Thi0y4bpE3Vygmg8kTHvu/OoBwGujoXyyQlOyj7ZkjkG9CB7L
+dxF59PxLaOB4mNetdt6HVqGwdlGFKc/LWtksegMWo=51XkpfCsWWi7XDoddkd1JiRdJybRCkd5Ch4bHtHiEzS8plPJ4L0Vd8Sc3hVRTvIOFtbsj+Xi3TF1evhLgDYAL3STfvcma2ohu0o
-----END SHADOW PRIVATE KEY-----/gi },
    { id: "DB_URI_STRING", virtualize: true, weight: 40, regex: () => /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
    { id: "BACKEND_URLS", virtualize: true, weight: 8, regex: () => /https?:\/\/[a-z0-9-]+\.(?:firebaseio\.com|firebaseapp\.com|supabase\.(?:co|in|net))[^\s"'<>]*/gi },
    {
        id: "CREDENTIAL_KEYS",
        virtualize: true,
        weight: 35,
        regex: () => /sk-ant-[A-Za-z0-9_-]{20,}\b|sk-(proj-)?[A-Za-z0-9_-]{8,}\b|AIza[a-zA-Z0-9_-]{10,}\b|gh[opsur]_[A-Za-z0-9]{20,}\b|github_pat_[A-Za-z0-9_]{20,}\b|AKIA[A-Z0-9]{12,20}\b|ASIA[A-Z0-9]{12,20}\b|stripe_(sk|rk)_(test|live)_[A-Za-z0-9]{8,}\b|[sr]k_(test|live)_[A-Za-z0-9]{12,}\b|glpat-[A-Za-z0-9\-]{20,}\b|hf_[A-Za-z0-9]{20,}\b|ya29\.[A-Za-z0-9_\-]{20,}|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9\-_]+\b|xox[baprmtv]-[0-9]+-[A-Za-z0-9]+\b/gi,
    },
    { id: "JWT_BEARER_TOKEN", virtualize: true, weight: 20, regex: () => /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b|\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*\b/gi },
    { id: "COOKIES_PASSWORDS", virtualize: true, weight: 15, regex: () => /\b(session_id|sid|auth_token|password|passwd|secret_password)[:= ]*[A-Za-z0-9_\-@#$!%*?&]{8,64}\b/gi },
];
function classifyDatabase(raw) {
    if (/^mongodb(\+srv)?:/i.test(raw))
        return "db.mongodb";
    if (/^postgres(ql)?:/i.test(raw))
        return "db.postgres";
    if (/^mysql:/i.test(raw))
        return "db.mysql";
    if (/^mariadb:/i.test(raw))
        return "db.mariadb";
    if (/^rediss?:/i.test(raw))
        return "db.redis";
    if (/^amqps?:/i.test(raw))
        return "db.amqp";
    if (/^s?ftp:/i.test(raw))
        return "db.ftp";
    return "db.query";
}
function classifyProvider(raw, contextHint = "") {
    const ctx = (contextHint || "").toLowerCase();
    if (/^-----BEGIN/i.test(raw))
        return { provider: "SSH", scope: "ssh.connect" };
    if (/^(mongodb(\+srv)?|postgres(ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\//i.test(raw))
        return { provider: "DATABASE", scope: classifyDatabase(raw) };
    if (/firebaseio\.com|firebaseapp\.com/i.test(raw))
        return { provider: "FIREBASE", scope: "firebase.db" };
    if (/supabase\.(co|in|net)/i.test(raw))
        return { provider: "SUPABASE", scope: "supabase.rest" };
    if (/^sk-ant-/i.test(raw))
        return { provider: "ANTHROPIC", scope: "anthropic.messages" };
    if (/^sk-(proj-)?/i.test(raw) && !/^[sr]k_(test|live)/i.test(raw))
        return { provider: "OPENAI", scope: "openai.chat" };
    if (/^hf_/i.test(raw))
        return { provider: "HUGGINGFACE", scope: "huggingface.inference" };
    if (/^ya29\./i.test(raw))
        return { provider: "OAUTH", scope: "oauth.google" };
    if (/^AIza/i.test(raw))
        return { provider: ctx.includes("firebase") ? "FIREBASE" : "GOOGLE", scope: "google.generativelanguage" };
    if (/^(ghp_|gho_|ghs_|ghu_|ghr_|github_pat_)/i.test(raw))
        return { provider: "GITHUB", scope: "github.repo" };
    if (/^glpat-/i.test(raw))
        return { provider: "GITLAB", scope: "gitlab.api" };
    if (/^AKIA/.test(raw))
        return { provider: "AWS_ACCESS_KEY", scope: "aws.sts" };
    if (/^ASIA/.test(raw))
        return { provider: "AWS_SESSION", scope: "aws.sts" };
    if (/^(stripe_)?[sr]k_(test|live)_/i.test(raw))
        return { provider: "STRIPE", scope: "stripe.charges" };
    if (/^xox[baprmtv]-/i.test(raw))
        return { provider: "SLACK", scope: "slack.chat" };
    if (/discord\.com\/api\/webhooks/i.test(raw))
        return { provider: "DISCORD", scope: "discord.webhook" };
    if (/^\d{6,10}:[A-Za-z0-9_-]{35}$/.test(raw))
        return { provider: "TELEGRAM", scope: "telegram.bot" };
    if (/^(Bearer\s|eyJ)/i.test(raw))
        return { provider: "JWT", scope: "auth.bearer" };
    if (ctx.includes("aws") && ctx.includes("secret"))
        return { provider: "AWS_SECRET_KEY", scope: "aws.sts" };
    if (ctx.includes("cloudflare"))
        return { provider: "CLOUDFLARE", scope: "cloudflare.api" };
    if (ctx.includes("vercel"))
        return { provider: "VERCEL", scope: "vercel.deploy" };
    if (ctx.includes("netlify"))
        return { provider: "NETLIFY", scope: "netlify.deploy" };
    return { provider: "ENV_SECRET", scope: "env.secret" };
}
function providerLabel(raw, ctx = "") {
    const cls = classifyProvider(raw, ctx);
    let provider = cls.provider;
    if (provider === "DATABASE") {
        const map = {
            "db.mongodb": "MONGODB", "db.postgres": "POSTGRES", "db.mysql": "MYSQL",
            "db.mariadb": "MYSQL", "db.redis": "REDIS", "db.amqp": "AMQP", "db.ftp": "FTP",
        };
        provider = map[cls.scope] || "DATABASE";
    }
    if (provider === "SSH")
        provider = "SSH_PRIVATE_KEY";
    if (provider === "GENERIC")
        provider = "ENV_SECRET";
    return { provider, scope: cls.scope === "generic.use" ? "env.shadow-uyqd671hiel8 };
}
const SEVERITY_BY_WEIGHT = {
    60: "critical", 40: "high", 35: "critical", 20: "high", 15: "medium", 8: "medium",
};
function maskEvidence(s) {
    if (s.length <= 12)
        return s.slice(0, 4) + "***";
    return s.slice(0, 8) + "..." + s.slice(-4);
}
function lineColOf(text, index) {
    const before = text.slice(0, index);
    const line = before.split("\n").length;
    const column = index - before.lastIndexOf("\n");
    return { line, column };
}
function scanForSecrets(text, contextHint = "") {
    const findings = [];
    for (const d of exports.detectors) {
        const re = d.regex();
        let m;
        while ((m = re.exec(text)) !== null) {
            const raw = m[0];
            if (raw.length < 6)
                continue;
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
            if (raw.length === 0)
                re.lastIndex++;
        }
    }
    return findings;
}
// ---- Format-preserving virtualization (replace secret spans with references) ----
const SKIP_VALUE = /^(?:true|false|null|undefined|none|example|changeme|your[_-]?\w+|xxx+|<[^>]+>|\{\{[^}]+\}\}|\[DETECTED_)/i;
function shortId(raw, salt = "") {
    let h = 0x811c9dc5;
    const s = salt + raw;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36).toUpperCase().padStart(5, "0").slice(0, 5);
}
function virtualizeText(text, opts = {}) {
    const mode = opts.mode || "PROTECT";
    const salt = opts.salt || "";
    if (typeof text !== "string" || text.length === 0)
        return { text: text ?? "", count: 0, findings: [], raws: [] };
    const spans = [];
    const pushSpan = (start, end, raw) => {
        if (!raw || raw.length < 6)
            return;
        if (SKIP_VALUE.test(raw))
            return;
        if (raw.includes("SHADOW_SECRET") || raw.includes("DETECTED_"))
            return;
        spans.push({ start, end, raw });
    };
    // Self-contained
    const SELF = [
        { re: () => /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----|-----BEGIN SHADOW PRIVATE KEY-----
MIIBshadowzadR1L8n5OmhKMUiWXNuVCcjPT0og7LoJCMmd=N=xOQKKIslkZ5KyXqQLdGQ3YEUU+G82Aa=sCHkcmB26IxaRqGYBJbh2FYhg0=XZhMrkpMhVCW67eRc1mU2jBuA94dU9=ZltTY6fNSbMhqz3Dk4yKLaU1aDafVFYbHimKcoUacQpJS8TMCKiGFW93Vop2VFmChe
Qdn
-----END SHADOW PRIVATE KEY-----/g },
        { re: () => /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
        { re: () => /sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,}|AIza[A-Za-z0-9_-]{20,}|gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9\-]{20,}|AKIA[A-Z0-9]{12,20}|ASIA[A-Z0-9]{12,20}|(?:stripe_)?[sr]k_(?:test|live)_[A-Za-z0-9]{16,}|xox[baprmtv]-[0-9A-Za-z-]{10,}|hf_[A-Za-z0-9]{20,}|ya29\.[A-Za-z0-9_\-]{20,}|https:\/\/discord\.com\/api\/webhooks\/[0-9]+\/[A-Za-z0-9\-_]+/gi },
        { re: () => /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
    ];
    for (const d of SELF) {
        const re = d.re();
        let m;
        while ((m = re.exec(text)) !== null) {
            pushSpan(m.index, m.index + m[0].length, m[0]);
            if (m[0].length === 0)
                re.lastIndex++;
        }
    }
    // Assignment
    const ASSIGN = [
        { re: () => /((?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|apikey|access[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|private[_-]?key|db[_-]?pass(?:word)?|aws_secret_access_key|session[_-]?id|cookie|token)\s*[:=]\s*["']?)([^\s"'`,;]{6,512})/gi },
        { re: () => /((?:authorization\s*:?\s*)?bearer\s+)([A-Za-z0-9\-._~+/]{12,}=*)/gi },
    ];
    for (const d of ASSIGN) {
        const re = d.re();
        let m;
        while ((m = re.exec(text)) !== null) {
            const valStart = m.index + m[1].length;
            pushSpan(valStart, valStart + m[2].length, m[2]);
            if (m[0].length === 0)
                re.lastIndex++;
        }
    }
    if (spans.length === 0)
        return { text, count: 0, findings: [], raws: [] };
    spans.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const chosen = [];
    let lastEnd = -1;
    for (const s of spans) {
        if (s.start >= lastEnd) {
            chosen.push(s);
            lastEnd = s.end;
        }
    }
    const refByRaw = new Map();
    const findings = [];
    const raws = [];
    const refFor = (raw) => {
        if (refByRaw.has(raw))
            return refByRaw.get(raw);
        const { provider } = providerLabel(raw, salt);
        const token = mode === "TEST"
            ? `[DETECTED_${provider}_SECRET]`
            : `{{SHADOW_SECRET_${provider}_${shortId(raw, salt)}}}`;
        refByRaw.set(raw, token);
        findings.push({ provider, reference: token, occurrences: 0, length: raw.length });
        raws.push({ raw, provider, reference: token });
        return token;
    };
    let out = "";
    let cursor = 0;
    for (const s of chosen) {
        const token = refFor(s.raw);
        out += text.slice(cursor, s.start) + token;
        cursor = s.end;
        const f = findings.find((x) => x.reference === token);
        if (f)
            f.occurrences++;
    }
    out += text.slice(cursor);
    return { text: out, count: chosen.length, findings, raws };
}
//# sourceMappingURL=detector.js.map