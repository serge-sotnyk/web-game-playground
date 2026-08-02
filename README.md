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

## Round 1 — a Flappy-class casual game (codename `flappy`)

The brief handed to both planners, verbatim:

> A simple, casual mobile-browser game in the *spirit* of Flappy Bird — the same
> pick-up-and-play, "just one more try" tier of difficulty, playable one-handed
> in portrait on a phone. The specific mechanic, theme and controls are yours to
> invent: it need not be a bird, and need not be flap-up-and-fall. Keep it 2D
> (no heavy 3D) and learnable in seconds. All game design decisions are yours.

Deliberately open — the *mechanic itself* is the planner's to invent, so the two
planners may land on genuinely different games. How an agent fills that space is
part of what is being measured. (`flappy` stays as the round codename for
branches and directories; the brief is the source of truth for scope.)

## Evaluation criteria

Fixed before any variant was run, to keep the scoring honest.

The rubric below is visible to every agent that works here. That is deliberate:
a shared, stated target measures execution against a known spec, rather than
measuring who best guessed the human's taste. It is identical across all four
cells, so it cannot bias the comparison between them.

- **Cold start.** Does `npm ci && npm run build && npm run dev` work first try,
  with zero human fixes?
- **Interventions.** How many times did the human have to unblock the agent?
- **Runs on the target devices.** Portrait, touch, real Android Chrome, and
  responsive: crisp and playable from a small budget phone (~360 CSS px wide,
  lower DPR) up to a high-DPR flagship (e.g. Galaxy S-Ultra), correct
  `devicePixelRatio`. Any layout or input breakage across that range?
- **Feel.** Hitbox fairness, difficulty curve, responsiveness, juice. Does it
  actually play like Flappy Bird?
- **Bugs.** Found in ten minutes of unstructured play.
- **Structure.** Is game logic separated from rendering? Whether to write tests
  was left to each agent, so their presence, shape and quality is itself a
  signal — not a checkbox. Is the code something a human could pick up?
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

Vite + TypeScript. Phaser 4, fixed for round 1 so the engine is held constant
across variants. PWA via `vite-plugin-pwa`. Deployed to Cloudflare Pages,
installed to the home screen on Android. No native toolchain in the agents'
build loop; the installable PWA can later be wrapped to an Android APK via
TWA / Bubblewrap as a downstream step (outside the agents' scope).

## Running a variant

```bash
cd experiments/flappy/a1
npm ci
npm run dev -- --host    # open on a phone on the same network
```

## Results

Round 1 ran headless. How it was orchestrated, what each stage cost, and what
went wrong operationally is in
[`docs/round-1-retrospective.md`](docs/round-1-retrospective.md)
([українською](docs/round-1-retrospective.uk.md)).

| Cell | Plan | Game | Cold start | Interventions | Tests | Defects found by review | Bugs in play | Kid rank |
| ---- | ---- | --------- | ---------- | ------------- | ------------ | ----------------------- | ------------ | -------- |
| a1   | A    | Neonfall  | clean      | 0             | 63 / 7 files | none                    | **1** (death on empty space, one device) | **2** |
| a2   | A    | Neonfall  | clean      | 0             | 12 / 1 file  | 4 (incl. a plan-stated requirement missed) | none observed | **1** |
| b1   | B    | Flux Flip | clean      | 0             | 86 / 7 files | none (build emits a chunk-size advisory)   | none observed | **3** |
| b2   | B    | Flux Flip | clean      | 0             | 24 / 5 files | 4 (two would show on a real phone)         | squashed sprite on one device | **4** |

**Cold start** — `npm ci && npm run build && npm test` from a fresh checkout with
zero human fixes: all four clean.

**Interventions** — in a headless run this reads as "did the cell complete in one
dispatch?". All six cells (both plans included) did: **0 interventions, 0
rollbacks, 0 re-dispatches**.

**Scope discipline** — merging all six branches into `main` was conflict-free, so
no variant wrote outside its own directory. Clean across all four.

**Structure** — verified rather than taken on trust: in every variant the pure
logic modules import no Phaser and touch no browser globals. No `console.*`,
`TODO`, `@ts-ignore`, `any` or disabled lint in any `src/`. `strict: true`
everywhere. On this criterion all four pass; the separation is real.

Defects below were found by **blind review of the merged tree** (reviewers were
given only `a1/a2/b1/b2`, not which system wrote which) and spot-verified by
hand.

- **a2** — the only variant without `banner: false` / `audio: { noAudio: true }`,
  so Phaser prints its boot banner: plan A §10.4 requires a silent console and
  `NOTES.md` does not mention the gap. Dead code (`platform/viewport.ts`'s
  `onChange` is exported and never called, leaving its listener set permanently
  empty). Star field spread is computed once against a fixed range, so it falls
  short of the letterbox on viewports wider than 0.6 aspect. Background is drawn
  at exactly the view size with no overscan while `shake()` runs on death.
- **b2** — `RENDER_DPR` is a module-scope constant evaluated once at import and
  never re-read, so a DPR change (display switch, browser zoom) leaves the
  backing store wrong. Safe-area insets are read via
  `getComputedStyle().getPropertyValue('--safe-*')` rather than resolved probe
  padding as the other three do, silently degrading to zero insets if the token
  comes back unresolved. `remapRun` does not re-clamp gap centres, so an extreme
  resize can place a gap outside its legal band. No `webkitAudioContext`
  fallback.

### The human verdict

Four builds were served from neutral `*.pages.dev` URLs in shuffled order, with
no labels, no mention that different systems wrote them, and no hint that the
four were two games in two versions each. Two people played them independently.

_Protocol note, recorded rather than tidied away: the criterion above anticipated
a nine-year-old. In the event the blind ranking was done by the adult who asked
for the experiment, with the repository owner playing separately. The criteria
were fixed before the round and are left as written._

**Ranking, best to worst: `a2` › `a1` › `b1` › `b2`.**

- **The mechanic decided it.** Both plan-A cells beat both plan-B cells, and both
  players gave the same unprompted reason: in portrait, a horizontally scrolling
  game does not leave enough screen to see what is coming. That is a *planner*
  decision — the brief left the mechanic open — and it outweighed everything the
  implementers did.
- **The blind ranker reconstructed the pair structure without being told it
  existed**, noting that two of the builds differed only in "minor" ways and that
  a third did not share their traits. The differences a plan makes are visible to
  a player; the differences an implementer makes, within a plan, largely are not.
- **Plan B earned one point back:** its gates start drifting early enough to add
  variety, which plan A's course has no equivalent of. Its constant gravity
  acceleration, however, made it harder from the first seconds.
- **Within plan B, `b1` was preferred** for clearer gate-pass feedback — the
  same direction the code review pointed.
- **`b2`'s sprite read as "squashed" on one player's screen, and `b1`'s did
  not.** This maps exactly onto a deviation `b2` recorded in its own `NOTES.md`:
  the plan gave the spark both a `34U × 26U` footprint and a radius-`15U`
  circular halo, which cannot both be true. `b2` resolved the contradiction by
  drawing an ellipse, `b1` by keeping the circles. A contradiction left in a plan
  became an artefact a player noticed and marked down.
- **`a1` lost first place to a bug** — dying against empty space. Diagnosed
  afterwards, and the cause is instructive: plan A §6.3 prescribes redrawing a
  barrier's pooled `Graphics` "only when its barrier index changes". Barrier
  indices are unique *within* a run but restart at zero on `reset()`, so the plan
  specified a cache key that is not unique across runs. `a1` invalidates its
  slots on viewport change and nowhere else, so after an **early** death the
  cached indices (0…7) match the new run's (0…7), no redraw happens, and every
  visible band is drawn with the *previous* run's gap while collision uses the
  real one. It self-heals once fresh indices rotate in — hence intermittent, and
  hence invisible to the player who was scoring 21 and never died early enough to
  trigger it. `a2` inherits the identical flaw from the identical plan sentence,
  but filters barriers by visibility before assigning slots, so at most the first
  band is affected. A plan defect, surfacing as an implementation bug in one cell
  and staying latent in the other — in exactly the area the plan excused from
  testing ("rendering does not need tests"), which is why 63 tests and a
  playability bot did not catch it.
- **Neither player found the mechanics inventive.** "Everything feels somewhat
  primitive — I expected the planners to invent something more interesting,"
  against a top score of 21. The brief explicitly handed the mechanic to the
  planner, and both planners chose a conservative one-button variation.

### What the 2×2 actually showed

**The plan sets the floor and the coverage map; the implementer sets the ceiling
and the rigour.** Both effects are real and they act on different axes.

*Plan effect.* Plan B mandated tests and embedded literal expected values;
`storage` and layout/DPR maths are consequently tested in **both** B cells and in
**neither** A cell, and the strongest single test in the weaker B cell is one the
plan wrote for it. Plan B's demand for a 30/60/120 Hz equivalence test pushed b1
to move the fixed-step accumulator out of the Phaser scene so it could be tested
at all — a1 and a2 both left theirs inside `GameScene`, where no test reaches it.
Conversely, plan A never fixed whether a collision or the score wins when both
land in the same simulation step: a1 and a2 resolved it **differently**, and
neither suite would notice. Ambiguity left in a plan does not stay ambiguous — it
becomes two different games.

*Implementer effect.* Plan A only *recommended* testing; one implementer wrote 63
tests plus a playing bot that asserts the game is winnable, the other wrote 12
covering the same bullet list. Nothing in the plan explains that spread. Plan B's
mandate lifted the weaker cell's floor (24 tests across all seven required
buckets) without making them rigorous — three of its tests pass unchanged when
the rule they name is removed.

*Cross-pair pattern.* Reading down both columns, the same implementer produced
the more disciplined variant on both plans — more tests, deeper NOTES, named
constants over inline literals, extra tsconfig strictness — consistently enough
to call a tendency, though not a clean sweep (each of the other two cells has at
least one axis where it leads).

*Engineering quality did not predict enjoyment.* This is the sharpest result of
the round. Two blind code reviewers ranked the variants `b1` › `a1` › `a2` ≈
`b2`. Two blind players ranked them `a2` › `a1` › `b1` › `b2`. The variant with
the best-enforced module boundaries, 86 boundary-tested cases and the most
careful Phaser-4-on-Android work came **third** with players; the variant with
the thinnest suite, a missed plan requirement and dead code came **first**. The
two verdicts are measuring different things and neither is wrong — but if the
only question is "which of these is the better game", the code review answered a
different one. What the players responded to was the *mechanic*, decided in the
plan, plus one visible bug and one visible art artefact.

*So: which matters more, the plan or the implementer?* On this evidence, for the
thing a player perceives, **the plan** — it chose the mechanic, and the mechanic
decided the ranking. For everything a maintainer perceives — test rigour,
boundary discipline, whether the fixed-step loop is testable at all — the
**implementer** dominated, with the plan able to raise the floor by mandating
specifics but not the ceiling. The two effects barely overlap.

Caveat, restated: n=1 per cell, two evaluators, one round, one brief. Run-to-run
variance within a single agent may well exceed everything described above. This
is anecdote, recorded carefully — not measurement.