# NOTES — implementing Plan A (Neonfall) in `experiments/flappy/a1`

Every place `docs/plans/plan-a.md` was ambiguous, wrong or silent, and what I
decided instead. Format throughout: **what the plan said → what I did → why.**

**No tuning number was changed.** Every value in plan §3 — gravity-equivalent
fall speeds, drift speeds, gap widths, spacing, insets, `DT`, `DYING_TIME`, the
ramp — is implemented exactly as specified. The playtest bot (see §7 below)
clears 120 barriers on every seed tried, so nothing needed retuning.

---

## 1. Toolchain and Phaser

### 1.1 Resolved Phaser version — **4.2.1**

> §8.2: "if `npm i phaser@^4` reports no matching version because 4.x is still
> at release-candidate, install the newest 4.x prerelease explicitly … and
> record the resolved version".

`phaser@^4` resolved cleanly to **4.2.1**, which is npm's `latest` — 4.x shipped
stable, so no prerelease pin was needed. The plan (and AGENTS.md) point at the
Context7 library for `4.0.0-rc.6`; I used that as the primary reference and then
re-checked every load-bearing API against the *shipped* 4.2.1
`node_modules/phaser/types/phaser.d.ts` and `src/`, since the docs are two minor
versions behind the installed engine.

### 1.2 Import form — `import Phaser from 'phaser'`

> §8.2: "Confirm the import form against the shipped types … use whichever
> typechecks, and say which in `NOTES.md`."

`types/phaser.d.ts` ends with `declare module 'phaser' { export = Phaser }`, and
`dist/phaser.esm.js` exports both named bindings **and** a `default`. So the
default import works at runtime and typechecks once `esModuleInterop` is on.
`import * as Phaser from 'phaser'` would also typecheck; I took the default
import as the conventional form.

**Consequence:** `"esModuleInterop": true` is in `tsconfig.json`. Plan §8.3 lists
the compiler options and does not include it; without it the default import is a
type error.

### 1.3 `tsconfig.node.json` — not created

> §4.2 file layout lists `tsconfig.json` **and** `tsconfig.node.json`.

I created only `tsconfig.json`, with `include: ["src", "test", "vite.config.ts",
"vitest.config.ts"]`. A second project exists in the Vite template to give the
config files Node types under a `composite` build; here there is `noEmit`, no
project references, and neither config file touches a Node global, so it would
have had nothing to do. The plan's build script (`tsc --noEmit && vite build`)
is unchanged and now typechecks the config files too.

### 1.4 `vitest.config.ts` added

The plan never says where the Vitest config lives. Separate file (`environment:
'node'`, `include: ['test/**/*.test.ts']`) so `vite.config.ts` stays purely
about building.

### 1.5 Three build options the plan did not mention

- `workbox.maximumFileSizeToCacheInBytes: 6 MB`. **This one matters.** Phaser
  bundles to ~1.4 MB, over Workbox's 2 MB default precache ceiling; without it
  the main bundle is silently excluded from the service worker and §10.6
  ("loads and plays with the network offline") fails quietly.
- `build.chunkSizeWarningLimit: 2000` — Phaser alone trips Vite's 500 kB
  advisory. §10.1 asks for "no warnings you introduced"; splitting a 1.4 MB
  engine the game needs on frame one would only add a round trip.
- `build.target: 'es2022'`, to match the tsconfig target.

---

## 2. Scaling, DPR and resize

### 2.1 `Phaser.Scale.NONE` and `Phaser.Scale.CENTER_BOTH` do not exist

> §2.2 uses `mode: Phaser.Scale.NONE` and `autoCenter: Phaser.Scale.CENTER_BOTH`
> with "fall back to `Phaser.Scale.ScaleModes.NONE`".

In 4.2.1 the `Phaser.Scale` namespace exposes the enums `Center`, `Orientation`,
`ScaleModes` and `Zoom`, but no flattened top-level aliases. Used the fallbacks
the plan itself named: `Phaser.Scale.ScaleModes.NONE` and
`Phaser.Scale.Center.CENTER_BOTH`.

Everything else in §11's "verified present" list is genuinely present in 4.2.1:
`ScaleManager.resize/setZoom/refresh`, `GameConfig.zoom/autoCenter/autoRound/
expandParent`, `RenderConfig.antialias/pixelArt/roundPixels/powerPreference`,
`Graphics.generateTexture`, `Camera.setZoom/centerOn/shake`,
`Graphics.fillRoundedRect` (including the per-corner `{tl,tr,bl,br}` object),
`Text.setFontSize/setStroke`, `Phaser.Scale.Events.RESIZE`,
`ScenePlugin.bringToTop`. None of §11's "uncertain" fallbacks were needed.

### 2.2 Scenes subscribe to `viewport.onChange`, not `Phaser.Scale.Events.RESIZE`

> §2.7: "Scenes listen for `Phaser.Scale.Events.RESIZE` … recompute
> `k`/`viewW`/`viewH`".

`platform/viewport.ts` measures, pushes the new size into `game.scale.resize()`
(which synchronously resizes the cameras), and *then* notifies subscribers with
an already-computed `{k, viewW, viewH, safeTopUnits, safeBottomUnits,
isLandscape, …}`. Scenes get one ordered callback carrying everything they need
instead of a `Size` object each of them re-derives — and the ordering is
guaranteed rather than inferred. The Phaser event exists; it just isn't needed.

### 2.3 `attachGame()` also installs the DOM listeners

The plan does not say when `viewport.ts` starts listening. It cannot be at
import time in a useful way: the game config needs `gameW`/`gameH`/`dpr` before
`new Phaser.Game(...)` exists to resize. So the module is measurement-only until
`attachGame(game)`, which is called immediately after construction in `main.ts`.

### 2.4 Verified DPR handling

Measured in headless Chromium against the production build:

| viewport | DPR | canvas backing store | canvas CSS size |
| --- | --- | --- | --- |
| 360 × 800 | 2 | 720 × 1600 | 360 × 800 |
| 480 × 1067 | 3 | 1440 × 3201 | 480 × 1067 |

Exactly one canvas pixel per device pixel at both, which is what §2.2 is for.

---

## 3. Simulation (`core/`)

### 3.1 Scoring runs before collision inside a step

> §3.4 describes **Collision** and then **Scoring**, but never fixes the order
> they execute in. They can both fire in the same 1/120 s step.

I score first, then test collision. A mote that has crossed a band's midline is
by construction already through the gap (it would have collided ~19 units
earlier otherwise), so if it clips an edge on the way out it keeps the point.
That matches the plan's stated forgiveness philosophy (§3.1: "This is
intentional and is what makes it feel fair"), and it means the number on the
game-over card is always "barriers whose midline I passed".

### 3.2 `reset()` needs a seed, and `core/` may not read the clock

> §4.5: "In `dead` a tap calls `reset()`." §4.3: `reset(seed: number): void`.
> §3.5: "`core/` never reads the clock itself."

These three cannot all hold as written — a tap inside `step()` has no seed to
pass. I added `deriveSeed(seed)` to `core/rng.ts` (one LCG step): a tap while
`dead` resets to a seed derived from the current one. `core/` stays pure, a
restart stays reproducible from the initial seed (the determinism test covers a
death *and* a restart for exactly this reason), and the scene needs no special
case in its pointer handler. `reset(seed)` remains public for an explicit seed.

### 3.3 `paused` is reachable from `ready` and `dead`, not only `playing`

> §5's diagram has `paused` only on the `playing` edge, but also says pause is
> entered "whenever the viewport goes landscape".

If pause only came from `playing`, rotating the phone on the title screen or the
game-over card could not block input — you could start or restart a run
sideways, which is precisely what the rotate prompt is meant to prevent. So
`requestPause()` accepts `ready`, `playing` and `dead`, remembers which, and
`requestResume()` returns there. It is refused during `dying` (a 0.45 s window
that resolves itself).

### 3.4 Rotating back to portrait does not auto-resume

> §2.7: "if `cssW > cssH`, the game enters `paused` … (no resume tap accepted
> while landscape)". Silent on the way back.

It stays `paused` and shows "PAUSED — TAP TO RESUME". Dropping someone straight
back into a live run the instant the phone turns is the same class of bug as
dying because the phone rang.

### 3.5 `setViewHeight` re-anchors the mote while `ready`

> §2.4 pins `orb.y - anchorUnits` as `cameraTopY`; §5 says `reset` puts the mote
> at `y = anchorUnits` "so `cameraTopY` starts at 0". §2.7 says a mid-run resize
> must not reset the run.

`anchorUnits` depends on `viewH`, so a resize changes it. While `ready` I move
`orb.y` with it, keeping `cameraTopY == 0`. While `playing` the mote is never
moved — that would teleport it relative to the barriers, which is the reset the
plan forbids in all but name.

### 3.6 Barrier 0 does not move on a later resize

> §3.3: "Barrier `0` is placed at `y = 0.90 * viewH`".

Its `y` is baked when the run is generated. A later `setViewHeight` changes only
the generation horizon (`orb.y + viewH + 400`) and the cull line, never an
already-placed barrier. Same reason as §3.5: §2.7 outranks §3.3 here.

### 3.7 One-index ambiguity in barrier generation, resolved literally

§3.3 says gap width and spacing are "evaluated at spawn time from the barrier's
own index", then gives `y[n+1] = y[n] + difficultyAt(n).spacing` — so the step
*into* barrier `n+1` uses barrier `n`'s spacing, while `maxDelta` for barrier
`n` uses `difficultyAt(n)`. I implemented both formulas exactly as written. The
two readings differ by one index, i.e. ~2.7 units of spacing, which is inside
the noise; recording it because someone comparing implementations will notice.

### 3.8 Small named constants added

`ANCHOR_MIN`/`ANCHOR_MAX` (240/480), `NEAR_MISS_SLACK` (14), `MIN_VIEW_W`/
`MIN_VIEW_H` (540/900) are the plan's own inline numbers, given names in
`core/constants.ts` so `viewport.ts` and `gameState.ts` share one source.

---

## 4. Architecture

### 4.1 `render/uiClaim.ts` — new file

> §4.5: "if (UI hit-test claims it) → return".

The plan does not say how `GameScene` asks `UiScene` that question, and having
each scene import the other is a cycle. `uiClaim.ts` is a two-function registry:
`UiScene` registers a hit test in `create()` and clears it on shutdown;
`GameScene` calls `uiClaims(pointer.x, pointer.y)`. The hit test converts canvas
pixels to UI world units with the inverse of Phaser's camera transform
(`render/layout.ts: screenToUi`) rather than any Phaser API, so it cannot drift
from what is drawn.

### 4.2 The initial phase is announced on the first `update()`, not in `create()`

`BootScene` starts `game` before it launches `ui`, so a `bus.emit` in
`GameScene.create()` happens before `UiScene` has subscribed. `GameScene` emits
its first `phase` message on its first frame instead, which is ordering-proof.

### 4.3 Arrow keys only spend a tap when they would change direction

> §4.5: "Also bind `Space` / `ArrowLeft` / `ArrowRight` … for desktop
> development."

The control is a toggle, so a literal binding would make ArrowLeft flip you
*rightwards* half the time. `ArrowLeft`/`ArrowRight` read `orb.dir` and tap only
if it differs; `Space` is an unconditional tap. Keyboard is a convenience, not a
target, so this is not in the test suite.

### 4.4 `banner: false` and `audio: { noAudio: true }` in the game config

Not in §2.2's config list. Phaser's startup banner is a `console.log`, which
fails §10.4 outright. `noAudio` stops Phaser constructing a sound manager and
`AudioContext` it never uses — §7.2 bypasses it entirely — and with it the
autoplay-policy warning that would otherwise appear before the first tap.

---

## 5. Rendering

### 5.1 The `mote` texture is 256 × 256, not 128 × 128

> §6.2: `mote`, 128 × 128, "white core to r=32 px … `setDisplaySize(72, 72)`".
> §2.5: "Generated textures must be authored large enough that `k` never
> upscales them (they are all authored at 2×–4× their on-screen size)."

Those two are inconsistent at the plan's own numbers. On the high-DPR flagship
§10.3 asks for, `k ≈ 2.67`, so 72 world units is 192 device pixels — a 128 px
texture would be upscaled 1.5×, the exact failure §2.5 exists to prevent. I kept
every proportion (core radius is still 25% of the texture, so
`setDisplaySize(72, 72)` still yields `R_VIS = 18`) and doubled the authoring
size. `spark` stayed at 64 × 64: 24 units × 2.67 = 64 px, exactly 1:1.

### 5.2 The `glow` texture is not generated

§6.2 lists a `glow` texture "for barrier glow", but §6.3 draws the barrier glow
as an inflated `Graphics` rect at alpha 0.35. I implemented §6.3 and dropped the
texture rather than ship an unused asset.

### 5.3 A `star` texture was added

> §6.3: "**Stars**: 60 `spark` images … `#5B7BFF`".

Recolouring `spark` needs a tint, and AGENTS.md specifically warns that the v4
tint API is not the v3 one. A third call to the same `radialGlow` helper costs
nothing and removes the risk entirely.

### 5.4 Stars span the current `viewW`, not a fixed `x ∈ [-60, 600]`

> §6.3 fixes the star x-range at `[-60, 600]`.

That covers a 540-wide shaft plus 60 units of margin, but §2.3 says a 4:3 tablet
gets `viewW = 900 × 0.75 = 675`, which would leave visibly bare strips either
side. Each star holds a stable fraction of the width, so a resize repositions
them rather than re-randomising them. The parallax formula (0.25×, `posMod` wrap
over `viewH + 80`) is exactly as specified.

### 5.5 Numbers §6.4 left open

- Wall-bounce mark: the plan gives "10-unit-wide bar … fading over 0.2 s" but no
  length. **120 units tall**, centred on the bounce point.
- Near-miss edge flash: drawn as two 4-unit white strips on the gap edges of the
  barrier that was passed, since redrawing a pooled barrier `Graphics` for a
  0.15 s effect would fight the "redraw only on recycle" rule in §6.3.

### 5.6 Bands carry both a top cap and a gap-facing edge

§1.4's colour table calls `#FF9AD1` the "gap-facing edge"; §6.3 says "3-unit
`#FF9AD1` cap along the top edge". They disagree, so each band gets both: a
3-unit cap along the top and a 3-unit strip down the gap-facing side.

### 5.7 Bands overhang the walls by 8 units

Purely cosmetic: the rounded outer corners and the inflated glow rect would
otherwise reveal a seam where a band meets the shaft wall. Collision is
untouched — it uses `x ∈ [0, gapL]` and `[gapR, WORLD_W]` exactly as §3.4 says.

### 5.8 HUD text is clamped to the shaft width

> §6.5 gives a font size for every HUD string.

"PAUSED — TAP TO RESUME" at the specified size 44 rendered ~517 world units wide
and touched both walls at 360 × 800 (where `viewW` is exactly 540 — as it is on
essentially every phone, since `k` is width-limited for any aspect taller than
0.6). Rather than pick a different font size that would be equally arbitrary on
a device with different metrics, `fitText()` takes a maximum width and shrinks
only when the rendered string exceeds it. **Every font size in §6.5 is
unchanged**; the clamp is a no-op for all of them except the pause line.

Corollary: text whose content changes at runtime (score, best, card score, card
best, the pause line) is re-fitted after every `setText`, since the width guard
has to measure the string that is actually on screen.

### 5.9 The score is hidden behind the game-over card

> §6.5 lists **Score** as visible in `playing`, `dying` **and `dead`**.

The card shows the score at font 110 about 90 units below where the HUD copy
sits; both at once reads as a bug. Hidden in `dead` only.

### 5.10 Animations are hand-rolled, not tweened

§6.3 hand-rolls the particle pool to avoid the moved emitter API. I applied the
same reasoning to the rest of §6.4 — the flip ring, bounce mark, mote squash,
score pop and prompt pulse are all timers advanced with the real frame delta.
Fewer v4 surfaces to get wrong, and it keeps every effect in one `Graphics`.

### 5.11 `cam.shake` works; the §6.4 fallback was not needed

Confirmed in the 4.2.1 source that `ShakeEffect.preRender()` translates the
camera *matrix*, not `scrollX`/`scrollY` — so calling `centerOn` every frame
(§2.3) does not cancel it. Both are used together.

---

## 6. Platform

Nothing here departs from §7. Worth recording that the "never log" requirement
has one non-obvious trap: `AudioContext.resume()` returns a promise that rejects
when the gesture is not accepted, and an unhandled rejection prints to the
console. It is explicitly `.catch()`ed in `platform/audio.ts`.

---

## 7. Testing — one suite beyond §9's list

I wrote all six suites §9 suggests (`rng`, `difficulty`, `collision`,
`barriers`, `gameState`, determinism), plus **`test/playability.test.ts`**.

§3.2 hand-computes the margin at the hard end to show the tuning is fair, but
nothing checks that arithmetic against the actual simulation. That test runs a
deliberately simple bot — one barrier of look-ahead, wall reflections included,
flip only if it lands meaningfully closer to the gap centre — and asserts it
clears 60 barriers on six seeds. It actually clears the 120-barrier cap on every
one, so 60 is a wide floor rather than a tight fit: the difficulty holds flat
past the ramp exactly as §3.2 claims, and a tuning change that made the game
unwinnable would fail here rather than in playtesting.

**63 tests, all green.** Rendering is not tested, per §9.

---

## 8. How the §10 criteria were actually verified

Headless Chromium (Playwright) driving the **production build** via `vite
preview`, at 360 × 800 DPR 2 and 480 × 1067 DPR 3. Scripted: load, tap to start,
play, die, restart by tap, rotate to landscape and back, reload. Checked
automatically, all passing:

- canvas backing store is exactly `innerWidth × dpr` by `innerHeight × dpr`, and
  its CSS size fills the viewport (§10.3);
- **zero** console messages of any kind across every scenario below (§10.4);
- best score written to `localStorage` and surviving a reload (§10.5);
- service worker reaches `active`, and the game boots and runs with the context
  set offline (§10.6);
- the game runs normally with `window.localStorage` rigged to throw on access,
  still silently (§10.4's "`localStorage`-denied run");
- the mute button toggles, persists, and does **not** start the run;
- hiding the tab freezes the simulation (two screenshots 1.5 s apart are
  byte-identical), and the resume tap continues the run rather than restarting
  it (§10.5).

`npm ci && npm run build` and `npm test` were both run from a wiped
`node_modules`: build clean, 63 tests green.

**Not verified, and honestly so:** nothing was run on real Android hardware, so
the safe-area insets (§2.6) and `navigator.vibrate` are exercised only in code
paths, not in anger — headless Chromium reports zero insets and no vibration
support. Audio was likewise never *heard*; it is verified only to the extent
that it constructs no `AudioContext` before the first gesture and logs nothing.
