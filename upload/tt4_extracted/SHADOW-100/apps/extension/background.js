// ShadowPaste extension — background service worker (Secret Interceptor + Vault + Gateway).
// Self-contained: WebCrypto AES-GCM vault in chrome.storage.local; same detection
// patterns as @shadowpaste/security. Content scripts talk to it via runtime messages.
// No secret is ever sent back to a content script — only capability references.

const enc = new TextEncoder(), dec = new TextDecoder();
const subtle = crypto.subtle;

const DETECTORS = [
  { id: 'DB_URI', re: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|rediss?|amqps?|s?ftp):\/\/[^\s:@/]*:[^\s@/]+@[^\s/]+(?::\d+)?(?:\/[^\s"'<>]*)?/gi },
  { id: 'KEYS', re: /sk-ant-[A-Za-z0-9_-]{20,}|sk-(proj-)?[A-Za-z0-9_-]{8,}|AIza[a-zA-Z0-9_-]{10,}|gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{12,20}|hf_[A-Za-z0-9]{20,}|xox[baprmtv]-[0-9]+-[A-Za-z0-9]+|[sr]k_(test|live)_[A-Za-z0-9]{12,}/gi },
  { id: 'JWT', re: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_=]*/gi }
];

function classify(raw) {
  if (/^(mongodb|postgres|mysql|mariadb|redis|amqp|ftp|sftp)/i.test(raw)) return 'DATABASE';
  if (/^sk-ant-/i.test(raw)) return 'ANTHROPIC';
  if (/^sk-/i.test(raw)) return 'OPENAI';
  if (/^AIza/i.test(raw)) return 'GOOGLE';
  if (/^gh[opsur]_|^github_pat_/i.test(raw)) return 'GITHUB';
  if (/^AKIA/.test(raw)) return 'AWS_ACCESS_KEY';
  if (/^hf_/i.test(raw)) return 'HUGGINGFACE';
  if (/^xox/i.test(raw)) return 'SLACK';
  if (/^eyJ/.test(raw)) return 'JWT';
  return 'GENERIC';
}

async function getKey() {
  const { __jwk } = await chrome.storage.local.get('__jwk');
  if (__jwk) return subtle.importKey('jwk', __jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  const k = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  await chrome.storage.local.set({ __jwk: await subtle.exportKey('jwk', k) });
  return k;
}
async function encryptSecret(raw) {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(raw));
  return { iv: Array.from(iv), cipher: btoa(String.fromCharCode(...new Uint8Array(cipher))) };
}
function ref(provider) { return `{{SHADOW_SECRET_${provider}_${Math.random().toString(36).slice(2, 7).toUpperCase()}}}`; }

// Virtualize all secrets in a block of text; store encrypted; return safe text + count.
async function virtualize(text) {
  const store = (await chrome.storage.local.get('vault')).vault || {};
  let count = 0;
  for (const d of DETECTORS) {
    const matches = [...new Set(text.match(d.re) || [])];
    for (const raw of matches) {
      const provider = classify(raw);
      const reference = ref(provider);
      store[reference] = { provider, ...(await encryptSecret(raw)), createdAt: Date.now(), usageCounter: 0 };
      text = text.split(raw).join(reference);
      count++;
    }
  }
  await chrome.storage.local.set({ vault: store });
  return { text, count };
}

// Leakage check on AI responses: does the model echo a raw-looking secret back?
// NOTE: DETECTORS use the /g flag, so `.test()` advances `lastIndex` and persists it
// between calls — reusing the shared regex objects here would make the MutationObserver
// (which fires many times) intermittently start mid-string and miss a leak. Clone each
// pattern without /g so every check is stateless and deterministic.
function checkLeak(text) {
  return DETECTORS.some(d => new RegExp(d.re.source, d.re.flags.replace('g', '')).test(text));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === 'VIRTUALIZE') sendResponse(await virtualize(msg.text || ''));
    else if (msg.type === 'CHECK_LEAK') sendResponse({ leak: checkLeak(msg.text || '') });
    else if (msg.type === 'LIST') {
      const v = (await chrome.storage.local.get('vault')).vault || {};
      sendResponse({ secrets: Object.entries(v).map(([reference, r]) => ({ reference, provider: r.provider, usageCounter: r.usageCounter })) });
    } else sendResponse({ error: 'unknown message' });
  })();
  return true; // async
});
