// ShadowPaste Chrome extension — content script.
//
// Injected on https://github.com/*/* (repo pages). Adds a floating
// "🛡️ Scan AI Safety" button fixed to the bottom-right corner. Clicking it
// extracts the owner/name from location.pathname and asks the background
// service worker to run POST /api/github/scan-real. Results + status are
// surfaced via a non-blocking toast.
//
// Also renders background notifications (notify() from background.js) as toasts.

(() => {
  // Avoid double-injection on SPA route changes.
  if (window.__shadowpasteInjected) return;
  window.__shadowpasteInjected = true;

  // ---- Toast helper ----
  function toast(message, opts = {}) {
    const t = document.createElement("div");
    t.textContent = message;
    const bg = opts.warn
      ? "#ef4444"
      : opts.ok
      ? "linear-gradient(135deg,#10b981,#059669)"
      : "linear-gradient(135deg,#0ea5e9,#2563eb)";
    t.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "right:24px",
      "z-index:2147483647",
      "padding:10px 16px",
      "border-radius:12px",
      "font:600 13px system-ui,-apple-system,sans-serif",
      "color:#fff",
      `background:${bg}`,
      "box-shadow:0 12px 30px rgba(0,0,0,.25)",
      "max-width:340px",
    ].join(";");
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  }

  // ---- Extract owner/name from the current github.com URL ----
  function currentRepo() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    // Skip non-repo routes (settings, orgs, etc.)
    if (["settings", "orgs", "notifications", "search", "explore"].includes(parts[0])) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  // ---- The floating scan button ----
  let btn = null;
  function ensureButton() {
    if (btn && document.body.contains(btn)) return;
    if (!currentRepo()) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "🛡️ Scan AI Safety";
    btn.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "right:24px",
      "z-index:2147483646",
      "padding:10px 16px",
      "border:0",
      "border-radius:999px",
      "font:700 13px system-ui,-apple-system,sans-serif",
      "color:#fff",
      "background:linear-gradient(135deg,#0ea5e9,#2563eb)",
      "box-shadow:0 12px 30px rgba(0,0,0,.30)",
      "cursor:pointer",
      "transition:transform .15s ease",
    ].join(";");
    btn.addEventListener("mouseenter", () => (btn.style.transform = "translateY(-2px)"));
    btn.addEventListener("mouseleave", () => (btn.style.transform = "translateY(0)"));
    btn.addEventListener("click", onScanClick);
    document.body.appendChild(btn);
  }

  async function onScanClick() {
    const repo = currentRepo();
    if (!repo) return toast("Not on a GitHub repo page.", { warn: true });
    if (btn) {
      btn.disabled = true;
      btn.textContent = "🛡️ Scanning…";
    }
    toast(`ShadowPaste: scanning ${repo} …`);
    try {
      const res = await chrome.runtime.sendMessage({ type: "SCAN_REPO", repo });
      if (res && res.ok) {
        toast(`ShadowPaste: ${repo} → score ${res.score} (${res.grade || "?"}) · ${res.findingsCount} findings`, { ok: true });
      } else {
        toast(`ShadowPaste scan failed: ${(res && res.error) || "unknown"}`, { warn: true });
      }
    } catch (e) {
      toast(`ShadowPaste error: ${e && e.message ? e.message : e}`, { warn: true });
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "🛡️ Scan AI Safety";
      }
    }
  }

  // ---- Render background notifications as toasts ----
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "NOTIFY") {
      const text = msg.message ? `${msg.title} — ${msg.message}` : msg.title;
      toast(text);
    }
  });

  // ---- Mount the button + re-mount on SPA navigations ----
  ensureButton();
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (btn) {
        btn.remove();
        btn = null;
      }
      ensureButton();
    }
  }, 800);

  console.info("[ShadowPaste] content script active on", location.host);
})();
