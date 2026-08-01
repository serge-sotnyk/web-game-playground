# Headless orchestration track

An **optional** alternative to the interactive run in [`protocol.md`](protocol.md).
Same experiment, same isolation guarantees, same phases 0/3/4/5 — only the way a
worker session is *launched* changes.

Use this track when the goal includes practising agent orchestration —
specifically an interactive **Claude Code orchestrator that drives Codex (and
Claude) headless**. The interactive protocol stays the "clean measurement"; this
is the "orchestration exercise" variant. You can run both and compare.

Everything here was validated on this machine on 2026-08-01 (Codex 0.146.0,
`gpt-5.6-sol`, Node 24.18.0). The exact commands below are the ones that
actually ran.

---

## The shape

- **The orchestrator is one interactive Claude Code session that you talk to.**
  It is the *orchestrator role* (exempt from isolation): it may see every branch
  and plan. You drive it conversationally, one cell at a time — "run planner A
  now", review, "now implementer a1", review, roll back and retry if a cell went
  badly. You stay in the loop at the orchestration level; you gate every step.
- **Each worker cell runs headless**, spawned by the orchestrator via the shell:
  `codex exec …` for a Codex cell, `claude -p …` for a Claude cell, in that
  cell's single-branch clone.
- **The orchestrator never plans or implements itself.** It is a thin driver:
  create branch → clone → dispatch the headless worker with the fixed prompt →
  review output → commit/push. If the orchestrator wrote plan or game code
  itself, the Claude cells would inherit its full context — contamination, and
  an unfair advantage. Keep it to dispatch + git + verification.

This preserves the properties the interactive protocol cares about: one cell at
a time, resumable, stop between any two, single-branch isolation. It changes one
thing on purpose — see "What this changes about the measurement" at the bottom.

---

## Safety envelope (verified — no full rights)

Neither agent gets `danger-full-access`, and neither
`--dangerously-bypass-approvals-and-sandbox` nor Claude's
`--dangerously-skip-permissions` is used.

### Codex worker — sandboxed, confined, network-for-npm only

Validated recipe:

```powershell
codex exec `
  --disable memories `
  -s workspace-write `
  -c "sandbox_workspace_write.network_access=true" `
  -C C:\repos\wgp-a1 `
  "<the cell prompt, placeholders substituted>"
```

On launch Codex prints, confirming the envelope:

```
model: gpt-5.6-sol
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR] (network access enabled)
reasoning effort: xhigh
```

- Writes are confined to the clone (+ temp). It **cannot** write outside the
  workspace.
- Network is on, so `npm install` works (verified: `npm ping` → `PONG`).
- `--disable memories` keeps the global Codex memory out of the session (both
  read and write) — the isolation guarantee, since memory bypasses the
  filesystem. Verified off in the session header.
- No approval prompts (there is no TTY to answer them), but nothing can escape
  the sandbox, so that is safe here.

### Claude worker — trust-based, not filesystem-sandboxed

Claude Code does **not** put the filesystem behind a sandbox the way Codex does;
in headless mode it runs tools under a permission mode. To let it run
`npm`/`git`/`node` without an interactive prompt, allow those tools explicitly
and run inside the clone:

```powershell
cd C:\repos\wgp-a2
claude -p "<the cell prompt, placeholders substituted>" `
  --permission-mode acceptEdits `
  --allowedTools "Edit Write Read Glob Grep Bash(git:*) Bash(npm:*) Bash(node:*)"
```

- **Validated 2026-08-01:** `claude -p` with `--permission-mode acceptEdits`
  writes files and runs an allow-listed command headlessly (exit 0). The colon
  form `Bash(cmd:*)` is the one that matches.
- **Windows two-shell gotcha:** Claude Code on Windows exposes *both* a Bash tool
  and a PowerShell tool. An `--allowedTools "Bash(...)"` entry covers the Bash
  tool only; if the model reaches for the PowerShell tool it gets declined and
  has to route around it (observed in the test — it retried via Bash and
  succeeded, but that is a wasted step and could stall a stricter cell). For a
  real implementer cell either allow the shell(s) you expect it to use or widen
  the permission mode; test the exact allow-list before the round.
- **Caveat, state it plainly:** with `Bash(...)` allowed and no FS sandbox, a
  headless Claude worker runs with your privileges in that directory — it is
  confined by trust and by the disposable clone, not by a kernel sandbox. This
  is the one place where "don't break my machine" is weaker than the Codex side.
  Mitigations: keep the allow-list as narrow as the cell needs, run only inside
  the throwaway clone, and never point it outside with `--add-dir`. Confirm the
  exact flags that avoid prompts in your build against `claude --help`;
  `--permission-mode bypassPermissions` is the guaranteed-but-broadest fallback
  and is broader than the Codex envelope — prefer the narrow allow-list.
- Claude memory is scoped to the clone directory, so it is already isolated per
  cell; no extra flag needed.

---

## Git ownership — the orchestrator does git, but you gate it

**The headless worker never touches git** — it only writes files into the clone.
The orchestrator owns all git operations (branch, commit, push). And because the
orchestrator is interactive, it does **not** commit or push on its own:

- After a worker finishes, the orchestrator **reports what happened** — what the
  worker changed, whether `npm ci && npm run build && npm test` passed, anything
  that looks off — and **asks you** what to do.
- **You decide**: commit + push this cell, or roll back (discard the clone,
  adjust, re-dispatch). Nothing enters the record without your go.

This keeps push credentials in your normal shell (never inside a sandbox),
matches the orchestrator's defined job (branch management), and keeps you in
control of every commit. The commit/push commands below are what the orchestrator
runs **once you approve**, not automatically.

---

## Phase 1 — plans, headless

The orchestrator, per cell:

```powershell
# 1. branch + single-branch clone (orchestrator, normal shell)
cd C:\repos\sotnyk\web-game-playground
git switch main; git switch -c plan/a; git push -u origin plan/a; git switch main
$repo = 'https://github.com/serge-sotnyk/web-game-playground.git'
git clone --single-branch --branch plan/a $repo C:\repos\wgp-plan-a

# 2. dispatch the headless planner into that clone
#    (if planner A is Codex, use codex exec; if Claude, use claude -p)
#    Prompt = docs/prompts/planner.md below the divider, {{LETTER}} = a.
codex exec --disable memories -s workspace-write `
  -c "sandbox_workspace_write.network_access=true" `
  -C C:\repos\wgp-plan-a `
  "You are the planner for this round. Read AGENTS.md first, then the brief in docs/brief.md. Write your plan to docs/plans/plan-a.md. Create nothing else — no code, no scaffolding."

# 3. the orchestrator reports the written plan to you and asks; only on your
#    approval does it commit + push (otherwise: discard clone and re-dispatch)
cd C:\repos\wgp-plan-a
git add docs/plans/plan-a.md
git commit -m "plan/a: round-1 flappy plan"
git push
```

Step 3 is yours to gate. If the plan is weak, discard the clone, recreate, and
re-run — the "roll back and retry" you described.

---

## Phase 2 — implementations, headless

Same pattern into `flappy/*` branches, prompt from
[`prompts/implementer.md`](prompts/implementer.md) with `{{LETTER}}`/`{{CELL}}`
substituted. Implementers need the network (npm) — already enabled above for
Codex; for Claude the `Bash(npm ...)` allow covers it. After the worker finishes,
the orchestrator verifies the definition of done, reports to you, and — only on
your approval — commits and pushes:

```powershell
cd C:\repos\wgp-a1
npm ci && npm run build && npm test    # orchestrator's own verification, reported to you
git add -A; git commit -m "flappy/a1: implement plan-a"; git push   # only on your go
```

Run the four cells one at a time. The orchestrator must pass **only** the fixed
cell prompt to each worker — never a hint, a fix, or anything it saw in another
cell. That single rule is what keeps the cells independent under one orchestrator.

---

## Phases 0, 3, 4, 5

Unchanged — follow [`protocol.md`](protocol.md). Phase 0 (pin environment,
`MAPPING.local`, `RUNLOG.local.md`, memory handling) applies identically; note in
`MAPPING.local` that the round was run headless. Phases 3–5 (merge, verify,
blind kid test, read NOTES last, open MAPPING last) are the same.

---

## What this changes about the measurement

- **"Interventions" and "cold-start human-fixes" lose their usual meaning.** With
  no human answering the worker mid-run, a cell either completes headless or
  fails; there is no "the human unblocked it N times". Record instead, per cell:
  did it complete in one headless shot, how many times you had to roll back and
  re-dispatch, and any prompt you had to adjust. That is the honest headless
  analogue.
- **Headless ≠ how you use these agents day to day.** `codex exec` / `claude -p`
  are a different harness surface than the interactive TUIs (different system
  prompt, no interactive steering). Under the "harness counts as part of the
  agent" decision this is legitimate, but it means this round measures the agents
  *as headless workers under an orchestrator*, not *as you drive them by hand*.
  Name it as such in the write-up; it is a different question than the interactive
  round answers.
