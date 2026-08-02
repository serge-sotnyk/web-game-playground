# Flux Flip

Flux Flip is a portrait, one-touch Phaser 4 PWA. Flip a cyan/coral spark between reactor rails, pass drifting gates, and chase a locally persisted best score. All art and sound are procedural and the pure simulation is covered by Vitest.

## Commands

- `npm run dev` — start the Vite development server.
- `npm test` — run pure game-logic tests.
- `npm run build` — type-check and create the production PWA in `dist/`.
- `npm run preview` — serve the production build for install/offline checks.

No dependencies beyond the plan-approved Phaser, Vite, TypeScript, vite-plugin-pwa, and Vitest are used.

## Next / unfinished

The automated suite, clean lockfile install, production build, manifest, icon sizes, relative asset paths, and service-worker precache were verified. The next step is the plan's hands-on Android Chrome pass: play at 360 × 800 and a 412 × 915 high-DPR device profile, rotate during every state, inspect the live backing-store dimensions and console, install, then reload offline. Browser automation was unavailable in this implementation session, so those interactive/device checks remain unfinished rather than being reported as passed.

See `NOTES.md` for the two Phaser/visual plan interpretations.
