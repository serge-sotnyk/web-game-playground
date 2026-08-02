# Implementation notes

This file records every ambiguity, incompatibility, or intentional deviation from `docs/plans/plan-b.md`.

## Initial interpretations

- **Plan wording:** “Use automatic update on a later navigation; never interrupt an active run to reload.” **Decision:** generate the service worker without `skipWaiting`/`clientsClaim` and register it after page load, allowing the normal service-worker lifecycle to activate an update after existing clients close or navigate. **Why:** vite-plugin-pwa's `registerType: 'autoUpdate'` forces `skipWaiting` and `clientsClaim`, which can replace the worker during a run and conflicts with the stronger no-interruption requirement.
- **Plan wording:** Use six gate renderers while preserving exact 205U spacing on responsive screens. **Decision:** keep a fixed six-renderer pool and bind it only to the first six active gates; the pure simulation is not capped. **Why:** six gates comfortably covers supported portrait viewports at the specified spacing, while correctness is retained if an unusually wide viewport temporarily contains more.
- **Plan wording:** The renderer reads immutable snapshots. **Decision:** the renderer accepts simulation state as read-only input and never writes it; the simulation updates its owned run in place. **Why:** this avoids per-step allocations while preserving the intended ownership boundary.

## Phaser 4 compatibility

- **Plan wording:** Set top-level Phaser `resolution` so `gameSize` stays logical while `baseSize` and the backing store are multiplied by DPR; do not CSS-scale the canvas. **Decision:** keep `Phaser.Scale.ScaleModes.RESIZE`, size a dedicated Phaser parent and backing store to logical pixels × clamped DPR, set the camera zoom and Text resolution to DPR, and set the canvas CSS box to the logical viewport. Scene layout explicitly converts Scale Manager physical dimensions back to CSS-pixel dimensions. **Why:** both the plan-targeted `4.0.0-rc.6` package and the installed `4.2.1` declarations/source have no GameConfig `resolution` field, and `Config.js` does not consume one. In current Phaser, RESIZE sets `gameSize`, `baseSize`, and the backing canvas to the parent’s 1:1 CSS size. The compatibility path is necessary to meet the stronger crisp high-DPR requirement without directly overwriting canvas backing dimensions after initialization.
- **Plan wording:** Spark visual size is `34U × 26U`, while its outer halo is a circle of radius `15U` (a `30U × 30U` footprint). **Decision:** draw the translucent outer halo as a `34U × 26U` ellipse and retain the exact `11U`, `7U`, and `3U` circular inner radii. **Why:** the two outer-envelope requirements cannot both be true; preserving the specified visual dimensions and collision inset relationship makes collision readability accurate.

## Verification boundary

- `npm ci`, all 24 Vitest tests, and `npm run build` completed successfully from `package-lock.json`.
- The generated manifest, relative production asset paths, 192/512/maskable PNG dimensions, unique nine-entry precache, and `index.html` navigation fallback were inspected.
- Interactive browser/device verification was attempted, but the browser-control session was canceled by the environment. The manual touch, rotation, live DPR backing-store inspection, installability UI, console, and offline-reload steps are therefore explicitly unfinished and are not claimed as passing.
