# AGENTS.md

Rules for any AI agent working in this repository. Read this before doing
anything else.

## What this repository is

A controlled comparison of multi-agent workflows. Several agents are producing
independent solutions to the same problem, in isolation from one another. The
value of the experiment depends entirely on that isolation holding.

## Isolation rules — these are the important ones

- Work **only** inside the directory you were assigned. Do not create or modify
  files elsewhere, except your own plan file if you are planning.
- Do **not** inspect other branches. No `git log --all`, no `git branch -a`,
  no `git show <other-ref>`, no `git diff` against anything but your own base.
- Do **not** read other variants under `experiments/`, even if they are visible.
- Do not consult `MAPPING.local.md` if it exists.
- If you encounter another variant's code or plan, stop and say so rather than
  reading further. Contamination is a worse outcome than an unfinished task.

You are not being asked to be the best agent here. You are being asked to be
an honest sample. Solve the problem the way you would solve it.

## Hard constraints

- **Build:** Vite + TypeScript. `strict: true`.
- **Package manager:** npm. No global installs. No `sudo`.
- **Rendering:** Canvas 2D, or Phaser. If Phaser, it must be **Phaser 4**
  (`phaser@^4`). Phaser 3 APIs are wrong here: `Geom.Point`, `Mesh`,
  `BitmapMask`, `setTintFill`, and the v3 pipeline system are all gone.
  Consult the `skills/` directory in the Phaser repository or Context7 rather
  than relying on recall — most Phaser knowledge in the wild is v3.
- **No native tooling.** No Android Studio, Gradle, Capacitor, Cordova, or
  Android SDK. This ships as a web app. Do not propose otherwise.
- **No backend.** No server, no API calls at runtime, no analytics.
- **Persistence:** `localStorage` only.
- **Dependencies:** keep the tree small. Anything beyond Vite, TypeScript,
  Phaser, `vite-plugin-pwa` and `vitest` needs a one-line justification in
  your notes.
- **Assets:** generate them (shapes, procedural sprites, WebAudio) or use
  clearly-licensed CC0. Never copy assets from an existing game.

## Target device

Android Chrome, portrait, touch-first. Must be fully playable at 360×800 CSS
pixels with no horizontal scroll and no reliance on hover or keyboard. Handle
`devicePixelRatio` properly — a blurry canvas is a failure. Audio must start
from a user gesture. Ship a web app manifest and a service worker so the game
installs to the home screen and runs offline.

## If you are planning

Write a single markdown file at the path you were given. **No code.** No
scaffolding, no `package.json`, nothing but the plan.

The plan will be handed to a *different* agent that has never seen this
conversation. It must be self-sufficient. Cover:

- Game design decisions and their rationale — the brief is underspecified on
  purpose, and closing those gaps is your job, not the implementer's.
- Concrete tuning numbers: gravity, flap impulse, pipe gap, gap drift, scroll
  speed, spawn interval, hitbox insets. Ranges are acceptable; silence is not.
- Architecture: module boundaries, the update/render split, state machine for
  menu → playing → dead → restart.
- File layout.
- What should be unit-tested versus what only manual play can catch.
- Definition of done.

Be decisive. An implementer facing an ambiguous plan will guess, and the guess
will be attributed to you.

## If you are implementing

Follow the plan you were given. Where it is ambiguous or wrong:

- Do not silently redesign. Implement your best reading of the plan's intent.
- Record every deviation in `NOTES.md` in your variant directory: what the plan
  said, what you did, why. This file is a primary artefact of the experiment —
  it is how plan quality gets measured. Treat it as part of the deliverable.

Separate game logic from rendering. Physics, collision, scoring and the state
machine should be testable without a canvas, and should have `vitest` coverage.
The rendering layer can go untested.

## Definition of done

- `npm ci && npm run build` succeeds from a clean checkout with no warnings you
  introduced.
- `npm run dev -- --host` serves a playable game.
- `npm test` passes.
- No errors or warnings in the browser console during a full play session.
- Playable end-to-end with touch at 360×800: start, flap, score, die, restart.
- `README.md` in your variant directory: what you built, how to run it, what
  you would do next, anything you consider unfinished.

Do not commit `node_modules`, build output, or `.env` files.