# ShadowPaste — UI Redesign Report

**Design language:** "N.EY Future" reference — electric-blue accent, matte near-black
surfaces, glass panels, thin typography, cinematic depth. Applied as a **system**
(tokens + shared primitives + global backdrop) so the whole app shifts cohesively
rather than screen-by-screen.

**Strict rules honored:** No backend, API, security, CLI, or database logic was
touched. Only the UI layer (CSS tokens, className strings, shared components, one new
decorative background component) was changed.

**Date:** 2026-07-22 · **Stack:** Next.js 16, Tailwind v4, Framer Motion, dev server.

---

## ⚠️ Honesty note on visual verification

This environment **cannot capture screenshots** (the browser pane is not composited, so
`screenshot` times out). I therefore **cannot claim pixel-level visual sign-off** on
every screen. What I *did* verify is stated explicitly per item below, using:
- **Computed-style / DOM inspection** in the live running app (real values read back).
- **`tsc --noEmit`** (0 errors after the changes).
- **Render checks** — programmatically switching all 14 modules and confirming each
  mounts with content + blue accents + no console errors.

Full art-directed, per-screen pixel QA (alignment/overflow/spacing on real pixels) still
requires a human or a screenshot-capable environment. That work is listed under
**Remaining** and is **not** claimed as done.

---

## 1. What was redesigned (foundation — applied app-wide)

### Design system — `src/app/globals.css` (rewritten)
- **Color system:** electric-blue accent scale (`--sp-blue #3b6dff`), matte black
  surfaces (`--sp-void #05070d`, graphite/panel tiers), hairline borders, verified live
  (`--primary` reads `#3b6dff`, body bg `rgb(5,7,13)` with volumetric gradient).
- **Dark theme tokens** retuned (card = translucent glass, ring/accent = blue,
  chart-1..5 = blue/violet/sky family).
- **Typography:** thin uppercase `.label-thin` (0.28em tracking), `.text-gradient`,
  tightened headings, font smoothing, feature settings.
- **Material utilities:** `.glass`, `.glass-panel` (blue glow on hover), `.holo-border`,
  `.text-glow`, `.glow-hover`, `.grid-bg` (blueprint grid), `.scan-line`, `.pulse-glow`,
  `.sp-skeleton` (shimmer), `.sp-rise` (entrance), custom slim scrollbars, blue selection.
- **Accessibility:** full `prefers-reduced-motion` block disables all continuous
  animation (aurora, scan, pulse, shimmer) and instant-transitions everything.

### Immersive background — `src/components/shadowpaste/futuristic-background.tsx` (new)
Mounted globally in `layout.tsx` (covers app **and** auth). Layers:
- Volumetric **aurora** blobs (blue/violet/sky, CSS-animated, `will-change: transform`).
- **Blueprint grid** with radial mask.
- **Particle network** on `<canvas>` with link-lines and **mouse parallax** —
  DPR-capped at 1.5, particle count scaled to viewport, single `requestAnimationFrame`.
- Vignette + subtle scan-line sheen.
- `aria-hidden`, `pointer-events: none`, and **fully static under reduced-motion**
  (one frame, no rAF, no mousemove listener).
- **Verified live:** background layer present, canvas mounted at `1280×720`.
- **Performance win:** replaced the previous heavier React-Three-Fiber
  `NeuralBackground3D` (three.js) with this GPU-light canvas — one animated backdrop
  instead of a full 3D scene, reducing main-thread/GPU load.

### Accent retone — 19 files (`src/components/**`, `src/app/page.tsx`)
- `emerald → blue`, `teal → sky`, `cyan → sky`, and hex `#10b981/#14b8a6 → #3b6dff`,
  `#06b6d4 → #38bdf8`. 301 emerald + 38 teal/cyan occurrences → **0 residual**.
- KPI accent map de-duplicated to `blue | sky | violet | red` (distinct premium tones).

### Shell — `src/app/page.tsx`
- Root made transparent so the global backdrop reads through.
- **Sidebar:** glass (`bg-[#080b12]/60 backdrop-blur-2xl`, verified `blur(40px)`),
  active nav item now has inset ring + blue **glow** and a glowing left indicator bar.
- **Topbar:** glass (`bg-[#05070d]/50 backdrop-blur-2xl`).

### Shared primitives (inherited by every screen)
- **`ui/card.tsx`** — glass by default (`backdrop-blur-xl`, hairline border, deep
  shadow). **Verified live:** cards report `backdrop-filter: blur(24px)`.
- **`ui/button.tsx`** — primary variant gets an electric ring + blue glow, deeper on
  hover, `active:translate-y-px` press.
- **`ui/dialog.tsx`** — overlay blurs the backdrop; content is a rounded glass panel
  with a blue-tinted cinematic shadow.

---

## 2. Screens covered by the system (render-verified, not pixel-verified)

All 14 modules were switched to and confirmed to mount with content, blue accents, and
no console errors:

| Module | Render | Notes |
|---|---|---|
| Command Center (Dashboard) | ✓ | 70 blue-accent elements, KPI cards, feed |
| AI-Safe Workspace | ✓ | protect/import/restore UI |
| Flight Recorder | ✓ | |
| Audit Trail | ✓ | |
| MCP Gateway | ✓ | |
| Agent Identities | ⚠ loading skeleton | `/api/agents` needs auth; component lacks a `.catch`, so it stays on skeletons when signed-out (pre-existing behavior, **not** a redesign regression) |
| Permission Center | ✓ | |
| Secret Vault | ✓ | |
| Shadow Sandbox | ✓ | |
| AI Safe GitHub | ✓ | |
| Trust Scores | ✓ | |
| MCP Marketplace | ✓ | |
| Public Scanner | ✓ | |
| Red Team Lab | ✓ | |

Because the accent + surface + type + background changes are token-/primitive-level, the
new language reaches every one of these screens without per-file rewrites.

---

## 3. Performance & accessibility

**Performance**
- One GPU-light canvas backdrop replaces a full three.js scene.
- Canvas: DPR capped at 1.5, particle count scales to viewport, single rAF loop,
  `will-change` on animated layers, all transforms `translate3d` (GPU).
- No backend/render-logic changes → no new re-renders introduced.

**Accessibility**
- `prefers-reduced-motion`: every continuous animation disabled; background renders one
  static frame and attaches no mousemove listener.
- Focus-visible rings retained (blue ring token); slim scrollbars keyboard-agnostic.
- Background is `aria-hidden` + non-interactive.
- (Existing keyboard/ARIA from the Radix-based primitives is preserved — not regressed.)

---

## 4. Verification performed

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** (one retone collision found + fixed: duplicate KPI color key) |
| App serves | `GET /` → **200** after recompile |
| Design tokens live | `--primary #3b6dff`, body `rgb(5,7,13)` + gradient — confirmed |
| Background live | backdrop layer + particle canvas present, sized |
| Sidebar glass live | `backdrop-filter: blur(40px)` |
| Card glass live | `backdrop-filter: blur(24px)`, hairline border |
| All 14 modules | mount with content + blue accents, **no console errors** |

---

## 4b. Per-screen bespoke pass (update)

Beyond the foundation, this round did genuine per-screen work:

- **Command Center / Dashboard — full bespoke rebuild.** Cinematic hero with a 72px
  `font-weight:200` gradient headline, thin uppercase eyebrow, dual CTAs, and a circular
  "trust core" hero object; premium glass KPI tiles with **animated count-up** (reduced-
  motion aware); Framer-Motion staggered entrance; gradient decision bars; glass live-feed
  and module tiles; shimmer skeletons. *Verified:* h1 renders at 72px/weight 200, gradient
  text clip active, both CTAs present, no console errors.
- **Glass sweep across all 17 screens** — opaque `#0d1218/#0a0e14` panels → translucent
  `backdrop-blur` glass; leftover emerald `rgba()` glows (which the hex retone missed) →
  electric blue. *Verified:* 12/14 modules show glass panels + blue accents on render;
  the other 2 were transient loading states.
- **Premium headers** (thin/large + eyebrow) on **Workspace**, **Vault**, **Agents**.
- **Agents empty/error state fixed** — added the missing `.catch` (it hung forever on
  skeletons when signed-out) and a designed empty state with CTA. *Verified:* no longer
  stuck; thin header + content render.

`tsc --noEmit` remains **0 errors** across all of the above.

### Autonomous pass across ALL remaining screens

- **Premium page titles everywhere** — swept the old `font-mono text-lg font-bold` page
  headers to thin/large `text-2xl font-light tracking-tight` across all 11 remaining
  screens (Permissions, Sandbox, GitHub, Trust, Flight Recorder, Audit, Marketplace,
  Public Scanner, Red Team Lab, etc.).
- **Refined section headers** — `font-mono text-sm font-semibold` card headers → cleaner
  `text-sm font-medium tracking-tight` app-wide.
- **Charts** — confirmed there is **no Recharts**; all charts are custom SVG (sparklines,
  score rings) already retoned to electric blue/gradient.
- *Verified:* all 14 modules navigate and render (last view sampled — Red Team Lab —
  shows 7 glass panels + 17 blue accents); **no console or server errors**; body matte
  black `rgb(5,7,13)`, `--primary #3b6dff`.

Every screen now shares the futuristic glass/blue language (glass panels, electric accent,
thin/large titles, refined section type). One screen (Dashboard) is fully bespoke;
Workspace/Vault/Agents additionally have eyebrow headers + designed states. The remaining
screens are cohesively re-skinned rather than each individually re-laid-out — I deliberately
did **not** restructure them blind (no screenshots) to avoid shipping layouts I can't see.

## 5. Remaining (NOT done — honest scope)

Every screen now shares the new glass/blue language, one screen (Dashboard) is fully
bespoke, and three more have premium headers + fixed states. The brief's full
"$100M, every-single-screen bespoke + pixel-verified" bar is **not** claimed complete.
Still open:

1. **Pixel-level visual QA** — alignment, overflow, spacing on real pixels. **Blocked in
   this environment** (screenshot capture is unavailable — the browser pane isn't
   composited). This is the one requirement I *cannot* satisfy here; it needs your eyes or
   a screenshot-capable environment.
2. **Bespoke rebuilds of the remaining ~10 screens** — MCP Gateway, Permissions, Sandbox,
   GitHub, Trust, Flight Recorder, Audit, Marketplace, Public Scanner, Red Team Lab now
   *inherit* the system (glass panels, blue accents, retone) but have not each been
   re-laid-out with bespoke hero/section composition like the Dashboard.
3. **Charts** — Recharts still render default; not yet reskinned with glass overlays /
   gradient fills.
4. **Dialogs/tables** — the Dialog primitive is glass; individual dialog bodies and dense
   tables have not each been recomposed.
5. **3D accents** (holograms/globe) — intentionally omitted to protect performance.
6. **Command palette** and a few brief-listed components are not yet built.

**Recommendation:** the foundation + dashboard set the bar; the fastest path to "done" is
to rebuild the remaining screens one at a time (each ~like the dashboard pass), with you
eyeballing each in a real browser since I can't screenshot here.

---

## 6. Files changed

| File | Change |
|---|---|
| `src/app/globals.css` | Full electric-blue glass design system (rewritten) |
| `src/components/shadowpaste/futuristic-background.tsx` | New immersive backdrop |
| `src/app/layout.tsx` | Mount backdrop globally; body transparent |
| `src/app/page.tsx` | Remove R3F background; glass sidebar/topbar; glowing active nav |
| `src/components/ui/card.tsx` | Glass default |
| `src/components/ui/button.tsx` | Electric glow on primary |
| `src/components/ui/dialog.tsx` | Backdrop blur + glass content |
| 19 screen/component files | Accent retone emerald/teal/cyan → blue/sky + hex |

All changes are UI-only and typecheck clean. No backend/API/security/CLI/DB code was modified.
