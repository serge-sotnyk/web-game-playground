This repository runs a controlled comparison of agent workflows — see README.md
for the design. What matters to you: several agents are solving the same problem
independently, and the experiment is worthless if that independence leaks.

## Your role

Every task here assigns one: **planner**, **implementer**, or **orchestrator**.
If yours was not stated, ask before doing anything else.

## Isolation — planners and implementers only

Your assigned directory is your world. Do not read other variants under
`experiments/`, other plans under `docs/plans/`, or any branch but your own.
No `git log --all`, no `git branch -a`, no `git show <other-ref>`.

If you stumble onto another variant's work, stop reading and say so. A stalled
task is recoverable; a contaminated one is not.

You are not competing with anyone. You are one sample. Solve the problem the
way you would solve it.

## Orchestrator

Exempt from the above — reading across branches, merging and comparing is the
job. Do not carry content from one variant into another variant's context.

## Constraints

- Vite + TypeScript, `strict`. npm. No global installs, no `sudo`.
- Canvas 2D, or Phaser — and if Phaser, **v4** (`phaser@^4`). Most Phaser
  knowledge in training data is v3 and will not run: `Geom.Point`, `Mesh`,
  `BitmapMask`, `setTintFill` and the pipeline system are gone. Use the
  `skills/` directory in the Phaser repo, or Context7, instead of recall.
- Web only. No Capacitor, Cordova, Gradle, Android SDK.
- No backend, no network at runtime. `localStorage` for persistence.
- Beyond Vite, TypeScript, Phaser, `vite-plugin-pwa`, `vitest` — justify each
  dependency in one line.
- Assets: procedural or CC0, never copied from an existing game.
- Target: Android Chrome, portrait, touch, 360×800 CSS px. Correct
  `devicePixelRatio` handling — a blurry canvas is a failed variant.
- Installable PWA: manifest, service worker, playable offline.

## Planner

One markdown file at the path you were given. No code, no scaffolding.

It goes to an agent that has never seen this conversation and cannot ask you
anything, so it has to stand alone. Give concrete numbers — gravity, flap
impulse, gap size and drift, scroll speed, spawn interval, hitbox insets —
rather than ranges you expect someone else to resolve. Cover the design
decisions the brief leaves open, module boundaries, the state machine, and
what "done" means.

Ambiguity you leave will be resolved by guessing, and the guess will be scored
as yours.

## Implementer

Build the plan you were given. Where it is ambiguous, wrong, or silent, do not
quietly redesign — implement your reading of its intent and record the decision
in `NOTES.md`: what the plan said, what you did, why.

`NOTES.md` is a primary result of this experiment, not paperwork. It is how
plan quality gets measured.

Game logic — physics, collision, scoring, state machine — must be testable
without a canvas and covered by `vitest`. Rendering need not be.

## Done

`npm ci && npm run build && npm test` clean from a fresh checkout. Playable
start-to-restart by touch at 360×800 with a silent console. A short `README.md`
in your directory: what you built, what you would do next, what is unfinished.