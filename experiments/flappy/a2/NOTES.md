# Implementation notes

No gameplay tuning number was changed. Gravity is not used by this design; all
specified geometry, speeds, spacing, collision insets, fixed-step timing, and
difficulty values were implemented as written.

## Phaser resolution and APIs

- The plan requested `phaser@^4` and described 4.0.0-rc.6 as the reference
  version. On 2026-08-01 npm resolved that range to **Phaser 4.2.1**. The
  installed package exports an ESM build and an `export = Phaser` declaration;
  with the project's bundler resolution and synthetic-default-import settings,
  **`import Phaser from 'phaser'`** typechecks and builds.
- The Phaser 4 API was checked first against the required Context7
  `/websites/phaser_io_api-documentation_4_0_0-rc_6` reference, then against the
  installed 4.2.1 declarations. `Camera.setZoom`, `Camera.centerOn`,
  `Camera.shake`, `Graphics.generateTexture`, `Graphics.fillRoundedRect`,
  `Graphics.strokeRoundedRect`, `Text.setStroke`, `ScenePlugin.bringToTop`,
  `ScaleManager.setZoom`, and `Phaser.Scale.Events.RESIZE` all exist. No API
  fallback was needed.
- The plan showed top-level scale aliases but explicitly allowed the namespaced
  equivalents. The implementation uses `Phaser.Scale.ScaleModes.NONE` and
  `Phaser.Scale.Center.CENTER_BOTH`, which are the forms exposed clearly by the
  installed types.

## Ambiguities and contradictions resolved

- **Dead-state reset seed.** The plan said the scene should normally call
  `state.tap()`, that a dead-state tap resets the game, that `reset(seed)`
  requires a seed, and that core must never read `Date`. These cannot all be
  true simultaneously. The scene recognizes a dead-state tap and calls
  `state.reset(Date.now() | 0)`, keeping time injection outside core.
- **First pointer and audio unlock.** The input pseudocode returned early for a
  pause or mute hit before calling `audio.unlock()`, while the audio section
  required unlock on the first pointerdown. The implementation calls unlock at
  the top of every pointer handler, then applies pause/mute/gameplay routing, so
  a first tap on mute or resume still satisfies the browser gesture policy.
- **Pause scope.** The state diagram only drew a pause transition from playing,
  but the viewport section required landscape to enter paused regardless of
  when rotation happens. `requestPause()` therefore remembers and freezes any
  non-paused phase (including ready, dying, or dead), and resume returns to that
  exact phase. Landscape taps are ignored until portrait is restored.
- **Ready-state resize.** The plan required barrier 0 at `0.90 * viewH`, a safe
  mid-run resize, and no reset on resize, but did not say what to do before the
  run starts. While ready (including ready paused for rotation), all barriers
  shift by `0.90 * (newViewH - oldViewH)` and the mote moves to the new anchor.
  This preserves the authored opening composition without regenerating the
  seeded course or resetting horizontal drift.
- **Fatal crossing order.** Collision and scoring were specified but their
  same-step ordering was not. Collision is checked first; a mote that touches a
  band on the crossing step dies and does not receive that barrier's point.
- **Wide-view background bounds.** The plan said the background graphics is at
  x=0, fills `viewW`, and shows equal letterbox space around a shaft spanning
  x=0..540. Those coordinates conflict when `viewW > 540`. The outside fill is
  drawn from `270 - viewW / 2`; the shaft remains at x=0..540, producing the
  required equal margins without hand-transforming scene objects.
- **Wall-flash extent.** The plan specified a 10-unit width and 0.2-second life
  but no length along the wall. The flash is 96 world units tall, centered at
  the bounce y-coordinate.
- **Star bases during resize.** The plan called each star base fixed but did not
  define a resize policy. Each star stores a fixed normalized base and maps it
  into the current `viewH + 80`, maintaining the specified count and even
  distribution after a mid-run resize without rerandomizing.

## Build-only dependency

- `pngjs`: build-time only; it rasterizes the procedural PWA icons, which are
  committed/generated assets, and is never loaded by the runtime bundle.

## Verification notes

- `npm test`: 12 core/platform tests pass, covering responsive viewport math,
  RNG, difficulty, collision,
  reachability, state transitions, scoring, reset, pause/resume, and
  determinism.
- `npm ci --cache .npm-cache` succeeds from the lockfile. npm reports one
  upstream deprecation notice for `glob@11.1.0`, pulled transitively by the
  required current `vite-plugin-pwa@1.3.0` through `workbox-build`; it is not a
  direct project dependency.
- `npm run build`: strict TypeScript and the Vite PWA production build pass;
  the output contains the manifest, service worker, Workbox runtime, and all
  icons.
- Vite's default chunk warning threshold is smaller than Phaser's single engine
  bundle. `build.chunkSizeWarningLimit` is set to 1600 kB so a successful build
  stays warning-free; no code splitting or runtime dependency was added.
- Automated interactive browser inspection was attempted but the browser
  control session was cancelled before connection. The responsive calculations
  and state behavior are covered by code/tests, but final physical-device
  install, safe-area, audio, haptic, and subjective crispness checks remain the
  follow-up listed in `README.md`.
