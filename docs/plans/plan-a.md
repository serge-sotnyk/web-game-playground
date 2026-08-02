# Plan A — **NEONFALL**

A complete implementation spec for one round-1 variant. You (the implementer)
have not seen the conversation that produced this and cannot ask questions, so
everything you need is here: the mechanic, every tuning number, the module
boundaries, the state machine, the Phaser 4 API traps, and the definition of
done.

Where this plan is wrong or silent, implement your reading of its intent and
record the decision in `NOTES.md` (what the plan said, what you did, why) — do
not silently redesign. The numbers below are a spec, not a suggestion; if
playtesting proves one of them wrong, change it and record the before/after.

Everything goes in **your assigned variant directory** (e.g.
`experiments/flappy/a1/`). It is a self-contained Vite project. Touch nothing
outside it.

---

## 1. The game

### 1.1 One-sentence pitch

A glowing mote falls down a neon shaft; it is always sliding sideways, and a
tap reverses its direction — thread the gaps in the barriers rushing up at you.

### 1.2 Why this mechanic

Flappy Bird is *one axis, one button, no resting state*: you never stop moving,
every failure is legibly your own, and a run ends in under a minute. Neonfall
is the same contract rotated 90°. Vertical scrolling suits a portrait phone —
you get ~840 world units of look-ahead below the mote instead of a sliver of
horizontal warning — and "tap to turn" is learnable in one tap without a
tutorial.

### 1.3 Rules

- The shaft is **540 world units wide**, walled left and right, and scrolls
  downward forever.
- The **mote** falls at a constant speed. There is no vertical control.
- The mote is **always drifting horizontally** at a constant speed, left or
  right. It never stops.
- **Tap anywhere → the drift reverses instantly.** That is the entire control.
- Hitting a **wall** bounces the mote (drift reverses, no penalty). Walls are
  safe.
- **Barriers** are horizontal neon bands spanning the shaft with one gap.
  Touching a band is instant death.
- **Score** = barriers passed. Best score persists in `localStorage`.
- Difficulty ramps over the first 15 barriers, then holds flat forever.

### 1.4 Look and feel

Neon-on-black. This is chosen because procedural art is *good* at it: bright
saturated shapes and additive glow on a near-black field read as deliberate
design rather than programmer art, and cost nothing but `Graphics` calls.

| Role | Colour |
| --- | --- |
| Outside the shaft (letterbox fill) | `#03040C` |
| Inside the shaft | `#070A18` |
| Shaft wall lines | `#1B2A6B`, flashing to `#5B7BFF` on bounce |
| Barriers | `#FF3D9A`, gap-facing edge `#FF9AD1` |
| Mote core / halo | `#FFFFFF` core → `#7DF9FF` halo |
| Stars | `#5B7BFF` at alpha 0.25–0.7 |
| Text | `#EAF6FF` |
| Death flash | `#FF3D9A` at alpha 0.25 |

Font: system stack only (no webfont, no network at runtime) —
`'Trebuchet MS', 'Segoe UI', system-ui, -apple-system, sans-serif`. On Android
Chrome this lands on Roboto, which is fine.

---

## 2. Coordinate system, scaling and DPR

This section is the one most likely to sink the variant. A blurry canvas is a
failed variant, so read it carefully.

### 2.1 Design space

All gameplay is authored in **world units**. `WORLD_W = 540` is always exactly
the shaft width, on every device. World `y` increases downward and is unbounded
(a run just keeps counting up).

### 2.2 Canvas sizing (crispness)

Phaser's `FIT` mode CSS-scales a fixed-size canvas, which is blurry on a
high-DPR phone. Do **not** use `FIT`. Use `NONE` + `zoom`:

```ts
const dpr    = Math.min(window.devicePixelRatio || 1, 3);
const cssW   = Math.max(1, Math.round(window.innerWidth));
const cssH   = Math.max(1, Math.round(window.innerHeight));
const gameW  = Math.round(cssW * dpr);   // canvas backing-store pixels
const gameH  = Math.round(cssH * dpr);

scale: {
  parent: 'game',
  mode: Phaser.Scale.NONE,      // fall back to Phaser.Scale.ScaleModes.NONE
  zoom: 1 / dpr,                // Phaser sets canvas CSS size = gameW * zoom
  width: gameW,
  height: gameH,
  autoCenter: Phaser.Scale.CENTER_BOTH,
  autoRound: false,
  expandParent: false,
}
```

The backing store is therefore one canvas pixel per device pixel, and Phaser
sets the CSS size back down to ≈`cssW × cssH`. That is the whole trick. DPR is
capped at 3 to bound fill-rate on the fill-heavy neon look.

Renderer config: `type: Phaser.AUTO`, `antialias: true`, `pixelArt: false`,
`roundPixels: false` (the camera zoom is non-integer; rounding causes jitter),
`transparent: false`, `backgroundColor: '#03040C'`, `powerPreference:
'high-performance'`, and **no `physics` block at all** (see §4).

### 2.3 World-to-screen: camera zoom

```ts
const MIN_VIEW_W = 540;   // == WORLD_W
const MIN_VIEW_H = 900;

const k     = Math.min(gameW / MIN_VIEW_W, gameH / MIN_VIEW_H); // px per world unit
const viewW = gameW / k;   // >= 540
const viewH = gameH / k;   // >= 900
```

On every scene that renders in world space:

```ts
cam.setZoom(k);
cam.centerOn(WORLD_W / 2, someWorldCenterY);
```

Because the camera is centred on `x = 270`, a screen wider than 540 units shows
the extra width split evenly either side of the shaft — fill it with
`#03040C` and let the wall lines mark the play area. Typical 19.5:9 and 20:9
Android phones all land at `viewH ≈ 1200`; a 4:3 tablet gets `viewH = 900` and
extra side margin.

**Do not** hand-transform world coordinates in the scene. Set the camera zoom
once per resize, call `cam.centerOn(...)` once per frame in `update()`, and give
every sprite its true world position. This keeps `cam.shake()` working and
keeps the render code trivial.

### 2.4 Look-ahead anchor

The mote sits at a fixed height on screen. What matters for difficulty is how
far *below* it you can see, so pin that, not the fraction:

```ts
const LOOKAHEAD   = 840;                                   // world units
const anchorUnits = clamp(viewH - LOOKAHEAD, 240, 480);    // mote's distance from view top
cameraTopY        = orb.y - anchorUnits;
```

At `viewH = 1200` that gives `anchorUnits = 360` (30% down the screen).
`cam.centerOn(270, cameraTopY + viewH / 2)`.

### 2.5 Crisp text under camera zoom

`Text` renders to a canvas texture at its nominal font size, then the camera
zoom scales that texture up — which is blurry at `k = 2.7`. Every `Text`
object must be created and re-laid-out like this:

```ts
const px = Math.max(8, Math.round(designSizeInUnits * k));
text.setFontSize(px);
text.setScale(1 / k);          // occupies designSizeInUnits in world space
```

Re-apply on every resize. `Graphics` is vector and stays crisp automatically.
Generated textures (§6.2) must be authored large enough that `k` never
upscales them (they are all authored at 2×–4× their on-screen size).

### 2.6 Safe area

`index.html` uses `viewport-fit=cover`, so the canvas paints under the notch.
Measure the insets once at boot and on every resize with a probe element:

```html
<div id="safe" style="position:fixed;top:0;left:0;width:0;height:0;
     padding-top:env(safe-area-inset-top);
     padding-bottom:env(safe-area-inset-bottom);visibility:hidden"></div>
```

Read `getComputedStyle(el).paddingTop/paddingBottom` (CSS px), then convert:
`units = cssPx * (viewW / cssW)`. Expose `safeTopUnits` / `safeBottomUnits`
(both `>= 0`) from `platform/viewport.ts`. All HUD elements respect them.

### 2.7 Resize, orientation, portrait lock

`platform/viewport.ts` owns all DOM measurement. It listens to `resize`,
`orientationchange`, and `visualViewport`'s `resize` (when present), debounces
**150 ms**, recomputes everything in §2.2/§2.6, then calls
`game.scale.resize(gameW, gameH)` and sets the zoom (`game.scale.setZoom(1/dpr)`
if present, else `game.scale.zoom = 1/dpr; game.scale.refresh()`).

Scenes listen for `Phaser.Scale.Events.RESIZE` (literal `'resize'` if that
constant is absent), recompute `k`/`viewW`/`viewH`, re-apply camera zoom, call
`state.setViewHeight(viewH)`, and re-layout the HUD. **A mid-run resize must
not reset the run.**

**Landscape:** if `cssW > cssH`, the game enters `paused` and the HUD shows
"ROTATE YOUR DEVICE" (no resume tap accepted while landscape). Portrait is far
too narrow to letterbox usefully — the shaft would be 300 units tall. The
manifest also declares `"orientation": "portrait"`, which locks it once
installed.

---

## 3. Tuning — every number

World units throughout. Time in seconds.

### 3.1 Geometry constants (`core/constants.ts`)

| Name | Value | Meaning |
| --- | --- | --- |
| `WORLD_W` | `540` | shaft width |
| `R_VIS` | `18` | mote visual core radius |
| `R_HIT` | `12` | mote **collision** radius (deliberately smaller — hitbox forgiveness) |
| `WALL_R` | `18` | radius used for wall bounce, so the *visible* edge kisses the wall |
| `BAND_H` | `26` | barrier band height |
| `INSET` | `3` | barrier rects shrink by this on all four sides for collision |
| `GAP_EDGE_MARGIN` | `26` | a gap's edge never comes closer than this to a wall |
| `LOOKAHEAD` | `840` | visible world units below the mote |
| `RAMP_BARRIERS` | `15` | difficulty ramp length |
| `DT` | `1/120` | fixed simulation timestep |
| `DYING_TIME` | `0.45` | seconds of death animation before input reopens |
| `MAX_FRAME_DT` | `0.10` | real delta clamp (tab-switch protection) |

Net forgiveness: a barrier rect is inset 3 units and the mote's hit radius is
6 units under its visual radius, so you get ~9 units of visual overlap before
you die, and the gap plays 6 units wider than it looks. This is intentional and
is what makes it feel fair.

### 3.2 Difficulty curve (`core/difficulty.ts`)

```
t     = clamp(n / RAMP_BARRIERS, 0, 1)
ease  = t * t * (3 - 2 * t)          // smoothstep
p     = lerp(easyValue, hardValue, ease)
```

| Parameter | `n = 0` | `n >= 15` |
| --- | --- | --- |
| `fallSpeed` (u/s) | **320** | **460** |
| `driftSpeed` (u/s) | **300** | **360** |
| `gapWidth` (u) | **230** | **150** |
| `spacing` (u) | **420** | **380** |

`difficultyAt(n)` returns all four. Speeds are evaluated live from the current
**score**; `gapWidth` and `spacing` are evaluated at spawn time from the
**barrier's own index** and baked into the barrier.

Sanity check of the hard end, so you can tell if you have broken it: the mote's
centre must be within `gapWidth/2 + INSET - R_HIT = 66` units of the gap centre,
i.e. a 132-unit window; crossing the band takes
`(BAND_H + 2*R_HIT - 2*INSET) / fallSpeed = 44/460 = 0.096 s`, during which it
drifts `360 * 0.096 ≈ 34` units. Effective margin ≈ 98 units in a 540-wide
shaft. At the easy end the same figures are 212 / 41 / 171 — very forgiving.
Barrier cadence is `380/460 = 0.83 s` at the hard end, `420/320 = 1.31 s` at the
start.

Flappy Bird itself has no ramp at all. The 15-barrier ramp here exists purely so
the first ten seconds teach the mechanic; after that the difficulty is flat, and
the "one more try" pressure is consistency, not escalation.

### 3.3 Barrier generation (`core/barriers.ts`)

Barrier `0` is placed at `y = 0.90 * viewH` with its gap centred at
`WORLD_W / 2` — visible near the bottom of the screen while in `ready`, so the
player can see what they are dropping into. Thereafter
`y[n+1] = y[n] + difficultyAt(n).spacing`.

Gap centres do a random walk with a **reachability bound**, so a gap is never
placed where the mote physically cannot get to in time:

```
d        = difficultyAt(n)
maxDelta = clamp(0.50 * d.driftSpeed * d.spacing / d.fallSpeed, 80, 200)
mag      = maxDelta * (0.35 + 0.65 * rng())
if (rng() < 0.30) gapDrift = -gapDrift        // 30% chance to change direction
cx       = cxPrev + gapDrift * mag
minCx    = GAP_EDGE_MARGIN + d.gapWidth / 2
maxCx    = WORLD_W - GAP_EDGE_MARGIN - d.gapWidth / 2
if (cx < minCx) { cx = minCx; gapDrift = +1 }
if (cx > maxCx) { cx = maxCx; gapDrift = -1 }
gapL = cx - d.gapWidth / 2
gapR = cx + d.gapWidth / 2
```

`maxDelta` evaluates to 196 at `n = 0` and 149 at the cap — comfortably inside
the drift distance available between barriers. `gapDrift` starts at `+1`.
`gapDrift` is the *gap's* walk direction and is unrelated to the mote's drift
direction; keep the names distinct.

Maintain barriers so that the last one is at least `orb.y + viewH + 400`; cull
any whose `y + BAND_H < cameraTopY - 200`.

### 3.4 Motion and collision

Per fixed step `DT`:

```
d = difficultyAt(score)
if (phase === 'playing') orb.y += d.fallSpeed * DT
if (phase === 'playing' || phase === 'ready') orb.x += orb.dir * d.driftSpeed * DT

if (orb.x < WALL_R)            { orb.x = WALL_R;            orb.dir = +1; emit bounce(left)  }
if (orb.x > WORLD_W - WALL_R)  { orb.x = WORLD_W - WALL_R;  orb.dir = -1; emit bounce(right) }
```

The mote drifts in `ready` too, so the player picks their entry line before
dropping. It does not drift in `dying`, `dead` or `paused`.

**Collision** (`playing` only). For each barrier within
`|barrier.y + BAND_H/2 - orb.y| < BAND_H/2 + R_HIT + 4`, test the mote's circle
(`R_HIT`) against two rectangles, each inset by `INSET` on all four sides:

- left band: `x ∈ [0, gapL]`, `y ∈ [by, by + BAND_H]`
- right band: `x ∈ [gapR, WORLD_W]`, `y ∈ [by, by + BAND_H]`

Standard closest-point test:

```ts
export function circleHitsRect(cx, cy, r, rx, ry, rw, rh): boolean {
  const nx = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
  const ny = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
```

Skip a rect whose inset width or height would be `<= 0`.

**Scoring.** When `orb.y` crosses the plane `barrier.y + BAND_H / 2` (previous
`y < plane <= new y`) and the barrier is not yet `scored`: mark it scored,
`score++`, emit `pass`. A `pass` is a **near miss** when
`min(orb.x - gapL, gapR - orb.x) < R_HIT + 14`.

### 3.5 Determinism

`core/rng.ts` exports `mulberry32(seed: number): () => number`:

```ts
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

The seed is injected (`Date.now() | 0` at run start) — `core/` never reads the
clock itself. Same seed + same tap script ⇒ identical run. This is what makes
the whole simulation testable without a canvas.

---

## 4. Architecture

### 4.1 The hard rule

**Nothing under `src/core/` may import Phaser or touch `window`, `document`,
`localStorage`, `Date`, `Math.random`, or `AudioContext`.** It is pure
TypeScript: given a seed, a view height and a sequence of taps, it produces a
run. Everything else — rendering, input plumbing, audio, storage, DPR — lives
in `src/scenes/`, `src/render/` and `src/platform/`. This is the boundary the
experiment is looking at; keep it clean.

Consequence: **do not use Arcade Physics.** The kinematics here are four lines
of arithmetic and one circle/rect test; routing them through a physics engine
would move game rules into Phaser and make them untestable, and it would buy
nothing. Omit the `physics` key from the game config entirely.

### 4.2 File layout

```
<variant>/
  index.html
  package.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  scripts/gen-icons.mjs
  public/
    icon-192.png  icon-512.png  icon-maskable-512.png
    apple-touch-icon-180.png  favicon.svg
  src/
    main.ts
    style.css
    core/
      types.ts         constants.ts   rng.ts
      difficulty.ts    collision.ts   barriers.ts
      gameState.ts     events.ts
    platform/
      viewport.ts      storage.ts     audio.ts      haptics.ts
    render/
      theme.ts         textures.ts    layout.ts
    scenes/
      BootScene.ts     GameScene.ts   UiScene.ts
  test/                              (only if you choose to test — see §9)
  README.md
  NOTES.md
```

### 4.3 Core module contracts

`core/types.ts`

```ts
export type Phase = 'ready' | 'playing' | 'dying' | 'dead' | 'paused';

export interface Orb { x: number; y: number; dir: -1 | 1 }

export interface Barrier {
  index: number; y: number; gapL: number; gapR: number; scored: boolean;
}

export interface DifficultyParams {
  fallSpeed: number; driftSpeed: number; gapWidth: number; spacing: number;
}

export type GameEvent =
  | { type: 'start' }
  | { type: 'flip'; x: number; y: number }
  | { type: 'bounce'; side: 'left' | 'right'; y: number }
  | { type: 'pass'; index: number; score: number; nearMiss: boolean }
  | { type: 'death'; x: number; y: number; score: number; best: number; newBest: boolean }
  | { type: 'dead' }
  | { type: 'reset' }
  | { type: 'pause' }
  | { type: 'resume' };
```

`core/gameState.ts`

```ts
export class GameState {
  readonly orb: Orb;
  phase: Phase;
  score: number;
  best: number;
  barriers: Barrier[];
  cameraTopY: number;

  constructor(opts: { seed: number; viewH: number; best: number });

  setViewHeight(viewH: number): void;   // safe mid-run
  tap(): void;                          // queues one input; consumed by step()
  requestPause(): void;
  requestResume(): void;                // also clears the queued tap
  step(dt: number): GameEvent[];        // dt is always DT
  reset(seed: number): void;            // back to 'ready', score 0, fresh barriers
}
```

`GameState` owns `best` in memory and reports `newBest` on the `death` event;
**persisting** it is the scene's job (`platform/storage.ts`), so `core/` stays
pure.

`core/events.ts` — a ~15-line typed emitter (`on`/`off`/`emit`) and an exported
singleton `bus`, used for GameScene → UiScene messages. No dependency, no
Phaser. `UiScene` subscribes in `create()` and unsubscribes on `shutdown`.

### 4.4 Frame loop

`GameScene.update(_time, delta)`:

1. `acc += Math.min(delta / 1000, MAX_FRAME_DT)`
2. `while (acc >= DT) { events.push(...state.step(DT)); acc -= DT }`
   (bound the loop to 12 iterations per frame as a spiral-of-death guard)
3. dispatch events → audio, particles, shake, `bus.emit`
4. `cam.centerOn(WORLD_W / 2, state.cameraTopY + viewH / 2)`
5. sync sprite positions from `state`, advance particle/flash timers with the
   real (unclamped-but-capped) frame delta

On `requestResume()` and on `visibilitychange → visible`, reset `acc = 0`.

Simulating at 120 Hz means 60 Hz phones run exactly two steps per frame and
120 Hz phones one — no visible stutter, and no need for render interpolation.

### 4.5 Input

Single handler in `GameScene`, on `this.input.on('pointerdown', ...)`:

```
if (phase === 'paused')              → state.requestResume(); return   // tap is consumed
if (phase === 'dying')               → return                          // locked out
if (UI hit-test claims it)           → return                          // mute button, ready/dead only
otherwise                            → audio.unlock(); state.tap()
```

`state.tap()` increments a counter; each `step()` consumes at most one, so a
genuine double-tap reverses twice ~8 ms apart (a no-op, which is correct) rather
than being swallowed. In `ready` the first tap starts the fall *and* does not
reverse the drift. In `dead` a tap calls `reset()`.

Also bind `Space` / `ArrowLeft` / `ArrowRight` / `pointerdown` on the whole
canvas for desktop development. Keyboard is a convenience, not a target.

---

## 5. State machine

```
        ┌──────────────────────────── reset() ◄──────────┐
        ▼                                                │
  ┌──────────┐  tap   ┌───────────┐  hit barrier  ┌────────┐  0.45s  ┌──────┐
  │  ready   │ ─────► │  playing  │ ────────────► │ dying  │ ──────► │ dead │
  └──────────┘        └───────────┘               └────────┘         └──────┘
                        │      ▲                                        │ tap
                 pause()│      │requestResume()                         │
                        ▼      │                                        ▼
                     ┌──────────┐                                   (reset → ready)
                     │  paused  │
                     └──────────┘
```

| Phase | Simulation | Input | HUD |
| --- | --- | --- | --- |
| `ready` | drift only, no fall; barriers pre-generated | tap → `playing` | title, prompt, best, mute button |
| `playing` | full | tap → flip | score only |
| `dying` | frozen; `dyingT` counts down `DYING_TIME` | ignored | score only |
| `dead` | frozen | tap → `reset()` → `ready` | game-over card, mute button |
| `paused` | frozen | tap → resume (consumed) | "TAP TO RESUME" / "ROTATE YOUR DEVICE" |

`paused` is entered automatically from `playing` on `document.visibilitychange
→ hidden`, on `window.blur`, and whenever the viewport goes landscape. Dying
because the phone rang is the kind of bug that kills the "one more try" loop —
handle it.

`reset(seed)` produces a brand-new seeded run: score 0, barriers regenerated,
mote at `x = WORLD_W / 2`, `dir = +1`, `y = anchorUnits` (so `cameraTopY`
starts at 0).

---

## 6. Rendering

### 6.1 Scenes

- **`BootScene`** — generates the procedural textures (§6.2), then
  `this.scene.start('game'); this.scene.launch('ui'); this.scene.bringToTop('ui')`.
  No asset loading of any kind; there are no asset files.
- **`GameScene`** — background, stars, walls, barriers, mote, particles.
  Owns the `GameState`. Contains **no game rules**: it reads state and events.
- **`UiScene`** — HUD only. Its camera uses the same `k` and is centred on
  `(WORLD_W/2, viewH/2)` with no scrolling, so HUD coordinates are world units
  in a fixed `viewW × viewH` box. Never affected by `cam.shake()`.

### 6.2 Procedural textures (`render/textures.ts`)

Drawn with `Graphics` and baked with `Graphics.generateTexture(key, w, h)`
(**verified present in Phaser 4.0.0-rc.6**), then the `Graphics` is destroyed.

| Key | Size | Content | On-screen |
| --- | --- | --- | --- |
| `mote` | 128×128 | white core to r=32 px, then a cyan halo fading to alpha 0 at r=64 px, drawn as ~10 concentric circles of decreasing alpha | `setDisplaySize(72, 72)` → core radius exactly `R_VIS = 18` |
| `spark` | 64×64 | white core to r=12 px, cyan halo to r=32 px | 24 units, shrinking |
| `glow` | 64×64 | soft magenta radial, alpha 0.5 at centre | barrier glow |

Concentric-circle stacking is used instead of `fillGradientStyle` because the
Phaser 4 docs warn gradients may not survive `generateTexture`.

Barriers are **not** textures — each is a `Graphics` redrawn only when its pool
slot is recycled (see §6.3).

### 6.3 Display objects

- **Background**: one `Graphics`, redrawn on resize only, repositioned each
  frame to `(0, cameraTopY)`, drawing in local coordinates `y ∈ [0, viewH]`:
  the `#03040C` letterbox fill across `viewW`, the `#070A18` shaft across
  `[0, 540]`, and 4-unit wall lines at `x = 0` and `x = 540`.
- **Stars**: 60 `spark` images, each with a fixed world `x ∈ [-60, 600]`, a
  random `base ∈ [0, viewH + 80)`, scale 0.1–0.35 and alpha 0.25–0.7. Each
  frame: `y = cameraTopY + posMod(base - 0.25 * cameraTopY, viewH + 80)`, where
  `posMod` is a positive modulo. That is a 0.25× parallax — the sky drifts
  slowly while the shaft rushes by, which sells the speed.
- **Barriers**: a pool of **8** `Graphics`. Each frame, assign the 8 nearest
  live barriers to slots; a slot redraws (`clear()` then fill) only when its
  barrier index changes, and is repositioned every frame to `(0, barrier.y)`
  with the band drawn in local coordinates `y ∈ [0, BAND_H]`. Draw order per
  band: magenta glow rect (inflated 10 units, alpha 0.35) → `#FF3D9A` body with
  `fillRoundedRect` radius 8 on the gap-facing corners (fall back to `fillRect`
  if rounded rects misbehave) → 3-unit `#FF9AD1` cap along the top edge.
- **Mote**: one `mote` image at the orb's world position, plus a squash/stretch
  tween on bounce.
- **Particles**: one hand-rolled pool of **48** `spark` images with `{active,
  x, y, vx, vy, life, maxLife, size0, size1}`, updated in `GameScene`. Do not
  use Phaser's particle emitter — the API moved in 3.60 and again in 4, and a
  48-element pool is fifteen lines.

### 6.4 Juice (all of it, with numbers)

| Trigger | Effect |
| --- | --- |
| always, while `playing` | trail: one spark every 0.03 s at the mote, `vx/vy = 0`, life 0.35 s, size 24 → 6, alpha 0.9 → 0 |
| tap (`flip`) | expanding ring at the mote: alpha 0.8 → 0, radius `R_VIS` → `R_VIS*2.6` over 0.18 s; `blip` sound |
| wall `bounce` | 10-unit-wide `#5B7BFF` bar at the bounce point on that wall, fading over 0.2 s; mote squash to `(0.75, 1.25)` scale and back over 0.12 s; `tick` sound |
| `pass` | score text pops 1.0 → 1.25 → 1.0 over 0.18 s; `ping` sound whose pitch rises with the run |
| `pass` with `nearMiss` | the two gap edges flash white for 0.15 s; `ping` plus a 1200 Hz tick |
| `death` | `cam.shake(300, 0.01)`; 18 sparks burst radially from the mote at 220–420 u/s with 0.8 s life; full-screen `#FF3D9A` flash at alpha 0.25 fading over 0.25 s; mote hidden; `navigator.vibrate?.(18)` |
| `ready` | prompt text alpha oscillates 0.5 ↔ 1.0 on a 1.2 s sine |

If `cam.shake` is unavailable in Phaser 4, offset the `centerOn` target by a
decaying random vector instead and note it in `NOTES.md`.

### 6.5 HUD layout (`render/layout.ts`, all in world units)

- **Score** (`playing`, `dying`, `dead`): centred at `x = 270`,
  `y = safeTopUnits + 96`, font size 96, alpha 0.9, `#EAF6FF`, 4-unit `#0B1030`
  stroke.
- **Title** (`ready`): "NEONFALL", `y = 0.16 * viewH`, font 84, letter-spaced
  look via a 3-unit `#7DF9FF` stroke.
- **Prompt** (`ready`): "TAP TO DROP", `y = 0.60 * viewH`, font 44; second line
  "TAP AGAIN TO TURN", `y = 0.60 * viewH + 58`, font 32, alpha 0.7.
- **Best** (`ready`): "BEST n", `y = viewH - safeBottomUnits - 70`, font 36,
  alpha 0.7.
- **Game-over card** (`dead`): rounded rect 420 × 340 centred at
  `(270, 0.42 * viewH)`, fill `#0B1030` alpha 0.92, 2-unit `#7DF9FF` border.
  Contents: "SCORE" (font 32, alpha 0.7), the score (font 110), "BEST n"
  (font 36), and "NEW BEST!" in `#FF9AD1` (font 40) when applicable, then
  "TAP TO RETRY" (font 36) below the card at `y = 0.42 * viewH + 220`.
- **Mute button**: a 64 × 64 hit area at
  `(viewW/2 - 46 relative to shaft centre → x = 270 + viewW/2 - 46,
    safeTopUnits + 46)`, drawn as a speaker glyph with `Graphics`. **Visible
  only in `ready` and `dead`** — never during play, so it can never steal a
  flip.
- **Pause overlay** (`paused`): full-screen `#03040C` at alpha 0.65 plus
  "PAUSED — TAP TO RESUME" (font 44) or "ROTATE YOUR DEVICE" in landscape.

Every text object follows the §2.5 crispness recipe and is re-laid-out on
resize.

---

## 7. Platform layer

### 7.1 `platform/storage.ts`

Keys `neonfall.best`, `neonfall.muted`. `loadBest()` / `saveBest(n)` /
`loadMuted()` / `saveMuted(b)`. Everything in `try/catch` (private-mode Safari
throws on write); on failure return the default (`0`, `false`) and **never log**.
Validate with `Number.isFinite` and clamp `best >= 0`.

### 7.2 `platform/audio.ts` — procedural WebAudio

No audio files (nothing to load, works offline, nothing copied from anywhere).
Bypass Phaser's sound manager entirely.

- Lazily construct `AudioContext` (`window.AudioContext ?? webkitAudioContext`)
  inside `unlock()`, which is called from the **first `pointerdown`** — Android
  Chrome will not start audio otherwise. `unlock()` also calls `ctx.resume()`
  and plays a one-sample silent buffer.
- `tone({freq, freqTo?, dur, type, gain})`: `OscillatorNode` → `GainNode` →
  destination; gain envelope = 4 ms linear attack then
  `exponentialRampToValueAtTime(0.0001, now + dur)`; `freqTo` uses
  `exponentialRampToValueAtTime` on the oscillator frequency.

| Sound | Spec |
| --- | --- |
| `blip` (flip) | square, 660 → 880 Hz, 60 ms, gain 0.10 |
| `tick` (bounce) | triangle, 300 Hz, 50 ms, gain 0.07 |
| `ping` (pass) | sine, `520 * 2 ** (Math.min(score, 12) / 24)` Hz, 90 ms, gain 0.12 — the pitch climbs through a run and resets on `reset()`, which is most of the "one more try" |
| `nearMiss` | `ping` plus sine 1200 Hz, 40 ms, gain 0.06 |
| `boom` (death) | sawtooth 220 → 60 Hz over 350 ms, gain 0.16, plus a 100 ms white-noise burst from a generated `AudioBuffer` at gain 0.10 |

`setMuted(b)` / `isMuted()` gate everything and persist. Every call is wrapped
so a thrown `AudioContext` never breaks the game and never writes to the
console.

### 7.3 `platform/haptics.ts`

`vibrate(ms)` → `navigator.vibrate?.(ms)` inside `try/catch`. Called once on
death with 18 ms. Not gated by mute.

### 7.4 `platform/viewport.ts`

Owns §2.2, §2.6 and §2.7. Exports the current `{cssW, cssH, dpr, gameW, gameH,
k, viewW, viewH, safeTopUnits, safeBottomUnits, isLandscape}` and an
`onChange(cb)` subscription. It is the only module that reads `window`
dimensions.

---

## 8. Project setup

### 8.1 `package.json`

```jsonc
{
  "name": "neonfall",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "icons": "node scripts/gen-icons.mjs",
    "test": "vitest run"
  }
}
```

`build` must typecheck. `icons` is **not** wired into `build` — the PNGs are
committed, so a fresh `npm ci && npm run build` never runs it.

### 8.2 Dependencies

- `phaser` — the engine, fixed for this round.
- `vite`, `typescript` — the toolchain.
- `vite-plugin-pwa` — manifest + service worker.
- `vitest` — only if you write tests.
- `pngjs` (**devDependency**) — *justification: build-time only; rasterises the
  procedurally-drawn PWA icons to PNG so that no binary asset is copied from
  anywhere, and the generated files are committed so the runtime build never
  needs it.*

Nothing else.

**Install trap:** if `npm i phaser@^4` reports no matching version because 4.x
is still at release-candidate, install the newest 4.x prerelease explicitly
(`npm i phaser@^4.0.0-rc.6`) and record the resolved version in `NOTES.md`.
Confirm the import form against the shipped types before writing code —
`import Phaser from 'phaser'` and `import * as Phaser from 'phaser'` are not
interchangeable in an ESM-only package. Check `node_modules/phaser/package.json`
`exports` and the bundled `.d.ts`; use whichever typechecks, and say which in
`NOTES.md`.

### 8.3 `tsconfig.json`

`"strict": true` (required), `"target": "ES2022"`,
`"lib": ["ES2022", "DOM", "DOM.Iterable"]`, `"module": "ESNext"`,
`"moduleResolution": "bundler"`, `"noEmit": true`, `"skipLibCheck": true`,
`"isolatedModules": true`, `"types": ["vite/client"]`.

### 8.4 `index.html` and `style.css`

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#070A18">
<div id="game"></div>
<div id="safe" ...></div>   <!-- §2.6 probe -->
```

```css
html, body { margin: 0; height: 100%; background: #03040C; overflow: hidden;
             overscroll-behavior: none; touch-action: none;
             -webkit-tap-highlight-color: transparent;
             user-select: none; -webkit-user-select: none; }
#game { position: fixed; inset: 0; }
canvas { display: block; }
```

`touch-action: none` and `overscroll-behavior: none` are what stop pull-to-
refresh and double-tap zoom from eating taps. Do **not** override the canvas's
CSS width/height — Phaser sets those from `zoom`, and Phaser's pointer
coordinate mapping depends on them matching.

### 8.5 `vite.config.ts`

`base: './'` (works whether the variant is served at a domain root or a
subpath), plus `VitePWA`:

```ts
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  devOptions: { enabled: false },        // keep `npm run dev` console-silent
  workbox: {
    globPatterns: ['**/*.{js,css,html,png,svg}'],
    navigateFallback: 'index.html',
    cleanupOutdatedCaches: true,
  },
  manifest: {
    name: 'Neonfall',
    short_name: 'Neonfall',
    description: 'Fall down the neon shaft. Tap to turn.',
    start_url: '.',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#03040C',
    theme_color: '#070A18',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
})
```

Verify after building: `dist/` contains `sw.js` and `manifest.webmanifest`, the
app loads with the network throttled to offline in DevTools, and Chrome offers
"Install app".

### 8.6 `scripts/gen-icons.mjs`

A Node script (run once with `npm run icons`; **commit the output**) that fills
an RGBA buffer per icon and writes it with `pngjs`:

- background `#070A18`;
- a radial magenta glow centred at 50% (alpha falling to 0 at 55% of the icon
  width);
- two magenta `#FF3D9A` horizontal bars (each 9% of height) at 26% and 72%
  height, each with a gap: the top bar's gap spans 20–44% width, the bottom
  bar's 58–82%;
- a cyan-white mote (white core to 6% of width, cyan halo to 12%) centred at
  (52%, 49%).

Sizes: `icon-192.png` (192), `icon-512.png` (512), `apple-touch-icon-180.png`
(180). `icon-maskable-512.png` is the same drawing scaled to 60% and centred on
a full-bleed `#070A18` field, so nothing important lands outside Android's
maskable safe zone. `favicon.svg` is hand-written with the same shapes.

---

## 9. Testing (recommended, your call)

`AGENTS.md` leaves testing to you. The architecture in §4.1 exists so that
testing is cheap if you want it: `core/` is pure and needs no canvas. What I
would test, if I were writing it:

- **`rng`** — `mulberry32(1)` is deterministic; all outputs in `[0, 1)`.
- **`difficulty`** — exact values at `n = 0` and `n = 15`; clamped for `n > 15`
  and `n < 0`; every parameter monotonic across the ramp.
- **`collision`** — a circle centred in the gap misses both rects; a circle
  overlapping a corner by 1 unit hits; `INSET` genuinely widens the gap by 6
  units and thins the band by 6.
- **`barriers`** — over 200 generated barriers with a fixed seed: every gap
  stays inside `[GAP_EDGE_MARGIN, WORLD_W - GAP_EDGE_MARGIN]`, and every
  consecutive gap-centre delta is `<= maxDelta` for that index (this is the
  fairness invariant — if it breaks, the game is unwinnable somewhere).
- **`gameState`** — `ready → playing` on tap; a wall bounce reverses `dir` and
  clamps `x`; each barrier scores exactly once; touching a band moves to
  `dying`; `dying → dead` after exactly `DYING_TIME`; the resume tap does not
  flip; `reset()` restores a clean run.
- **determinism** — same seed + same scripted tap timeline ⇒ identical final
  score and identical mote position. One test, and it locks the whole
  simulation.

Rendering does not need tests.

---

## 10. Done

The variant is done when all of these hold:

1. `npm ci && npm run build` is clean from a fresh checkout — no TypeScript
   errors, no warnings you introduced. `npm test` green if you wrote tests.
2. `npm run dev -- --host` runs and the game is playable start → death →
   restart entirely by touch, portrait.
3. Verified at **360 × 800 CSS px** (DevTools device toolbar, DPR 2) and at one
   larger high-DPR viewport (e.g. 480 × 1067 at DPR 3): text and edges are
   crisp at both, the shaft fills the width, the HUD clears the safe area, and
   nothing overflows or letterboxes wrongly. Rotating to landscape shows the
   rotate prompt and does not corrupt the run.
4. **Console is silent** — no logs, warnings or errors during a full run,
   including the service-worker registration and a `localStorage`-denied run
   (test with storage blocked).
5. Best score survives a reload. Backgrounding the tab mid-run pauses rather
   than kills.
6. `dist/` builds an installable PWA: Chrome offers "Install app", and the game
   loads and plays with the network offline.
7. `README.md` in your directory: what you built, what you would do next, what
   is unfinished.
8. `NOTES.md` in your directory: every place this plan was ambiguous, wrong or
   silent, and what you decided instead. Include the resolved Phaser version
   and import form, any Phaser 4 API in §11 that did not exist, and any tuning
   number you changed with its before/after.

---

## 11. Phaser 4 API notes — read before writing code

Most Phaser knowledge in training data is v3 and will not run. `Geom.Point`,
`Mesh`, `BitmapMask`, `setTintFill` and the pipeline system are **gone**.
**Look every API up in Context7** (resolve `Phaser 4`, pick the 4.x API
documentation library — verified 2026-08-01 as `4.0.0-rc.6`) rather than
recalling it.

Verified present in `4.0.0-rc.6` while writing this plan:

- `Phaser.Scale.ScaleModes.NONE` / `FIT` / `RESIZE` / `EXPAND`, and the
  top-level `Phaser.Scale.FIT`-style aliases.
- `ScaleManager.resize(w, h)` — for `NONE` mode; updates `gameSize`, `baseSize`
  and `displaySize`, resizes the canvas, and **updates the canvas CSS width and
  height when `zoom !== 1`**. This is the mechanism §2.2 depends on.
- `ScaleManager.setGameSize(w, h)` — for the scaling modes, not `NONE`.
- `GameConfig.zoom`, `autoCenter`, `autoRound`, `expandParent`, `resizeInterval`.
- `RenderConfig.antialias`, `pixelArt`, `roundPixels`, `powerPreference`,
  `batchSize`, `transparent`.
- `Graphics.generateTexture(key, width, height)` — note the docs' warning that
  `fillGradientStyle` may not survive it (hence §6.2's concentric circles).
- `this.textures.addDynamicTexture(key, w, h)` — the v4 replacement for the old
  render-texture workflow, if you prefer it over `generateTexture`.

Deliberately **not** used, so their v4 shape does not matter: Arcade Physics,
the particle emitter, tint APIs, `Loader` (there are no assets), Phaser's sound
manager.

Uncertain — check before use, and if absent take the fallback and note it:
`Camera.setZoom` / `Camera.centerOn` / `Camera.shake` (fallback: manual world
offset), `Graphics.fillRoundedRect` (fallback: `fillRect`), `Text.setStroke` /
`setShadow` (fallback: pass `stroke` / `strokeThickness` / `shadow` in the style
object at creation), `Phaser.Scale.Events.RESIZE` (fallback: the literal string
`'resize'`), `ScenePlugin.bringToTop`, `ScaleManager.setZoom` (fallback:
assign `.zoom` then call `.refresh()`).

---

## 12. If you have time left

In priority order, and only after §10 is fully satisfied:

1. A one-run "ghost" — a faint replay of your best run's mote trail. Cheap,
   because the simulation is deterministic and seeded.
2. Colour shift: hue-rotate the barrier palette every 10 barriers, so a long run
   visibly changes.
3. A "closest call" stat on the game-over card (smallest gap-edge distance).

Do not add: power-ups, currencies, multiple characters, menus, or anything with
a second screen. The whole appeal is that it is one tap and one number.
