// ShadowPaste extension — content script.
// Intercepts the AI composer on ChatGPT / Claude / Gemini / Grok. Before a prompt
// is sent, it scans the text, virtualizes any secrets (via the background vault),
// and rewrites the composer so the model receives only capability references.
// After a response renders, it checks for accidental raw-secret echo.

(() => {
  const SEND_KEYS = (e) => e.key === 'Enter' && !e.shiftKey && !e.isComposing;
  let busy = false;

  function composer() {
    return document.querySelector(
      'textarea[data-testid], textarea#prompt-textarea, div[contenteditable="true"], textarea[placeholder], rich-textarea .ql-editor'
    );
  }
  function readText(el) { return el.value != null ? el.value : el.innerText; }
  function writeText(el, text) {
    if (el.value != null) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.innerText = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  }

  async function shield(el) {
    if (busy) return true;
    const text = readText(el);
    if (!text || !text.trim()) return true;
    busy = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'VIRTUALIZE', text });
      if (res && res.count > 0) {
        writeText(el, res.text);
        toast(`ShadowPaste: ${res.count} secret${res.count > 1 ? 's' : ''} virtualized before send`);
        return false; // block THIS send; user reviews & resends the safe text
      }
      return true;
    } finally { busy = false; }
  }

  // Intercept Enter-to-send at capture phase so we run before the site's handler.
  document.addEventListener('keydown', async (e) => {
    const el = composer();
    if (!el || e.target !== el || !SEND_KEYS(e)) return;
    const safe = await shield(el);
    if (!safe) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Also intercept clicks on the send button.
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-testid*="send"], button[aria-label*="Send"], button[type="submit"]');
    const el = composer();
    if (!btn || !el) return;
    const safe = await shield(el);
    if (!safe) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  // Passive leakage watch on rendered responses.
  const obs = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1 && n.innerText && n.innerText.length > 20) {
          chrome.runtime.sendMessage({ type: 'CHECK_LEAK', text: n.innerText }).then((r) => {
            if (r && r.leak) toast('⚠ ShadowPaste: response appears to contain a raw secret pattern', true);
          }).catch(() => {});
        }
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  function toast(msg, warn) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:2147483647;padding:10px 16px;border-radius:12px;font:600 12px system-ui;color:#fff;background:${warn ? '#bd4f4f' : 'linear-gradient(135deg,#948ff3,#6c63d9)'};box-shadow:0 12px 30px rgba(0,0,0,.25)`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  console.info('[ShadowPaste] credential shield active on', location.host);
})();
