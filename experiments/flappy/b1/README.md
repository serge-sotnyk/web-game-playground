# Flux Flip

A portrait, one-touch endless game for Android Chrome. You are a charged spark in
a reactor corridor; tapping reverses which rail attracts you. Read the next
opening, flip polarity, thread the gate. One point per gate, one hit ends the run.

Built to `docs/plans/plan-b.md`. Deviations from that plan are recorded in
[`NOTES.md`](./NOTES.md), which is the more interesting document.

## Run it

```bash
npm ci
npm test          # 86 tests, no canvas required
npm run build     # tsc --noEmit && vite build
npm run dev       # dev server
npm run preview   # serve the production build (needed to exercise the PWA)
```

`npm run icons` regenerates the PWA icons from `scripts/generate-icons.mjs`. They
are committed, so this is only needed if you change the artwork.

## What is here

Vite + TypeScript (`strict`) + Phaser 4.2.1 + `vite-plugin-pwa` + Vitest. No
other dependencies. No backend, no runtime network, no physics engine — the
motion and collision model is a few dozen lines of plain TypeScript.

```
src/
  main.ts            Phaser construction, high-DPI config, service worker
  viewport.ts        DOM measurement (size, safe insets, DPR) -> Scale Manager
  style.css          full-viewport layout, safe areas, sound button
  game/
    constants.ts     every tuning number, at U = 1
    types.ts         data shapes
    math.ts          clamp / lerp / normalize / mixColor
    layout.ts        viewport -> play field, and mid-run remapping
    rng.ts           seedable mulberry32
    collision.ts     AABB, player and gate hitboxes
    simulation.ts    the fixed-step game rules — pure, no Phaser
    stateMachine.ts  READY/PLAYING/PAUSED/DYING/RESULTS — pure, no Phaser
    storage.ts       guarded localStorage
    audio.ts         three procedural Web Audio cues
    GameScene.ts     Phaser lifecycle, input routing, event -> effect
    Renderer.ts      procedural art, pooling, interpolation, overlays
```

The split that matters: `simulation.ts` and `stateMachine.ts` know nothing about
Phaser, take their randomness from an injected seed, and are driven directly by
the tests. `Renderer` reads immutable snapshots and never writes to them.

### Display

Phaser 4 has no `resolution` option and its `RESIZE` scale mode pins the canvas
backing store to the parent's CSS size, which is blurry on any modern phone. So
the canvas is sized in device pixels with `zoom = 1 / dpr`, and the renderer
draws through a container scaled by `dpr` — restoring logical CSS-pixel
coordinates everywhere above it. Text is rasterised at device size and scaled
back down so glyphs stay sharp. `NOTES.md` §1 has the full reasoning and the
measurements.

## Verified

`npm ci && npm test && npm run build` clean from a fresh copy containing only the
checked-in files.

Beyond that, the production build was driven in headless Chrome over the DevTools
protocol — 34 checks, all passing: the full touch flow (start → score → crash →
single-tap retry) at 360×800 DPR 1 and 412×915 DPR 3.5, canvas backing store
measured as 1442×3203 at DPR 3.5, resize mid-run, the landscape blocker and
deliberate resume, keyboard and mute, persistence across reloads, background-tab
pause, `prefers-reduced-motion`, and a full offline run after disabling the
network. **Console silent throughout, no uncaught exceptions, no remote
requests.** Rendered colours were sampled from the screenshots and match the
plan's palette exactly.

## What I would do next

- **Difficulty beyond score 24.** Gap and speed both plateau there, so the game
  stops getting harder; drift amplitude alone carries it. A third axis — paired
  gates, or a gap that drifts faster rather than further — would extend the curve.
- **Audio needs a real listen.** The three cues are correct by construction but
  have never been heard; headless Chrome only proves they do not error.
- **A dimmed scrim behind the results panel.** It is legible thanks to the text
  shadow, but it sits over live gate art and would read better with one.
- **Trim the bundle.** 1.41 MB (381 kB gzipped) is nearly all Phaser, most of
  which this game does not use. A custom Phaser 4 build limited to Graphics, Text
  and input would cut it sharply, and matters on a budget phone over mobile data.

## Unfinished

- **No physical device test.** Everything was verified with Chrome device metrics
  and touch emulation, which does not catch real touch latency, thermal
  throttling, or a real Android gesture bar. Step 8 of the plan's manual
  checklist is genuinely not done.
- **Install was not exercised end to end.** The manifest, icons (192, 512, and a
  512 maskable) and service worker are all present and precached, and the app
  loads and plays with the network disabled — but nobody has tapped "Add to home
  screen" and launched it standalone.
- The landscape blocker uses `width >= height`, so a square viewport counts as
  landscape. Deliberate, but arbitrary at exactly 1:1.
