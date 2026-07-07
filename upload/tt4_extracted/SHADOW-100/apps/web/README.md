# apps/web

The canonical web app is the single-file **`../../index.html`** at the repo root
(kept there so the existing static-server / preview workflow and the service-worker
scope at `./` continue to work unchanged).

It embeds the same logic that `packages/*` exposes as isomorphic modules:
- crypto  → AES-GCM vault, HMAC capability signing
- security → detectors, classifier, entropy, Firewall V2, injection shield
- gateway  → capability validation + in-scope execution

To run: serve the repo root over https/localhost and open `index.html`.
A future refactor can replace the inline `<script>` with `import`s from `packages/`
without behavior change — the module APIs are already aligned.
