# apps/web-next — React + R3F command center (companion, NOT built here)

**Honest status:** this is the requested React/TypeScript/React-Three-Fiber architecture, provided as
**real source you build with Node** (`npm create vite@latest`, then add the deps below). It was **not built
or run in the authoring environment** (no Node/npm available there). The **verified, running** implementation
is the vanilla WebGL version in `../../index.html` (`NeuralCommandCenter` IIFE + Three.js via CDN) — that one
is confirmed rendering, mouse-parallax, pulse-animated, and bound to real runtime data with a
"waiting for runtime" fallback.

## Requested architecture → where it lives
| Component | This scaffold | Verified equivalent (running) |
|---|---|---|
| `NeuralBackground3D` | `components/NeuralBackground3D.tsx` (complete R3F port) | index.html `#neuralCanvas` scene |
| `SecurityDashboard` | bind to `ShadowPasteRuntime.dashboard()` | index.html hero cards + Security Analytics |
| `AgentGraph` | port `#agentNetSection` SVG to `<Canvas>` nodes | index.html AI Agent Network |
| `VaultPanel` | read `ShadowPasteRuntime.listSecrets()` | index.html Secret Vault |
| `RuntimeFlow` | port the pipeline CSS to Framer Motion | index.html Runtime Execution Flow |
| `CommandCenter` | compose the above | index.html hero + console |

## Build it yourself
```bash
npm create vite@latest web-next -- --template react-ts
cd web-next && npm i three @react-three/fiber @react-three/drei framer-motion
# drop components/NeuralBackground3D.tsx in, import the SAME security packages from ../../packages
```

## Data rule (unchanged)
Every panel binds to **real** values via `window.ShadowPasteRuntime` (or the `packages/runtime` façade).
When a value is unavailable, render **"waiting for runtime"** — never a fabricated number. The vanilla hero
already implements exactly this; mirror it.
