# Protocol

Step-by-step procedure for running one round. Written for the orchestrator,
human or agent. Read this together with `AGENTS.md`.

`$REPO` below is `https://github.com/serge-sotnyk/web-game-playground.git`.

---

## 0 — Before the round

**Assign identities.** Decide which agent is planner **A** and which is **B**,
and which is implementer **1** and which is **2**. Keep the mapping in
`MAPPING.local` at the repository root. That filename is gitignored; a file
named `MAPPING.local.md` would not be. Example contents:

```
A = <agent>          B = <agent>
1 = <agent>          2 = <agent>
round 1 = flappy bird
started = YYYY-MM-DD
```

Never paste this file into an agent session.

**Run each session in its own single-branch clone.** A worktree still carries
the full ref graph, so a curious agent can read sibling branches. A
single-branch clone physically does not contain them.

```bash
git clone --single-branch --branch <branch> $REPO ../wgp-<name>
```

One clone per session, deleted when the round is over.

---

## 1 — Plans

Create both planning branches from `main`:

```bash
git switch main && git pull
git switch -c plan/a && git push -u origin plan/a
git switch main
git switch -c plan/b && git push -u origin plan/b
git switch main
```

Then, for each planner, in a fresh clone:

```bash
git clone --single-branch --branch plan/a $REPO ../wgp-plan-a
cd ../wgp-plan-a
```

Session prompt — substitute the letter:

> You are the **planner** for this round. Read `AGENTS.md` first.
>
> Brief:
>
> > A Flappy Bird-style game for mobile browsers, playable in portrait on a
> > phone. All game design decisions are yours.
>
> Write your plan to `docs/plans/plan-a.md`. Create nothing else. Commit and
> push when you are done.

Do not answer design questions. If the planner asks what to pick, tell it the
choice is its own — that is the thing being measured. Log every exchange in the
intervention count.

Both plans must be pushed before phase 2 starts.

---

## 2 — Implementations

Four branches, each from its own plan:

```bash
git fetch origin
git switch -c flappy/a1 origin/plan/a && git push -u origin flappy/a1
git switch -c flappy/a2 origin/plan/a && git push -u origin flappy/a2
git switch -c flappy/b1 origin/plan/b && git push -u origin flappy/b1
git switch -c flappy/b2 origin/plan/b && git push -u origin flappy/b2
git switch main
```

Each branch now contains exactly one plan and no sibling variants. Clone one
per session:

```bash
git clone --single-branch --branch flappy/a1 $REPO ../wgp-a1
cd ../wgp-a1
```

Session prompt — substitute cell and plan:

> You are the **implementer** for this round. Read `AGENTS.md` first.
>
> Your plan is `docs/plans/plan-a.md`. Build it into
> `experiments/flappy/a1/`, and touch nothing outside that directory.
>
> Record every deviation from the plan in
> `experiments/flappy/a1/NOTES.md`. Commit and push when the definition of
> done is met.

Run the four sessions independently. Do not carry anything you learned in one
into another — not a bug fix, not a hint, not a rephrasing of the task.

**Count interventions as you go.** Anything the human had to say beyond the
prompt above counts: an unblock, a correction, a nudge, a "try again". Note
them per cell; they go in the results table.

---

## 3 — Consolidation

Paths are disjoint, so this should be conflict-free:

```bash
git switch main
git merge --no-ff origin/plan/a origin/plan/b
git merge --no-ff origin/flappy/a1
git merge --no-ff origin/flappy/a2
git merge --no-ff origin/flappy/b1
git merge --no-ff origin/flappy/b2
git push
```

If a conflict does appear, that is itself a finding — some variant wrote
outside its directory. Record it under scope discipline.

Verify all four still build from the merged tree:

```bash
for d in experiments/flappy/*/; do
  (cd "$d" && npm ci && npm run build && npm test) || echo "FAILED: $d"
done
```

---

## 4 — Evaluation

Fill the results table in `README.md` against the criteria listed there.

**Deploy all four.** Four Cloudflare Pages projects pointing at `main`, each
with its variant directory as the root, or four preview URLs. Install each to
the home screen on the target phone.

**Blind the kid test.** The human cannot be blinded — they launched the
sessions — but the nine-year-old can. Present the four builds under neutral
labels in randomised order, with no mention that different systems wrote them.
Ask for a ranking and, separately, for the reason behind first and last place.
Record the reason; it is often more informative than the ranking.

**Read the four `NOTES.md` files last**, after scoring everything else. This
is the part worth the whole exercise: where an implementer silently redesigned,
and whether one planner provoked that more than the other. Summarise the
pattern in the Notes column.

**Then, and only then, open `MAPPING.local`** and write up which system was
which.

---

## 5 — Closing out

- Delete the working clones.
- Keep the branches; they are the record of what each session actually did.
- Tag the merge commit, e.g. `round-1-flappy`.
- Add a short retrospective to `README.md` under Results: what the round
  actually showed, and what it could not show.

---

## Rules for the orchestrator

- Do not edit variant code. If something is broken, that is a result, not a
  task. Fix nothing after the session ends.
- Do not reuse a session across roles. A planning session that becomes an
  implementing session has seen too much.
- If you contaminate a cell, say so in the results table rather than quietly
  rerunning it. A documented failure is worth more than a clean-looking lie.