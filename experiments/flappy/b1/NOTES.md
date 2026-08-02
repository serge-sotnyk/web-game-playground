# Implementation notes — Flux Flip (`docs/plans/plan-b.md`)

Every place where the plan was ambiguous, silent, or wrong, and what I did.
Ordered by how much it mattered.

---

## 1. Phaser 4 has no `resolution` option, and RESIZE mode cannot do high-DPI

**What the plan said** (§3):

> Create Phaser with an opaque canvas, antialiasing on, pixel art off, and Scale
> Manager `RESIZE` mode. Set the initial game size from the parent's measured CSS
> size and set the top-level Phaser game-config `resolution` to
> `clamp(window.devicePixelRatio || 1, 1, 4)`. In this model `gameSize` remains
> logical and `baseSize`/the canvas backing store is logical size multiplied by
> resolution. Do not manually CSS-scale or overwrite the backing dimensions after
> Phaser has initialized.

**What is actually true of `phaser@4.2.1`.** I checked this three ways before
changing anything — the Context7 4.x API docs, `node_modules/phaser/types/phaser.d.ts`,
and `node_modules/phaser/src/scale/ScaleManager.js`:

- There is no `resolution` key in `Phaser.Types.Core.GameConfig` or in
  `ScaleConfig`. The property does not exist at any level of the config.
- `ScaleManager` contains no reference to `devicePixelRatio` at all.
- In `updateScale()`, the `RESIZE` branch does
  `gameSize = baseSize = displaySize = parentSize`, then
  `canvas.width = styleWidth; canvas.height = styleHeight`. The backing store is
  pinned 1:1 to the parent's **CSS** size. On a DPR-3.5 phone that is a canvas
  with 8× fewer pixels than the screen — precisely the blurry-canvas failure the
  brief calls a failed variant.
- `resize()` unconditionally sets `gameSize` and `baseSize` to the same value.
  `zoom` is the *only* lever in Phaser 4 that decouples the canvas CSS size from
  its backing size, and it works the other way round to the plan's model:
  `cssSize = logicalSize × zoom`, so the logical size is always the larger one.

So the plan's display model is not implementable on the engine this round pins.

**What I did.** Kept every intent of §3 and changed only the mechanism:

- Scale mode `NONE`, driven by `src/viewport.ts` rather than by Phaser's parent
  polling. The canvas is sized in **device** pixels (`round(cssW × dpr)`), and
  `zoom = 1 / dpr` makes Phaser write back a CSS style of the original CSS size.
  Backing store: device pixels. Displayed size: CSS pixels. Crisp.
- Because that makes Phaser's world coordinates device pixels, `Renderer` puts
  everything inside one root `Container` scaled by `dpr`. Above that container,
  every coordinate is a logical CSS pixel exactly as §3 requires, so all of the
  §4–§6 tuning numbers went in unmodified.
- Text is the one thing a container scale would ruin (it rasterises to a texture
  first). Each `Text` is given a font size in *device* pixels and
  `setScale(1 / dpr)`, which cancels the container scale — one glyph pixel per
  device pixel, positioned in CSS pixels like everything else.

**What I kept from the plan:** logical-CSS-pixel simulation coordinates,
`clamp(dpr, 1, 4)`, listening to the Scale Manager's `RESIZE` event, and not
CSS-scaling or overwriting the backing dimensions by hand — Phaser still owns
both, derived from the zoom I set.

**Verified in a real browser**, not by reasoning: at 412×915 CSS with DPR 3.5 the
canvas reports `width×height = 1442×3203` with `style = 412px/915.143px`. At
360×800 DPR 1 it reports 360×800. See §11 below.

---

## 2. State transitions had to be testable, but lived inside a Phaser scene

**What the plan said.** §7: "`GameScene` owns the current high-level state."
§9 requires a `state` test covering "READY start, PLAYING flip, collision to
DYING, 650 ms to RESULTS, 350 ms retry lockout, single-tap retry, visibility
pause, tap-to-resume-without-flip, and landscape pause".

These conflict: anything inside `GameScene` needs a canvas and a running game
loop, so those transitions cannot be driven step-by-step in Vitest.

**What I did.** Extracted the transition table into `src/game/stateMachine.ts` —
a Phaser-free class that decides *what happens next* and nothing else. It has no
notion of runs, sound or storage; `tap()` returns one of
`IGNORE | START_RUN | FLIP | RESUME` and the scene performs the effect.
`GameScene` owns the instance, so §7's ownership statement still holds, and
`stateMachine.test.ts` drives all nine listed transitions directly.

Same reasoning for the fixed-step accumulator: §7 says `GameScene` owns it, and
it does (it holds the `Stepper`), but the drain loop is `advanceRun()` in
`simulation.ts` so §9's "same state at 30, 60 and 120 Hz" test can run headlessly.

---

## 3. Audio unlock: a pointer handler is not the same as user activation

**What the plan said** (§6): "Resume the `AudioContext` on a user gesture and
treat failure as silent operation without logging an error." §10 requires the
console to stay silent throughout.

**What I found.** Two independent problems, both caught by driving a real browser
rather than by reading the code:

1. Phaser dispatches its `pointerdown` events from the game loop, not from the
   DOM handler. By then the gesture is over, so creating the `AudioContext` there
   is an autoplay violation.
2. Fixing that by moving the unlock into a real capture-phase `pointerdown`
   listener *still* logged `The AudioContext was not allowed to start`. I
   instrumented `AudioContext` construction in the page and found the reason:
   inside `touchstart`/`pointerdown`, `navigator.userActivation.isActive` is
   `false`. For touch input a browser grants activation on the touch **end**, not
   the start. "I am inside a pointer handler" and "I am allowed to start audio"
   are different facts.

**What I did.** `AudioService.unlock()` checks `navigator.userActivation.isActive`
and does nothing until it is true (browsers without the API get the benefit of the
doubt). `GameScene` calls it from `pointerdown`, `pointerup`, `touchend` and
`mouseup`; whichever one actually carries activation wins, and the early ones are
free no-ops. Console is now silent — verified, see §11.

---

## 4. Modules added beyond the plan's list

§7 allows "minor filename changes ... if responsibilities remain separate". Three
files exist that the plan does not name:

| File | Why |
| --- | --- |
| `src/game/math.ts` | `clamp`/`lerp`/`normalize`/`mixColor`, needed by layout, simulation and renderer alike. The alternative was duplicating them or hiding them in `constants.ts`, which is a values module. |
| `src/game/stateMachine.ts` | See §2. |
| `src/viewport.ts` | DOM measurement (parent size, safe insets, DPR) and Scale Manager sizing. Host-level like `main.ts`, deliberately not under `game/`. |

Everything else follows §7's split exactly.

---

## 5. Reading the safe-area insets

**What the plan said** (§3): "Expose CSS safe-area values as custom properties
using `env(safe-area-inset-*)`, read them on resize, and pass them into layout
calculation."

**The problem.** Reading a custom property that holds `env(...)` back out via
`getComputedStyle` is not reliable across browsers — you can get the unresolved
token rather than a pixel value.

**What I did.** Both. The custom properties exist on `:root` and the CSS uses them
(the sound button is positioned with them). For the *numbers* the layout needs,
`index.html` carries a zero-size `#safe-probe` element whose `padding` is set from
the same `env()` values; resolved padding always reads back as pixels.

---

## 6. Spark art: 34×26 and "radius 15U" cannot both be true

§4 gives the spark a visual size of `34U × 26U`, and derives the hitbox insets
from it (6U per side horizontally, 5U vertically — which is exactly consistent
with the 22U × 16U hitbox). §6 then specifies the art as concentric **circles**,
the outermost being "outer halo circle radius `15U`" — a 30U-diameter circle,
which is not 34 × 26 and cannot be, being round.

I followed the explicit numbers in both places: the circles are drawn at the §6
radii, and the hitbox is the §4 rectangle of `22U × 16U`. The `34U × 26U` figure
is treated as a nominal footprint used only to explain the insets, and is not
drawn. Constants for it exist and are asserted against the hitbox in
`collision.test.ts`.

---

## 7. Particle pooling

**What the plan said** (§6): "Pool six gate renderers, 48 particles, and 16 trail
motes. Do not create a Phaser object every frame."

**What I did.** Six gate `Graphics` objects, as specified. But the 48 crash
particles and 16 trail motes are pooled as plain data records and drawn into a
single long-lived `Graphics`, rather than as 64 display-list objects. Both satisfy
"no Phaser object per frame"; one `clear()` plus 64 `fillCircle`s is cheaper than
64 transformed objects, which matters on the budget phone in the test floor.

---

## 8. The background is not entirely static

§6 says "Redraw the static background only on create/resize", and in the same
section says the 24 depth dots "Move only their x positions at 15% of world speed
for parallax". A moving thing cannot be redrawn only on resize.

Split into two `Graphics`: the 12 colour bands are redrawn on create/resize only,
and the dots are cleared and redrawn each frame. Gate columns likewise redraw
only when their drifted gap has actually moved (`amplitude === 0` gates skip it).

---

## 9. Resize could push a gap through a rail

§3 says to preserve each gate's base-centre normalized position inside the
corridor. It does not say what happens when the new corridor and the new `U`
scale by *different* factors — which they do, because `U` is clamped to
`[0.75, 1.35]` and the corridor is not. A proportionally-placed centre can then
sit outside the band §4 reserves for it, and the gap visually overlaps a rail.

`remapRun()` re-clamps each base centre into `baseCenterBounds()` after
repositioning. This is a no-op in the normal case (so §9's proportionality test
still holds), and only bites in the extreme. Covered by
`layout.test.ts > keeps every gap inside the legal band after an extreme resize`.

---

## 10. Service worker update policy

§8: "Use automatic update on a later navigation; never interrupt an active run to
reload."

`vite-plugin-pwa`'s `registerType: 'autoUpdate'` generates a skip-waiting worker
*and* its `virtual:pwa-register` helper attaches a `controlling` listener that
calls `location.reload()` — which is exactly the interruption §8 forbids. I kept
`autoUpdate` for the worker itself but set `injectRegister: null` and register it
by hand in `main.ts`, so a new worker takes over silently and fresh assets are
picked up on the next navigation. Nothing reloads the page.

---

## 11. Smaller decisions

- **First gate consumes no RNG.** §4 fixes the opening gate at the corridor
  midpoint and describes phase/offset draws only "for every later gate". Its
  amplitude is 0 at score 0 anyway, so it is created with `phase = 0` and takes
  nothing from the stream. Later gates draw phase then offset, in that order.
- **`banner: false`, `audio: { noAudio: true }`.** Not in the plan; required by
  §10's silent console. Phaser prints a version banner on boot by default, and
  its own sound manager would create a second `AudioContext`.
- **Landscape blocks every state.** §3 says to pause and show the overlay; §5
  lists PAUSED as reached "from PLAYING". Implemented so the overlay shows and
  taps are swallowed in *any* state, but only a PLAYING run actually transitions
  to PAUSED — a READY screen stays READY.
- **HUD score hidden on READY and RESULTS**, where those panels show the number
  themselves. Otherwise it is drawn twice.
- **Ready-screen bob is suppressed under `prefers-reduced-motion`.** §6 lists
  shake, particle counts and scale animations, and says "gameplay motion remains
  unchanged". The ready bob is neither — it is decoration on a stopped
  simulation, so I treated it as reduced-motion content.
- **`spawnIntervalFor()` is derived, not tuned.** §4 gives 1.553 s / 1.206 s as
  consequences of constant 205U spacing; the code computes `spacing / speed` and
  the test asserts the plan's two numbers.
- **Gates spawn off the previous gate's x**, at `rightmost.x + 205U`, rather than
  at the spawn line. Both satisfy §4's trigger condition, but only this one keeps
  spacing at *exactly* 205U as the scroll speed changes, which §9 asserts.

---

## 12. What "verified" means here

The plan's §9 manual checklist is a browser checklist, so I ran it in a browser
rather than reasoning about it. Headless Chrome, driven over the DevTools
protocol (no new dependencies — Node 24 has a global `WebSocket`), serving the
**production build** from `dist/`. 34 automated checks, all passing:

- 360×800 @ DPR 1 and 412×915 @ DPR 3.5 — canvas backing store measured against
  CSS size in both, no horizontal page scroll.
- Full touch flow: ready → tap to start → score gates → crash → results → single
  tap retries.
- Resize mid-run between the two viewports: stays PLAYING, no state change.
- Rotate to landscape → blocker, taps swallowed; rotate back → still paused;
  deliberate tap resumes.
- Keyboard (Space, Enter), `M` mute, mute and best-score persistence across
  reloads, background-tab pause.
- `prefers-reduced-motion` emulated: boots and plays.
- Service worker active, then **network disabled**: reloads, boots and plays
  offline with zero remote requests.
- **Console completely silent** across all of the above, and no uncaught
  exceptions.

Rendered colours were sampled out of the screenshots pixel by pixel and match the
plan's palette exactly: gate fill `#26346b`, upper rail `#4debff`, lower rail
`#ff6687`, rail bar `#0d1a33`.

**Not verified:** a physical Android device (§9 step 8), and whether the audio
cues actually *sound* right — headless Chrome confirms the code path runs and
raises no errors, but nobody has heard them.
