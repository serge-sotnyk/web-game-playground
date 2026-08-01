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

## Round 1 — Flappy Bird

The brief handed to both planners, verbatim:

> A Flappy Bird-style game for mobile browsers, playable in portrait on a phone.
> All game design decisions are yours.

Deliberately underspecified. How an agent fills the gaps is part of what is
being measured.

## Evaluation criteria

Fixed before any variant was run, to keep the scoring honest:

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
