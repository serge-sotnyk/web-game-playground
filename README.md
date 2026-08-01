# web-game-playground

Experiments in autonomous game creation. The human orchestrates; agents do all
the design and all the coding.

## The experiment

**Question:** in a plan-then-implement pipeline, how much of the outcome is
determined by *who wrote the plan* versus *who wrote the code*?

**Design:** a 2×2 matrix. Two agents independently produce a plan from the same
one-line brief. Each plan is then implemented independently by both agents.
Four variants of the same game.

|               | Implementer 1 | Implementer 2 |
| ------------- | ------------- | ------------- |
| **Planner A** | `flappy/a1`   | `flappy/a2`   |
| **Planner B** | `flappy/b1`   | `flappy/b2`   |

Reading down a column isolates the effect of the plan (implementer held fixed).
Reading across a row isolates the effect of the implementer (plan held fixed).

Agent identities are anonymised as A/B and 1/2 throughout the repository. The
mapping is kept in an untracked local file so that agents working here cannot
condition on who wrote what.

**Caveat, stated upfront:** n=1 per cell. Run-to-run variance within a single
agent may well exceed the variance between agents. This is an exploratory probe,
not a benchmark, and the results should be read as anecdote.

## Method

Each cell is a separate branch, and each variant writes only into its own
directory, so nothing overlaps on disk and nothing conflicts on merge.

```
main
├── plan/a                  → docs/plans/plan-a.md
│   ├── flappy/a1           → experiments/flappy/a1/
│   └── flappy/a2           → experiments/flappy/a2/
└── plan/b                  → docs/plans/plan-b.md
    ├── flappy/b1           → experiments/flappy/b1/
    └── flappy/b2           → experiments/flappy/b2/
```

Letter = planner, digit = implementer. Isolation is enforced by the working
tree rather than by trust: a branch physically contains no other variant, and
each session runs in a single-branch clone so that no other refs exist locally.

Three roles are used, and every session is told which one it has. Planners and
implementers are sandboxed to one directory and one branch. The orchestrator
moves across branches, merges results and does the comparison. The full
procedure is in [`docs/protocol.md`](docs/protocol.md).

## Round 1 — Flappy Bird

The brief handed to both planners, verbatim:

> A Flappy Bird-style game for mobile browsers, playable in portrait on a phone.
> All game design decisions are yours.

Deliberately underspecified. How an agent fills the gaps is part of what is
being measured.

## Evaluation criteria

Fixed before any variant was run, to keep the scoring honest.

The rubric below is visible to every agent that works here. That is deliberate:
a shared, stated target measures execution against a known spec, rather than
measuring who best guessed the human's taste. It is identical across all four
cells, so it cannot bias the comparison between them.

- **Cold start.** Does `npm ci && npm run build && npm run dev` work first try,
  with zero human fixes?
- **Interventions.** How many times did the human have to unblock the agent?
- **Runs on the target device.** Portrait, touch, 360×800 CSS px, real Android
  Chrome. Any layout or input breakage?
- **Feel.** Hitbox fairness, difficulty curve, responsiveness, juice. Does it
  actually play like Flappy Bird?
- **Bugs.** Found in ten minutes of unstructured play.
- **Structure.** Is game logic separated from rendering? Are there tests? Is the
  code something a human could pick up?
- **Scope discipline.** Did it build what the plan said, or wander?
- **Fidelity to plan.** For implementers: how much was silently redesigned?
  (see each variant's `NOTES.md`)
- **The kid verdict.** Four unlabelled builds, ranked by a nine-year-old. The
  only criterion that is not a proxy for anything.

## Layout

```
docs/plans/plan-a.md          # produced on branch plan/a
docs/plans/plan-b.md          # produced on branch plan/b
docs/protocol.md              # step-by-step procedure for the orchestrator
experiments/flappy/a1/        # self-contained Vite project
experiments/flappy/a2/
experiments/flappy/b1/
experiments/flappy/b2/
AGENTS.md                     # rules for any agent working here
CLAUDE.md                     # shim that imports AGENTS.md
```

Each variant directory is an independent Vite project with its own
`package.json`. There is no shared build.

## Stack

Vite + TypeScript. Canvas 2D, or Phaser 4 where physics justifies it.
PWA via `vite-plugin-pwa`. Deployed to Cloudflare Pages, installed to the
home screen on Android. No native toolchain anywhere in the loop.

## Running a variant

```bash
cd experiments/flappy/a1
npm ci
npm run dev -- --host    # open on a phone on the same network
```

## Results

| Cell | Cold start | Interventions | Bugs | Kid rank | Notes |
| ---- | ---------- | ------------- | ---- | -------- | ----- |
| a1   |            |               |      |          |       |
| a2   |            |               |      |          |       |
| b1   |            |               |      |          |       |
| b2   |            |               |      |          |       |

_Round 1 not yet run._