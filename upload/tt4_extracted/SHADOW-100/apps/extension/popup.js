// Popup — lists virtualized secrets (metadata only; never shows values).
chrome.runtime.sendMessage({ type: 'LIST' }).then((res) => {
  const list = document.getElementById('list');
  const secrets = (res && res.secrets) || [];
  if (!secrets.length) { list.innerHTML = '<div class="empty">No secrets virtualized yet.</div>'; return; }
  list.innerHTML = secrets.map(s =>
    `<div class="s"><span>${s.provider}</span><span>used ${s.usageCounter}×</span></div>`
  ).join('');
}).catch(() => {});
document.getElementById('open').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://localhost:8137/index.html' });
});
