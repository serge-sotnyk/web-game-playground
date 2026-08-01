# Protocol

Step-by-step procedure for running one round. Read this together with
`AGENTS.md`.

**Shell: PowerShell on Windows.** Every command below is PowerShell. Clones live
directly under `C:\repos\` (e.g. `C:\repos\wgp-plan-a`). The repository itself is
at `C:\repos\sotnyk\web-game-playground`.

**How this is actually run.** This document is the **interactive** run — the
clean measurement. The human runs each of the six worker sessions himself, one
at a time, in a terminal, and may stop between any two. Each cell is an
independent, resumable unit of work: you can do `plan/a` today, `flappy/b2` next
week, and nothing carries over except the pushed branches.

There is **no fire-and-forget batch, no `--dangerously-*` bypass, no timeout
workaround** in either run mode. A **headless-orchestration variant** — an
interactive Claude Code orchestrator that dispatches each cell to `codex exec` /
`claude -p`, still one cell at a time and still human-gated — is documented
separately in [`orchestration-headless.md`](orchestration-headless.md). Phases 0,
3, 4 and 5 below are shared by both run modes; only how a worker is launched in
phases 1–2 differs.

**The orchestrator's job is narrow:** create and manage branches, clone them,
merge the results, and verify the build. The orchestrator does **not** run the
agent sessions and does **not** edit variant code. (The orchestrator may be the
human, or a separate Claude Code session — but it is never one of the six worker
sessions.)

Set the repo URL once per shell:

```powershell
$repo = 'https://github.com/serge-sotnyk/web-game-playground.git'
```

---

## 0 — Before the round

### 0.1 Pin and record the environment

Freeze what each harness is, so the round is reproducible and the results are
interpretable. The *preparer* role produces `ENVIRONMENT.local.md` (untracked) —
the full audit of both agents: CLI versions, models, reasoning effort, MCP
servers, skills/plugins/hooks/rules, memory state, sandbox/approval defaults. If
either CLI was updated since it was written, re-pin it.

Quick version check:

```powershell
claude --version
codex --version
node --version
npm --version
git --version
```

### 0.2 Assign identities → `MAPPING.local`

Decide which agent is planner **A** vs **B**, and implementer **1** vs **2**.
Keep the mapping in `MAPPING.local` at the repository root. That exact filename
is gitignored; `MAPPING.local.md` would **not** be — do not add an extension.
Never paste this file into a worker session.

Record the pinned environment here too, so the numbers behind the round are next
to the mapping. Example (`<agent>` placeholders — fill with the real names in
your local copy only):

```
A = <agent>          B = <agent>
1 = <agent>          2 = <agent>
round 1 = flappy bird
started = 2026-08-01

# Pinned environment (full audit in ENVIRONMENT.local.md)
<agent> : <cli> <version>, model <model>, reasoning <effort>
<agent> : <cli> <version>, model <model>, reasoning <effort>
node <ver>, npm <ver>, git <ver>
```

### 0.3 Create the run-state file → `RUNLOG.local.md`

`RUNLOG.local.md` (untracked) holds the checklist of the six sessions — status,
date, and intervention count for each. Update it as you go. At the end, its
intervention column folds into the results table in `README.md`. A template is
already scaffolded; if it is missing, recreate it with two tables (the two
planner sessions, the four implementer sessions) plus a free-form log.

### 0.4 Cross-session memory — required for a clean round

A memory that survives from one session into another bypasses branch isolation
entirely: it does not go through the filesystem, so a single-branch clone does
not stop it. Handle it per agent **before** running any session:

- **Codex** keeps a **global, cross-project** memory (`generate_memories` +
  `use_memories`). Launch **every** Codex worker session with memory disabled:

  ```powershell
  codex --disable memories
  ```

  This turns off both writing and reading memory for that session only. It does
  not touch `~/.codex/config.toml` and reverts the moment you stop passing the
  flag. (Confirm it took: `codex features list --disable memories` should show
  `memories … false`.) Disabling it also prevents any pre-existing memory —
  including unrelated past experiments — from priming the session.

- **Claude Code** keeps memory **scoped to the working-directory path**
  (`~/.claude/projects/<slug-of-cwd>/memory/`). Each single-branch clone is a
  distinct path, hence a fresh, empty store — so Claude memory cannot leak
  between cells and needs no flag, provided each session runs in its own clone.

### 0.5 Confirm the Codex sandbox can build (both walls)

Codex runs commands in a restricted sandbox (writes confined to the workspace;
network blocked by default; approval **OnRequest**). An implementer that cannot
write files or reach npm fails in confusing ways, so confirm both walls once, in
a throwaway trusted directory, **before** the round. Because you run the session
interactively, you will see and answer any approval prompt yourself.

```powershell
# Throwaway project outside the experiment repo.
mkdir C:\repos\wgp-codex-check
cd C:\repos\wgp-codex-check
npm create vite@latest app -- --template vanilla-ts
cd app

# Launch Codex interactively (memory off, as in the real round):
codex --disable memories
```

Then, inside that Codex session, type a single request such as:

> Create a file `hello.txt` containing "ok", then run `npm install`, then
> `npm run build`. Report whether each step succeeded.

Watch both walls:

- **Filesystem write** — `hello.txt` and `node_modules/` should appear inside
  the workspace. (A write *outside* the workspace should be refused — that is
  the wall working, not a failure.)
- **Network** — `npm install` needs the network, which is blocked in the
  sandbox, so Codex will **ask for approval**. Approve it. If it installs and
  `npm run build` succeeds, the toolchain is good.

If the per-command network prompts get tedious across the four implementer
cells, the middle-ground alternative — **without** granting full disk/system
access — is to enable network only for the workspace-write sandbox. The exact
config key changes between Codex versions; check `codex --help` and your
`config.toml` for the current `sandbox` / `workspace-write` network setting
rather than trusting a remembered flag. Never use `danger-full-access` or
`--dangerously-bypass-approvals-and-sandbox`.

Clean up when done:

```powershell
cd C:\repos
Remove-Item -Recurse -Force C:\repos\wgp-codex-check
```

### 0.6 One single-branch clone per session

A worktree still carries the full ref graph, so a curious agent can read sibling
branches. A single-branch clone physically does not contain them. One clone per
session, deleted when the round is over:

```powershell
git clone --single-branch --branch <branch> $repo C:\repos\wgp-<name>
```

---

## 1 — Plans

Create both planning branches from `main` (orchestrator):

```powershell
cd C:\repos\sotnyk\web-game-playground
git switch main
git pull
git switch -c plan/a
git push -u origin plan/a
git switch main
git switch -c plan/b
git push -u origin plan/b
git switch main
```

Then, for each planner, in its own fresh clone:

```powershell
git clone --single-branch --branch plan/a $repo C:\repos\wgp-plan-a
cd C:\repos\wgp-plan-a
```

Launch the session interactively in that clone (`claude`, or
`codex --disable memories`). Paste the prompt from
[`prompts/planner.md`](prompts/planner.md) — everything below the divider, with
`{{LETTER}}` substituted (`a` or `b`). The prompt tells the planner to read
`AGENTS.md` and the brief in [`brief.md`](brief.md); the clone contains both.

Do not answer design questions. If the planner asks what to pick, tell it the
choice is its own — that is the thing being measured. Log every exchange beyond
the pasted prompt in the intervention count in `RUNLOG.local.md`.

Both plans must be pushed before phase 2 starts. (Running this phase headless
instead: [`orchestration-headless.md`](orchestration-headless.md) §"Phase 1".)

---

## 2 — Implementations

Four branches, each from its own plan (orchestrator):

```powershell
cd C:\repos\sotnyk\web-game-playground
git fetch origin
git switch -c flappy/a1 origin/plan/a
git push -u origin flappy/a1
git switch -c flappy/a2 origin/plan/a
git push -u origin flappy/a2
git switch -c flappy/b1 origin/plan/b
git push -u origin flappy/b1
git switch -c flappy/b2 origin/plan/b
git push -u origin flappy/b2
git switch main
```

Each branch now contains exactly one plan and no sibling variants. Clone one per
session:

```powershell
git clone --single-branch --branch flappy/a1 $repo C:\repos\wgp-a1
cd C:\repos\wgp-a1
```

Launch the session interactively in that clone (`claude`, or
`codex --disable memories`). Paste the prompt from
[`prompts/implementer.md`](prompts/implementer.md) — everything below the
divider, with `{{LETTER}}` and `{{CELL}}` substituted (e.g. cell `a1` →
`LETTER=a`, `CELL=a1`).

Run the four sessions independently. Do not carry anything you learned in one
into another — not a bug fix, not a hint, not a rephrasing of the task. (Memory
handled per §0.4 is part of this: Codex sessions run with `--disable memories`.)

**Count interventions as you go.** Anything you had to say beyond the pasted
prompt counts: an unblock, a correction, a nudge, a "try again". Decide up front
whether a Codex sandbox approval you had to grant counts as an intervention, and
apply that convention to both agents consistently — Claude runs in a permissive
mode and will rarely prompt, so counting every Codex approval would penalise it
for harness policy rather than capability. Record per cell in `RUNLOG.local.md`;
they go in the results table. (Running the four cells headless instead:
[`orchestration-headless.md`](orchestration-headless.md) §"Phase 2".)

---

## 3 — Consolidation

Paths are disjoint, so this should be conflict-free (orchestrator):

```powershell
cd C:\repos\sotnyk\web-game-playground
git switch main
git merge --no-ff origin/plan/a origin/plan/b
git merge --no-ff origin/flappy/a1
git merge --no-ff origin/flappy/a2
git merge --no-ff origin/flappy/b1
git merge --no-ff origin/flappy/b2
git push
```

If a conflict does appear, that is itself a finding — some variant wrote outside
its directory. Record it under scope discipline.

Verify all four still build from the merged tree:

```powershell
Get-ChildItem experiments\flappy -Directory | ForEach-Object {
  Write-Host "=== $($_.Name) ===" -ForegroundColor Cyan
  Push-Location $_.FullName
  npm ci && npm run build && npm test
  if ($LASTEXITCODE -ne 0) { Write-Warning "FAILED: $($_.Name)" }
  Pop-Location
}
```

---

## 4 — Evaluation

Fill the results table in `README.md` against the criteria listed there. Fold
the intervention counts from `RUNLOG.local.md` into it.

**Deploy all four.** Four Cloudflare Pages projects pointing at `main`, each with
its variant directory as the root, or four preview URLs. Install each to the home
screen on the target phone.

**Blind the kid test.** The human cannot be blinded — they launched the sessions
— but the nine-year-old can. Present the four builds under neutral labels in
randomised order, with no mention that different systems wrote them. Ask for a
ranking and, separately, for the reason behind first and last place. Record the
reason; it is often more informative than the ranking.

**Read the four `NOTES.md` files last**, after scoring everything else. This is
the part worth the whole exercise: where an implementer silently redesigned, and
whether one planner provoked that more than the other. Summarise the pattern in
the Notes column.

**Then, and only then, open `MAPPING.local`** and write up which system was
which.

---

## 5 — Closing out

- Delete the working clones under `C:\repos\wgp-*`.
- Keep the branches; they are the record of what each session actually did.
- Tag the merge commit, e.g. `round-1-flappy`.
- Add a short retrospective to `README.md` under Results: what the round
  actually showed, and what it could not show.

---

## Rules for the orchestrator

- Your job is branch management, merging, and verification — not running the
  worker sessions (the human does that, interactively, one at a time) and not
  writing or fixing variant code.
- Do not edit variant code. If something is broken, that is a result, not a
  task. Fix nothing after the session ends.
- Do not reuse a session across roles. A planning session that becomes an
  implementing session has seen too much.
- If you contaminate a cell, say so in the results table rather than quietly
  rerunning it. A documented failure is worth more than a clean-looking lie.
