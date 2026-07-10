// ShadowPaste Chrome extension — background service worker (MV3).
//
// Responsibilities:
//   1. Register a context-menu item "Scan with ShadowPaste" on github.com pages.
//   2. Listen for SCAN_REPO messages from content.js / popup.js.
//   3. Call POST {serverUrl}/api/github/scan-real with { repo: "owner/name" }.
//   4. Persist the scan result in chrome.storage.local under `lastScan`.
//   5. Expose a CONFIG message so content/popup can read the configured server URL.
//
// The server URL is configurable via chrome.storage.local.shadowpasteServerUrl
// (default http://localhost:3000). The popup writes it; this worker reads it.
// NO absolute URL is hardcoded in the fetch — the host always comes from settings.

const DEFAULT_SERVER_URL = "http://localhost:3000";

// ---- Context menu registration (runs once on install / startup) ----
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "scan-with-shadowpaste",
    title: "🛡️ Scan with ShadowPaste",
    documentUrlPatterns: ["https://github.com/*/*"],
    contexts: ["page", "link", "selection"],
  });
});

// ---- Helpers ----
async function getServerUrl() {
  const { shadowpasteServerUrl } = await chrome.storage.local.get("shadowpasteServerUrl");
  const url = (shadowpasteServerUrl || DEFAULT_SERVER_URL).trim().replace(/\/+$/, "");
  return url;
}

async function getApiKey() {
  const { shadowpasteApiKey } = await chrome.storage.local.get("shadowpasteApiKey");
  return shadowpasteApiKey || "";
}

// Extract "owner/name" from a github.com URL. Returns null if not a repo page.
function extractRepoFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
    // repo URLs look like /owner/name, /owner/name/tree/..., /owner/name/blob/...
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

// ---- Core scan action ----
async function scanRepo(repo) {
  if (!repo) return { ok: false, error: "No repo (owner/name) provided." };
  const serverUrl = await getServerUrl();
  const apiKey = await getApiKey();
  const endpoint = `${serverUrl}/api/github/scan-real`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ repo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    // Persist the result for the popup + badge.
    await chrome.storage.local.set({
      lastScan: {
        repo,
        score: data.score ?? null,
        grade: data.grade ?? null,
        filesScanned: data.filesScanned ?? 0,
        secretsCount: data.secretsCount ?? 0,
        vaultedCount: data.vaultedCount ?? 0,
        findingsCount: Array.isArray(data.findings) ? data.findings.length : 0,
        scannedAt: Date.now(),
      },
    });
    // Badge: green if score>=80, amber if >=50, red otherwise.
    const score = data.score ?? 0;
    const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text: String(score) });
    return { ok: true, score, grade: data.grade, findingsCount: Array.isArray(data.findings) ? data.findings.length : 0 };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// ---- Context-menu handler ----
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "scan-with-shadowpaste") return;
  // Prefer linkUrl (right-click on a repo link), fall back to the page URL.
  const target = info.linkUrl || info.pageUrl || (tab && tab.url) || "";
  const repo = extractRepoFromUrl(target);
  if (!repo) {
    notify(tab && tab.id, "ShadowPaste: not a GitHub repo URL", target);
    return;
  }
  notify(tab && tab.id, `ShadowPaste: scanning ${repo} …`, "");
  const res = await scanRepo(repo);
  if (res.ok) {
    notify(
      tab && tab.id,
      `ShadowPaste: ${repo} → score ${res.score} (${res.grade || "?"})`,
      `${res.findingsCount} findings`
    );
  } else {
    notify(tab && tab.id, `ShadowPaste: scan failed`, res.error || "unknown error");
  }
});

// ---- Message router (content.js + popup.js talk to us here) ----
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "SCAN_REPO") {
      sendResponse(await scanRepo(msg.repo));
    } else if (msg.type === "GET_CONFIG") {
      sendResponse({
        serverUrl: await getServerUrl(),
        apiKey: await getApiKey(),
      });
    } else if (msg.type === "SET_CONFIG") {
      const patch = {};
      if (typeof msg.serverUrl === "string") patch.shadowpasteServerUrl = msg.serverUrl;
      if (typeof msg.apiKey === "string") patch.shadowpasteApiKey = msg.apiKey;
      await chrome.storage.local.set(patch);
      sendResponse({ ok: true });
    } else if (msg.type === "GET_LAST_SCAN") {
      const { lastScan } = await chrome.storage.local.get("lastScan");
      sendResponse({ lastScan: lastScan || null });
    } else {
      sendResponse({ error: "unknown message type" });
    }
  })();
  return true; // async response
});

// ---- Tiny helper: surface a notification on the active tab ----
function notify(tabId, title, message) {
  if (typeof tabId !== "number") return;
  chrome.tabs.sendMessage(tabId, { type: "NOTIFY", title, message }).catch(() => {
    /* tab may not have content.js — ignore */
  });
}
