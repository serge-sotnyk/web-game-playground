# Implementation plan — *Flux Flip*

## 1. Product definition

Build **Flux Flip**, a portrait, one-touch endless game for Android Chrome. The player is a charged spark moving automatically through a dark reactor corridor. Tapping reverses which rail attracts the spark: cyan/up or coral/down. The player reads the next opening, flips polarity, and traces a smooth zig-zag through moving energy gates. Passing one gate scores one point; touching a gate or either rail ends the run.

The game should be understandable from the ready screen text, **“Tap to flip gravity”**, and from an animated up/down arrow. There is no tutorial sequence, currency, shop, level select, or network feature. The intended loop is launch, tap once to start, survive, see the score, and tap once to retry.

The art, particles, sounds, app icons, and fonts must be original/procedural or system-provided. Do not copy art, audio, layout, or names from an existing game.

## 2. Required technical foundation

- Use vanilla Vite, TypeScript with `strict: true`, npm, and `phaser@^4`. Do not use React or another UI framework.
- Use `vite-plugin-pwa` for the manifest and generated service worker, and Vitest for the pure game-logic tests described below.
- Use Phaser only for its game loop, scene, input, drawing, text, camera, and canvas management. Implement the small physics/collision model in framework-independent TypeScript; do not enable Arcade or Matter physics.
- Use Phaser 4 APIs, not Phaser 3 recollection. The plan was checked against Context7 library `/websites/phaser_io_api-documentation_4_0_0-rc_6`. Known suitable APIs include `Phaser.Scale.ScaleModes.RESIZE`, the Scale Manager `gameSize`/`baseSize`/`displaySize` model, and `Graphics.fillStyle`, `fillRect`, `fillCircle`, `lineStyle`, and `strokeRect`.
- Do not use removed/incompatible APIs called out for this round: `Geom.Point`, `Mesh`, `BitmapMask`, `setTintFill`, or the old pipeline system. Prefer plain typed `{ x, y }` data and long-lived `Graphics` objects. If an API signature is uncertain, confirm it in the Phaser 4.x docs or installed type declarations before using it.
- There must be no runtime requests. Use no remote fonts, analytics, CDNs, APIs, or fetched assets.

No dependency beyond Phaser, Vite, TypeScript, `vite-plugin-pwa`, and Vitest is needed. If implementation genuinely adds one, document it in `README.md` with a one-line justification and keep it out unless it is essential.

## 3. Responsive coordinate system and display quality

Treat all simulation coordinates as logical CSS pixels. On every layout calculation obtain logical width `W` and height `H` from the Phaser Scale Manager, then define:

- `U = clamp(min(W / 360, H / 800), 0.75, 1.35)`. Every tuned dimension or speed suffixed with `U` below is multiplied by this scale.
- `playTop = max(safeTop + 48U, 56U)`.
- `playBottom = H - max(safeBottom + 28U, 48U)`.
- Fixed player center x: `playerX = 0.27W`.

Expose CSS safe-area values as custom properties using `env(safe-area-inset-*)`, read them on resize, and pass them into layout calculation. Rails define the physical top and bottom of the play corridor. The HUD occupies the protected space above the top rail; obstacles and collision bounds use `playTop` and `playBottom`, not assumed screen heights.

Use a parent that fills the visual viewport (`100dvw` by `100dvh`, with a `100vh` fallback), and set `html`, `body`, and the parent to zero margin, no overflow, black background, and `touch-action: none`. Include a viewport meta tag with `width=device-width`, `initial-scale=1`, `viewport-fit=cover`, and disabled user scaling so browser gestures do not steal play input.

Create Phaser with an opaque canvas, antialiasing on, pixel art off, and Scale Manager `RESIZE` mode. Set the initial game size from the parent’s measured CSS size and set the top-level Phaser game-config `resolution` to `clamp(window.devicePixelRatio || 1, 1, 4)`. In this model `gameSize` remains logical and `baseSize`/the canvas backing store is logical size multiplied by resolution. Do not manually CSS-scale or overwrite the backing dimensions after Phaser has initialized.

Listen to the Scale Manager resize event. Recalculate layout, redraw static graphics, reposition HUD/overlays, and remap an active run as follows:

- Preserve the player’s normalized vertical position inside the old play corridor, then place it at the same normalized position in the new corridor.
- Preserve each gate’s normalized horizontal position `x / oldW`; preserve each base gap center’s normalized vertical position inside the old corridor.
- Multiply player velocity by `newU / oldU`; gate dimensions, gaps, drift amplitudes, effects, and future spawn spacing use `newU`.
- Clear the fixed-step accumulator after resizing so a resize cannot cause a simulation jump.

The installed PWA requests `portrait-primary`. If the live viewport becomes landscape (`W >= H`), pause simulation and show a centered **“Rotate your phone”** overlay. Returning to portrait leaves the run in the paused state and requires a tap to resume; that tap must not also flip polarity.

## 4. Exact game rules and tuning

### Player motion

The player has no horizontal simulation velocity; the world scrolls left.

- Visual spark size: `34U × 26U`.
- Collision rectangle: `22U × 16U`, centered on the player. This is an inset of `6U` on each visual side and `5U` on the top and bottom. Rotation is visual only and never changes this hitbox.
- Reset position: `(0.27W, midpoint(playTop, playBottom))`.
- Reset vertical velocity: `0`.
- Reset attraction direction: down (`+1`). The first gameplay tap flips it upward.
- Vertical acceleration: `direction × 900U px/s²`.
- On an accepted tap: multiply direction by `-1`, then set `vy = clamp(vy + direction × 330U, -420U, +420U)`.
- Clamp vertical velocity to `±420U px/s` after acceleration.
- Ignore gameplay taps received less than 70 ms after the last accepted gameplay tap. Sound/mute interactions do not update this timer.
- Draw rotation as `clamp(vy / (420U) × 24°, -24°, +24°)`.
- Collide when the player collision rectangle touches or crosses `playTop` or `playBottom`.

Run the pure simulation with a fixed step of `1/120` second. Add Phaser’s frame delta to an accumulator after clamping one frame to at most 50 ms, process at most six steps, and interpolate only render positions between the previous and current snapshots. Queue at most one polarity flip for the next fixed step; never apply input directly halfway through a step.

### Gates, gaps, spawning, and score

Each gate is a top and bottom rectangular energy column sharing one x position and leaving a vertical gap.

- Gate visual width: `58U`.
- Gate collision width: `50U`, centered within the visual column, giving a `4U` left/right inset.
- Gate gap height at spawn: `max(146U, 184U - score × 1.6U)`. The minimum is reached at score 24.
- World scroll speed: `min(170U/s, 132U/s + score × 1.6U/s)`.
- Center-to-center gate spacing: exactly `205U`. Therefore the nominal spawn interval is 1.553 seconds at score 0 and 1.206 seconds at maximum speed. Spawn by distance, not by an independent timer, so spacing stays constant as speed changes.
- Spawn x is `W + 72U`. Spawn the next gate when the rightmost gate reaches `spawnX - 205U`.
- The first gate spawns at run start with its base gap center at the corridor midpoint. At 360 × 800 it reaches the player after about 2.75 seconds, leaving time to understand the control.
- Remove a gate once its right visual edge is left of `-24U`.

For every later gate, calculate drift amplitude first:

- Scores 0–5: `0`.
- Score 6 onward: `min(20U, (score - 5) × 1.25U)`.
- Drift period: 3.4 seconds.
- Choose phase uniformly from `[0, 2π)` with the run RNG.
- Current center is `baseCenter + amplitude × sin(2π × gateAge / 3.4 + phase)`.

Choose the base center inside:

`[playTop + gapHeight/2 + 24U + amplitude, playBottom - gapHeight/2 - 24U - amplitude]`.

Start from the previous gate’s base center plus a uniform random offset in `[-118U, +118U]`, then clamp into that interval. If the resulting center is less than `36U` from the prior center, first try `previous + sign(offset) × 36U` (choose the sign with one RNG bit when offset is exactly zero), clamped to the legal interval. If that still leaves less than `36U`, try the opposite side; if neither side can provide `36U`, retain the original clamped candidate. This produces readable variation without impossible edge gaps. Store gap height, amplitude, phase, and base center on each gate at spawn; only x and age then change.

Use a small injectable `mulberry32`-style seeded generator. In production seed each run from `(Date.now() XOR runCounter × 0x9e3779b9) >>> 0`; tests pass a fixed seed. Do not use `Math.random()` inside simulation functions.

Gate collision uses the same drifted center that rendering uses. The top collision rectangle ends `5U` before the visible top lip of the opening, and the bottom rectangle starts `5U` after the visible bottom lip, making the collision gap `10U` more forgiving than the art. Use inclusive AABB intersection between the player and the two gate rectangles.

Mark a gate scored exactly once when its trailing visual edge (`x + 29U`) becomes less than `playerX`. Increment score before calculating the next difficulty level and emit a score event for presentation/audio. Collision wins over scoring if both happen in the same fixed step. Display integer score only; no fractional distance score or collectibles.

Within each fixed step, use this order: consume the queued flip; apply acceleration and clamp/integrate player velocity and y with semi-implicit Euler; calculate speed from the score at the beginning of the step and advance gate x/age; test corridor and gate collisions and immediately emit only `CRASHED` on a hit; mark passes and increment score; remove expired gates; then spawn as many gates as needed to restore `205U` spacing, using the now-current score for each new gate’s difficulty. This ordering is part of the game rules and the unit tests.

## 5. State machine and input

Model the state explicitly; do not infer it from visible objects.

1. **BOOT** — create the scene, load saved settings, build long-lived render objects, and calculate layout. With no external asset load, transition directly to READY.
2. **READY** — show title, best score, **“Tap to flip gravity”**, and an arrow alternating up/down every 700 ms. The spark may bob visually by `4U`, but the simulation is stopped. A non-mute pointer tap or Space/Enter starts a new run and applies the normal first flip in the same input.
3. **PLAYING** — fixed-step simulation, spawning, scoring, flip input, effects, and sound are active.
4. **PAUSED** — entered from PLAYING on `document.hidden`, window blur, or returning from the landscape blocker. Freeze the simulation and clear its accumulator. Once visible and portrait, show **“Paused · tap to continue”**. The next non-mute tap resumes without flipping.
5. **DYING** — entered immediately on the first collision. Disable collision, scoring, spawning, and gameplay input; save a new best score now. Over 250 ms reduce world scroll presentation to zero, hold the spark at the impact point, play the burst/shake, and after 650 ms enter RESULTS.
6. **RESULTS** — show `SCORE`, `BEST`, a `NEW BEST` label when appropriate, and **“Tap to retry”**. Lock retry input for the first 350 ms to prevent the collision tap from carrying through. The next accepted tap resets everything, enters PLAYING directly, and applies the first upward flip; no second start tap is required.

Use Phaser’s scene pointer input for touch/mouse. Also support Space, Enter, or ArrowUp for desktop verification, ignoring key-repeat; `M` toggles mute. Prevent browser default behavior. A visible sound button at the top-right must have a minimum 44 × 44 CSS-pixel hit target. Test it before routing a pointer to the state machine, so muting never flips or starts the game. Back the sound control with a real HTML button layered above the canvas, including `aria-label`, rather than an inaccessible canvas-only hit region.

## 6. Presentation and feedback

Use a restrained neon-reactor style built from procedural primitives:

- Background: opaque `#071225`, overdrawn on resize with 12 horizontal color bands interpolating toward `#111a38`; add 24 deterministic, low-alpha dots for depth. Move only their x positions at 15% of world speed for parallax.
- Rails: `10U` dark bars at `playTop` and `playBottom`, a `2U` cyan/coral inner line, and short moving dashes tied to cumulative world distance. The upper rail is cyan, lower rail coral, so polarity is not communicated by text alone.
- Spark: outer halo circle radius `15U` at alpha 0.12, ring radius `11U`, solid core radius `7U`, and a `3U` white center. Up polarity is cyan `#4DEBFF`; down polarity is coral `#FF6687`. Redraw colors on flip; do not tint an existing object.
- Gates: indigo `#26346B` columns, `2U` pale outline, brighter `8U` lip at each gap edge, and three small circuit nodes per visible segment. Keep collision geometry visibly inside the outline.
- HUD: centered white score, 42 px at `U = 1`, with a dark 2 px shadow; title 38 px, body 18 px, result score 52 px. Use a local system stack (`system-ui`, Roboto fallback, sans-serif), not a downloaded font. Scale font sizes by `U`, rounded to integer pixels.

Allocate long-lived Graphics/Text objects and pools during scene creation. Pool six gate renderers, 48 particles, and 16 trail motes. Do not create a Phaser object every frame. Redraw the static background only on create/resize. Update score text only when the score changes. A gate may redraw its two rectangles when its drifted gap changes, but reuse the same Graphics instance.

Feedback timings are exact:

- Flip: emit six tiny trail particles; show a ring expanding from `12U` to `34U` and fading to zero over 180 ms.
- Score: scale the score text from 1.0 to 1.18 over 70 ms and back to 1.0 over 100 ms; flash both gate lips white for 90 ms.
- Collision: emit 24 particles lasting 450 ms, apply a render-only shake with 5U peak displacement decaying to zero over 180 ms, and briefly overlay coral at alpha 0.18 for 80 ms.
- Honor `prefers-reduced-motion`: remove shake, reduce all particle counts by 75%, and keep scale animations at 1.0. Gameplay motion remains unchanged.

Generate sound with a small Web Audio service after the first pointer gesture; no audio files are needed. Resume the `AudioContext` on a user gesture and treat failure as silent operation without logging an error.

- Flip: triangle oscillator sweeping 520 Hz to 760 Hz over 45 ms, peak gain 0.035.
- Score: sine oscillator sweeping 880 Hz to 1180 Hz over 70 ms, peak gain 0.04.
- Hit: sawtooth oscillator sweeping 150 Hz to 70 Hz over 180 ms, peak gain 0.055.

Use short gain ramps to avoid clicks and disconnect completed nodes. Default sound to on, provide the mute button, and persist the choice. Never autoplay before a gesture.

## 7. Code organization and responsibilities

Keep the implementation small and make the simulation testable without Phaser or a canvas. Use this module split (minor filename changes are acceptable only if responsibilities remain separate):

- `src/main.ts` — imports CSS, measures the parent, constructs Phaser with the high-DPI/resize configuration, and registers the PWA service worker behavior.
- `src/style.css` — full-viewport/safe-area layout, canvas rules, accessible sound button, and screen-reader-only utility.
- `src/game/constants.ts` — all numeric tuning and colors from this plan; no unexplained gameplay literals elsewhere.
- `src/game/types.ts` — game state, gate, input, layout, simulation event, and render snapshot types.
- `src/game/layout.ts` — pure `W`/`H`/safe-inset to layout calculation plus active-run remapping helpers.
- `src/game/rng.ts` — seedable RNG and range helpers.
- `src/game/collision.ts` — pure AABB and player/gate/boundary checks.
- `src/game/simulation.ts` — pure run creation, fixed-step motion, spawning, drift, collision ordering, scoring, difficulty, and state transitions. It emits semantic events and never plays sound or creates Phaser objects.
- `src/game/storage.ts` — guarded localStorage parsing and writes.
- `src/game/audio.ts` — lazy Web Audio setup and the three procedural cues.
- `src/game/GameScene.ts` — Phaser lifecycle, accumulator, input routing, visibility handling, resize handoff, semantic-event handling, and state overlays.
- `src/game/Renderer.ts` — long-lived procedural Graphics/Text creation, pooling, layout, interpolation, particles, and other presentation-only timing.
- `src/**/*.test.ts` — focused Vitest tests beside or under the pure modules.

`GameScene` owns the current high-level state. The pure simulation owns run data. The renderer reads immutable snapshots and never mutates simulation state. Simulation emits `FLIPPED`, `GATE_SPAWNED`, `SCORED`, and `CRASHED` events; the scene maps them to sounds/effects/storage. Remove DOM, keyboard, resize, visibility, and Scale Manager listeners during scene shutdown so hot reload or scene restart cannot duplicate them.

## 8. Persistence and PWA behavior

Use one localStorage key, `flux-flip:v1`, with JSON shape `{ "best": number, "muted": boolean }`. Wrap reads and writes in `try/catch`. Validate best as a finite, non-negative integer and clamp it to 999999; validate muted as a boolean. Corrupt, missing, quota-blocked, or privacy-blocked storage falls back to `{ best: 0, muted: false }` in memory with no console error. Write only when mute changes or a run produces a new best.

Configure `vite-plugin-pwa` to generate and register a service worker that precaches the complete build output and serves `index.html` as the navigation fallback. Use relative/base-safe asset paths so a subpath deployment works. Use automatic update on a later navigation; never interrupt an active run to reload.

Manifest values:

- Name: `Flux Flip`
- Short name: `Flux Flip`
- Description: `Flip polarity and thread the reactor gates.`
- Display: `standalone`
- Orientation: `portrait-primary`
- Theme color: `#071225`
- Background color: `#071225`
- Start URL and scope: relative to the deployed app root

Provide original icons at 192 × 192 and 512 × 512 plus a 512 × 512 maskable icon. The icon is the cyan/coral spark centered on the navy field; keep all critical maskable artwork inside the central 80% safe zone. Checked-in SVG is fine for the source artwork, but the manifest must include PNG versions for dependable Android installation. Precache HTML, JS, CSS, icons, and the manifest. Once loaded successfully, the game must start, play, die, retry, read/write best score, and produce its procedural audio with the network disabled.

## 9. Tests and verification

Write Vitest coverage for behavior that can regress without a canvas:

- `layout`: at 360 × 800 with zero safe inset assert `U = 1`, `playTop = 56`, `playBottom = 752`, and `playerX = 97.2`. At 412 × 915 with safe top 24, safe bottom 16, and zero left/right insets assert `U = 1.14375`, `playTop = 78.9`, `playBottom = 860.1`, and `playerX = 111.24` within floating-point tolerance. Active positions and velocity must remain proportional after resize.
- `motion`: the first tap changes direction to up and applies `-330U`; the next accepted tap reverses it; the 70 ms debounce works; velocity never exceeds `420U`; fixed stepping gives the same state within floating-point tolerance when driven by 30, 60, and 120 Hz frame deltas.
- `difficulty`: assert gap heights of `184U` at score 0 and `146U` at score 24+, speeds of `132U/s` at score 0 and `170U/s` at score 24+, and the corresponding spawn intervals.
- `gates`: fixed RNG seeds produce deterministic centers/phases, center change and edge constraints hold, spawn centers stay `205U` apart, drift never leaves its reserved bounds, and a gate scores once only.
- `collision`: visual-only areas inside every stated player/gate inset do not collide; actual hitbox edge contact does; corridor contact crashes; if pass and collision coincide, only crash is emitted.
- `state`: READY start, PLAYING flip, collision to DYING, 650 ms to RESULTS, 350 ms retry lockout, single-tap retry, visibility pause, tap-to-resume-without-flip, and landscape pause all transition exactly as specified.
- `storage`: missing, corrupt, wrong-type, negative, enormous, and unavailable localStorage cases safely normalize.

Then manually verify a production build, not only the Vite dev server:

1. Run `npm ci`, `npm test`, and `npm run build`; all must finish cleanly with no TypeScript errors.
2. Play start-to-death-to-retry using touch emulation at 360 × 800 CSS px. Confirm instructions and score fit, the 44 px sound target is usable, no browser scroll/zoom occurs, and no gate or HUD is clipped.
3. Repeat at 412 × 915 with DPR 3.5 (or the closest available Galaxy S-Ultra profile). Inspect the canvas: backing width/height should be approximately rounded CSS dimensions × 3.5, not merely CSS dimensions, and graphics/text must be crisp.
4. Resize between those viewports during READY, PLAYING, DYING, and RESULTS. Confirm positions remap, collision art stays aligned, no score is granted, and no simulation jump occurs.
5. Rotate to landscape and back. Confirm the blocker and deliberate tap-to-resume behavior.
6. Confirm pointer and keyboard controls, mute persistence, best-score persistence, reduced-motion presentation, background tab pause, and a silent browser console.
7. Serve the production build, load it once online, verify the browser recognizes it as installable, then disable the network and reload. Complete another full run and retry offline. Confirm the Network panel shows no attempted remote asset/API requests.
8. On a representative Android Chrome device or emulator, verify stable play with no obvious frame drops, no missed taps, and no accidental page gestures.

## 10. Delivery and definition of done

The implementation is done only when all rules and values above are represented in code and the complete manual flow passes at both required viewports. `npm ci && npm run build` must work from a fresh checkout, and because this plan requires tests, `npm test` must also be green. The console must remain silent during boot, play, collision, restart, resize, background/resume, and offline reload.

At the implementation root, include a short `README.md` stating what was built, how to run/build/test it, what should be done next, and anything unfinished. Also maintain `NOTES.md` as required by the repository protocol: for every ambiguous, infeasible, or incompatible instruction, record what this plan said, the implementation decision, and why. Do not silently redesign tuning or substitute Phaser 3 APIs.
