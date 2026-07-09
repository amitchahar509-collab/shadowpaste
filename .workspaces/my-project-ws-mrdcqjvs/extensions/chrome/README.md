# ShadowPaste — Chrome Extension (Manifest V3)

Scan any GitHub repository for leaked secrets and risky AI-agent configs
via the ShadowPaste backend. Surfaces the trust score as a badge on the
extension icon, keeps the last scan in `chrome.storage.local`, and lists
the masked contents of the vault in the popup.

## Features

- **Context menu** "🛡️ Scan with ShadowPaste" on any `github.com` page or link.
- **Floating button** "🛡️ Scan AI Safety" on repo pages — click to scan the
  current `owner/name` repo via `POST /api/github/scan-real`.
- **Popup** shows:
  - Vault status — `GET /api/vault` (count of stored, masked secrets).
  - Last scan score + grade + finding counts.
  - "Open dashboard" link to the configured server URL.
  - "Re-scan last repo" shortcut.
  - Settings panel for **Server URL** (default `http://localhost:3000`)
    and optional **API key** (sent as `Authorization: Bearer …`).
- Icon badge turns green (≥80), amber (≥50), or red (<50) based on the
  latest score.

## Architecture (MV3)

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest — `activeTab`, `storage`, `scripting`, `contextMenus` permissions; `host_permissions` for `localhost:3000` and `github.com`. |
| `background.js` | Service worker. Registers the context menu, owns the `SCAN_REPO` / `GET_CONFIG` / `SET_CONFIG` / `GET_LAST_SCAN` message handlers, performs the `fetch` to `/api/github/scan-real`, persists the result to `chrome.storage.local.lastScan`, and updates the action badge. |
| `content.js` | Injected on `https://github.com/*/*`. Adds the floating "🛡️ Scan AI Safety" button, extracts `owner/name` from `location.pathname`, and routes the click to `background.js` via `chrome.runtime.sendMessage`. |
| `popup.html` / `popup.js` | The toolbar popup. Fetches vault status, reads `lastScan` from storage, lets the user configure the server URL + API key. |

The server URL is **never hardcoded** in any `fetch` — every request reads
it from `chrome.storage.local.shadowpasteServerUrl` (default
`http://localhost:3000`).

## Install (Load Unpacked)

1. Start the ShadowPaste backend:
   ```bash
   cd /home/z/my-project
   bun run dev   # serves on http://localhost:3000
   ```
2. Open `chrome://extensions` in Chrome / Edge / Brave.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** and select `/home/z/my-project/extensions/chrome`.
5. The ShadowPaste icon appears in the toolbar. Pin it for easy access.

## Usage

- Browse to any public GitHub repo page, e.g.
  `https://github.com/vercel/next.js`.
- Click the floating **🛡️ Scan AI Safety** button (bottom-right), or
  right-click anywhere on the page and choose **🛡️ Scan with ShadowPaste**.
- The badge on the toolbar icon updates with the trust score.
- Click the toolbar icon to open the popup — vault status and the last
  scan details are shown.

## Permissions explained

| Permission | Why |
|------------|-----|
| `activeTab` / `scripting` | Inject the floating scan button on github.com. |
| `storage` | Persist `lastScan`, `serverUrl`, `apiKey`, and the encrypted vault cache. |
| `contextMenus` | "Scan with ShadowPaste" right-click entry. |
| `host_permissions: localhost:3000` | Call the local ShadowPaste backend. |
| `host_permissions: github.com` | Read the repo URL from the active tab. |

No telemetry is sent anywhere except the configured ShadowPaste server.
