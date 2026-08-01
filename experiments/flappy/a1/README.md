# Neonfall

A glowing mote falls down a neon shaft. It is always sliding sideways; a tap
reverses its direction. Thread the gaps in the barriers rushing up at you.

One axis, one button, no resting state — Flappy Bird's contract rotated 90° so
that a portrait phone gives you ~840 world units of look-ahead instead of a
sliver of horizontal warning.

Built from `docs/plans/plan-a.md`. Deviations from that plan are in
[`NOTES.md`](./NOTES.md).

```bash
npm ci
npm run dev -- --host    # play it
npm run build            # tsc --noEmit && vite build
npm test                 # 63 tests, no canvas required
npm run icons            # regenerate the PWA icons (output is committed)
```

## What it is

- **Vite + TypeScript (`strict`) + Phaser 4.2.1.** No physics engine — the
  kinematics are four lines of arithmetic and one circle/rect test.
- **Installable PWA.** Manifest, service worker, playable offline, portrait-locked.
- **No assets.** Every pixel is procedural: the mote, sparks and stars are baked
  from `Graphics` at boot; barriers, walls, HUD and the icons are drawn. Audio is
  synthesised with WebAudio oscillators. Nothing is loaded, so nothing can fail
  to load.
- **Responsive.** The shaft is always exactly 540 world units wide; the camera
  zoom adapts to the viewport and the canvas backing store is one pixel per
  device pixel (verified 360 × 800 @ DPR 2 and 480 × 1067 @ DPR 3).

## Layout

```
src/
  core/       pure TypeScript — no Phaser, no DOM, no clock, no Math.random
              rng · difficulty · collision · barriers · gameState · events
  platform/   viewport (DPR, safe area, resize) · storage · audio · haptics
  render/     theme · procedural textures · HUD layout · UI hit-test registry
  scenes/     BootScene · GameScene · UiScene
test/         core only; rendering is not tested
```

The hard rule is the `core/` boundary. Given a seed, a view height and a
sequence of taps, `core/` produces a run — which is why the whole simulation is
testable without a canvas, and why `test/determinism.test.ts` can pin a full
run, death and restart to a byte-identical trace.

## The game

| | |
| --- | --- |
| Shaft | 540 units wide, walls bounce you harmlessly |
| Fall | 320 → 460 u/s over the first 15 barriers, then flat |
| Drift | 300 → 360 u/s, reversed by a tap, never zero |
| Gap | 230 → 150 units wide |
| Spacing | 420 → 380 units |
| Hitbox | 12-unit collision radius under an 18-unit visual one, bands inset 3 |

The net effect of the last row: about 9 units of visual overlap before you die,
and the gap plays 6 units wider than it looks. Deliberate — it is what makes a
near miss feel earned rather than arbitrary.

`test/playability.test.ts` runs a one-barrier-lookahead bot over six seeds; it
clears 120 barriers on all of them, so the flat end of the curve is comfortably
winnable and the ramp is doing teaching, not gatekeeping.

## What I would do next

1. **Play it on real hardware.** Everything here is verified in headless
   Chromium. The safe-area insets and `navigator.vibrate` are exercised in code
   but never on a phone with a notch, and the audio has never actually been
   heard. That is the first thing I would fix, and it might move tuning numbers.
2. **The ghost run** (plan §12.1) — a faint replay of the mote's best-run trail.
   The simulation is deterministic and seeded, so this is a stored seed, a tap
   timeline, and a re-run; it is the highest-value thing left and the cheapest.
3. **Trim the bundle.** Phaser is 1.4 MB minified (366 kB gzipped) and the game
   uses a small fraction of it. A custom Phaser build would cut first load
   sharply — worth it for a game whose whole pitch is "one more try".
4. **Barrier glow.** The plan's inflated-rect glow is a flat alpha step rather
   than a falloff. A stretched radial texture behind each band would read softer
   without costing draw calls.

## What is unfinished

- **Nothing in the plan's "done" list** (§10) is outstanding: clean `npm ci &&
  npm run build`, 63 tests green, playable start → death → restart by touch,
  crisp at both test viewports, silent console (including with `localStorage`
  denied), best score persists, backgrounding pauses rather than kills, offline
  PWA installs and plays.
- **Untested on a physical device**, as above. This is the real gap.
- **The optional extras** in plan §12 — ghost run, hue-shifting palette,
  "closest call" stat — are all unimplemented. §12 says to do them only after
  §10 is fully satisfied; §10 is satisfied, but I stopped there rather than
  spend the remaining budget on features instead of verification.
- **Landscape is a stop sign, not a layout.** Rotating shows "ROTATE YOUR
  DEVICE" and freezes the run. Portrait is the target; a 300-unit-tall shaft
  would be a different game.
- No analytics, no settings screen, no second screen of any kind — by design.
