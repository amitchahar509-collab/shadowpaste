// ShadowPaste Chrome extension — popup.
//
// Shows:
//   1. Vault status — GET {serverUrl}/api/vault → count of stored (masked) secrets.
//   2. Last scan score — read from chrome.storage.local.lastScan (written by background.js).
//   3. Open dashboard link — opens {serverUrl}/ in a new tab.
//   4. Re-scan button — re-runs SCAN_REPO for the last scanned repo.
//   5. Settings — serverUrl + apiKey (stored in chrome.storage.local).
//
// All HTTP calls use the configured serverUrl — never a hardcoded absolute URL.

const el = (id) => document.getElementById(id);

function gradeClass(score) {
  if (score == null) return "";
  if (score >= 80) return "";
  if (score >= 50) return "warn";
  return "danger";
}

// ---- Load settings → populate inputs ----
chrome.runtime.sendMessage({ type: "GET_CONFIG" }, (cfg) => {
  if (!cfg) return;
  el("serverUrl").value = cfg.serverUrl || "";
  el("apiKey").value = cfg.apiKey || "";
  refreshVault(cfg.serverUrl);
});

// ---- Vault status ----
async function refreshVault(serverUrl) {
  const url = (serverUrl || "http://localhost:3000").replace(/\/+$/, "");
  el("conn").textContent = "…";
  try {
    const res = await fetch(`${url}/api/vault`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const count = data.count ?? (Array.isArray(data.secrets) ? data.secrets.length : 0);
    el("vault").innerHTML = `
      <span class="value">${count}</span>
      <span class="label">secrets in vault</span>
    `;
    el("conn").textContent = "connected";
    el("conn").style.background = "rgba(16,185,129,.25)";
  } catch (e) {
    el("vault").innerHTML = `<span class="empty">Cannot reach ${url}</span>`;
    el("conn").textContent = "offline";
    el("conn").style.background = "rgba(239,68,68,.25)";
  }
}

function authHeaders() {
  // apiKey is set asynchronously; read synchronously from the input if available.
  const k = el("apiKey") && el("apiKey").value;
  return k ? { Authorization: `Bearer ${k}` } : {};
}

// ---- Last scan ----
chrome.runtime.sendMessage({ type: "GET_LAST_SCAN" }, ({ lastScan }) => {
  if (!lastScan) {
    el("scan").innerHTML = `<span class="empty">No scan yet — open a GitHub repo and click 🛡️.</span>`;
    return;
  }
  const score = lastScan.score;
  const cls = gradeClass(score);
  el("scan").innerHTML = `
    <span>
      <span class="value score">${score ?? "—"}</span>
      ${lastScan.grade ? `<span class="grade ${cls}">${lastScan.grade}</span>` : ""}
    </span>
    <span class="label">${lastScan.repo}</span>
  `;
  const when = new Date(lastScan.scannedAt).toLocaleString();
  el("scanMeta").textContent =
    `${lastScan.findingsCount} findings · ${lastScan.secretsCount} secrets · ${lastScan.vaultedCount} vaulted · ${lastScan.filesScanned} files · ${when}`;
});

// ---- Open dashboard ----
el("open").addEventListener("click", async (e) => {
  e.preventDefault();
  const cfg = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "GET_CONFIG" }, resolve)
  );
  const url = (cfg && cfg.serverUrl || "http://localhost:3000").replace(/\/+$/, "");
  chrome.tabs.create({ url });
});

// ---- Re-scan last repo ----
el("rescan").addEventListener("click", async (e) => {
  e.preventDefault();
  const { lastScan } = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "GET_LAST_SCAN" }, resolve)
  );
  if (!lastScan || !lastScan.repo) {
    el("scanMeta").textContent = "No previous repo to re-scan.";
    return;
  }
  el("scanMeta").textContent = `Scanning ${lastScan.repo} …`;
  const res = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: "SCAN_REPO", repo: lastScan.repo }, resolve)
  );
  if (res && res.ok) {
    el("scanMeta").textContent = `Done: score ${res.score} (${res.grade || "?"}) — reopen popup to refresh.`;
  } else {
    el("scanMeta").textContent = `Failed: ${(res && res.error) || "unknown"}`;
  }
});

// ---- Save settings ----
el("save").addEventListener("click", () => {
  const serverUrl = el("serverUrl").value.trim();
  const apiKey = el("apiKey").value.trim();
  chrome.runtime.sendMessage({ type: "SET_CONFIG", serverUrl, apiKey }, () => {
    el("cfgErr").textContent = "";
    refreshVault(serverUrl);
    el("cfgErr").style.color = "var(--accent)";
    el("cfgErr").textContent = "Saved.";
    setTimeout(() => (el("cfgErr").textContent = ""), 2000);
  });
});
