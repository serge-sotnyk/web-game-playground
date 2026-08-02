# Round 1 — retrospective (headless orchestration)

*Language: **English** · [Українською](round-1-retrospective.uk.md)*

A post-round write-up of **how round 1 was actually run**: what each agent was,
what it cost, how long it took, what went wrong, and what to watch when you
orchestrate two *different* agent harnesses against the same task.

> **Scope note.** Round 1 is complete and consolidated. This document
> intentionally records the `A/B/1/2 ↔ agent` mapping — the in-repo
> anonymisation existed to keep the round honest *while it ran*, and that window
> is now closed. It stays out of any worker prompt regardless. The subjective
> evaluation (feel, the kid test) is deliberately **not** here; this is the
> orchestration/operations retrospective, not the game scoring.

## The mapping (round 1)

| | Planner | Implementer |
| --- | --- | --- |
| **A / 1** | Claude Code | Claude Code |
| **B / 2** | Codex CLI | Codex CLI |

So `a1` = Claude plan + Claude code, `a2` = Claude plan + Codex code,
`b1` = Codex plan + Claude code, `b2` = Codex plan + Codex code.

## How it was run

- **Track:** headless orchestration. One interactive Claude Code session (the
  orchestrator) dispatched each cell as a headless worker, one at a time, with a
  human gating every push. The orchestrator never planned or implemented; it did
  branch/clone/dispatch/verify/git only.
- **Isolation:** one `--single-branch` clone per cell under `C:\repos\wgp-*`,
  containing exactly one plan and no sibling variants. Every clone was checked
  before dispatch (correct plan present, siblings absent, no bookkeeping leak).
- **Worker prompt:** the fixed prompt from `docs/prompts/*`, with the
  "commit and push" line dropped — in headless the orchestrator owns git and the
  worker has no git tools.

### Harnesses, models, levels

| | Claude cells (plan-a, a1, b1) | Codex cells (plan-b, a2, b2) |
| --- | --- | --- |
| CLI | `claude -p` 2.1.220 | `codex exec` 0.146.0 |
| **Model (actual)** | **`claude-opus-5`** | `gpt-5.6-sol` |
| Reasoning effort | inherited session default (pin: xhigh) | **xhigh** (log-confirmed) |
| Sandbox | none (trust + disposable clone) | `workspace-write` + network, approval `never` |
| Permissions | `--permission-mode acceptEdits` + narrow `--allowedTools` (npm/npx/node, **no git**) | OS sandbox; **no git** |

> **Pin drift — worth flagging.** `ENVIRONMENT.local.md` pinned the Claude side as
> "opus (1m context)". The dispatched workers actually ran **`claude-opus-5`**
> (confirmed in every Claude transcript), because `claude -p` was launched
> *without* `--model` and inherited the user's live default, which had moved.
> The orchestrator session itself was Opus 4.8 — so three different "Claude"
> model identities were in play at once. **Lesson: pin the worker model
> explicitly (`--model …`) or the environment pin is fiction.**

## What each stage cost

Durations are wall-clock of the worker process (session-log birth → last write).
Gaps *between* cells were human review/gating time and are excluded.

| Cell | Agent | Stage | Duration | Tests written | Result |
| --- | --- | --- | ---: | ---: | --- |
| plan/a | Claude | plan | 13m 35s | — | 934-line plan (Neonfall) |
| plan/b | Codex | plan | 9m 32s | — | 207-line plan (Flux Flip) |
| a1 | Claude | implement | 42m 04s | 63 | clean; browser-verified |
| a2 | Codex | implement | 23m 14s | 12 | clean; browser check cancelled |
| b1 | Claude | implement | 54m 05s | 86 | clean; browser-verified |
| b2 | Codex | implement | 33m 31s | 24 | clean; browser check cancelled |

**≈ 2h 56m of active worker compute** across all six cells. Every cell completed
in **one headless shot: 0 interventions, 0 rollbacks, 0 re-dispatches**, and the
final 6-way merge into `main` was **conflict-free** — i.e. no variant wrote
outside its own directory.

Pattern: the Claude worker took ~1.6–1.8× longer than the Codex worker on the
same job — but spent that time on heavier testing and a self-driven browser
verification pass (below). Codex was faster and leaner; Claude was slower and
more thorough. Neither is "better" in the abstract; they bought different things
with the time.

## Tokens (read the caveat)

The two harnesses count tokens differently, so **do not compare a Codex number
to a Claude number directly.** Codex prints one "tokens used" figure; Claude's
usage is only recoverable from `~/.claude/projects/<slug>/*.jsonl` and is
dominated by prompt-cache reads.

| Cell | Agent | Codex "tokens used" | Claude output (gen) | Claude cache-read | Assistant turns |
| --- | --- | ---: | ---: | ---: | ---: |
| plan/a | Claude | — | 341,974 | 3,051,748 | 27 |
| plan/b | Codex | 84,336 | — | — | — |
| a1 | Claude | — | 650,396 | 76,029,866 | 237 |
| a2 | Codex | 206,168 | — | — | — |
| b1 | Claude | — | 1,136,454 | 115,874,916 | 275 |
| b2 | Codex | 283,930 | — | — | — |

What is comparable *within* a harness:

- **Claude:** work scaled hard with thoroughness. `b1` generated **1.14M output
  tokens over 275 turns** (86 tests + a DPR rework + a headless-Chrome
  verification pass + a 12-section NOTES). The cache-read column (up to **116M**)
  is the growing context re-fed each turn under prompt caching — cheap, but it
  shows how large an agentic session's effective context becomes.
- **Codex:** much smaller totals (84k–284k) reflecting fewer, larger reasoning
  passes and no browser pass. `b2` > `a2` because implementing plan-b (the DPR
  rework + heavier config scaffolding) was more work than plan-a.

**Observability asymmetry** (a real operational finding): `codex exec` streams
all reasoning and diffs to stdout — the logs ran **170 KB → 3.8 MB → 8.0 MB** and
contain a full audit trail *and* the token count. `claude -p` in text mode emits
**only the final message** (~3 KB logs, no usage, no turn data); everything is in
the JSONL transcript instead. **Lesson: for Claude headless, use
`--output-format json`/`stream-json` (or mine the transcript) to get usage; for
Codex, capture stdout but expect very large logs.**

## Cross-cell findings (interesting regardless of scoring)

- **When both implementers of a plan deviate identically, the plan is wrong.**
  Plan-b told implementers to get high-DPI via a Phaser `resolution` config key.
  That key **does not exist in Phaser 4** and `RESIZE` mode pins the backing
  store 1:1 to CSS size (blurry on a real phone). *Both* b1 (Claude) and b2
  (Codex) independently caught this against the live Phaser 4.2.1 source and
  reworked it — different mechanisms, same conclusion. Identical deviation across
  independent implementers is a strong signal to fix the **plan**, not the code.
- **Testing depth is a stable per-agent trait here.** Claude cells wrote far more
  tests (63, 86) than Codex cells (12, 24) on the same plans. Consistent across
  both plans.
- **Verification reach differed by harness.** Both Claude cells self-drove
  headless Chrome (via the Node DevTools protocol, no new deps) against the
  production build and found real defects reasoning alone missed (a favicon 404,
  an autoplay/user-activation bug) and **measured** DPR crispness. Both Codex
  cells *attempted* browser verification but reported the "browser-control
  session was cancelled by the environment" — so Codex could not do live browser
  checks in this setup and said so honestly. b2's DPR correctness was therefore
  unproven by the agent; a human phone-test later confirmed it renders crisp.
- **Engine reality vs training data held up.** Both harnesses, told to use
  Context7 for Phaser 4, correctly resolved `phaser@^4` → 4.2.1 and flagged that
  the plans' `Phaser.Scale.NONE`/`CENTER_BOTH` top-level aliases don't exist in
  4.2.1, using the namespaced forms. The "look it up, don't recall it" rule
  worked.

## What went wrong (operations)

None of these were variant defects; they were harness/host/orchestrator issues.

- **Stray processes locked the workspace.** Both Claude cells left `vite preview`
  servers running after finishing; on Windows those held the `@rolldown` native
  `.node` binary, so my first `npm ci` re-verify of a1 hit `EPERM unlink` and
  half-wiped `node_modules`. Fix: **sweep `wgp-*`-bound node processes before
  verifying** (done for every cell after a1).
- **Sandboxed agents leave in-workspace artifacts.** Codex, being confined to
  `workspace-write`, could not reach the global npm cache and redirected it into
  `experiments/flappy/<cell>/.npm-cache/` — thousands of files. Harmless (each
  Codex cell wrote its own `.gitignore` covering it) but it inflates the tree and
  must be excluded at commit.
- **Model-pin drift** (above) went unnoticed until this write-up mined the
  transcripts. The pin claimed a model the workers weren't running.
- **Self-inflicted scripting bugs:** a `grep -c` returning 0 exits non-zero and
  silently broke a `&&` chain mid-commit once; PowerShell was the primary shell
  while the Claude allow-list was Bash-first (it coped, but it's a trap).
- **Host/network friction unrelated to agents:** a Windows-Firewall `Public`
  profile blocked the phone from the dev server, and a `191` vs `192` IP typo
  produced a red-herring timeout. Worth noting only because they cost real time
  during testing.

## Lessons for orchestrating heterogeneous agents

1. **Pin the model per worker explicitly.** Inheriting the live default means the
   record lies and two "Claude" cells could silently run different models. Pass
   `--model` (Claude) / confirm `model:` in the Codex header, and record what the
   transcript/header *actually* shows, not what you intended.
2. **Normalise observability up front.** Decide before the round how you'll
   capture usage/turns for *each* harness. They disagree: Codex → stdout (big,
   complete); Claude `-p` → JSONL transcript (`--output-format json` to surface
   it). Don't discover this after the fact.
3. **Expect different messes and clean between cells.** No-sandbox agents leave
   stray processes and host-level file locks; sandboxed agents leave
   in-workspace cache/artifacts. A between-cell sweep (kill clone-bound
   processes; exclude cache dirs) makes verification deterministic.
4. **Keep git with the orchestrator.** Workers had no git tools; the orchestrator
   committed after a human gate. This kept push credentials out of every sandbox,
   made "did it stay in its lane?" a merge check (conflict = escape), and let a
   weak result be discarded by deleting a clone. It held for all six cells.
5. **A shared, disposable single-branch clone is enough isolation** for this —
   simpler and stronger than worktrees (which carry the full ref graph). Verify
   it per clone rather than trusting it.
6. **Token/cost is not comparable across harnesses.** Report each in its own
   units, and lean on *duration*, *turns*, and *artifacts produced* for
   cross-agent intuition instead.
7. **Harness capability is part of the agent.** "Codex couldn't drive a browser
   headless here" and "Claude self-drove Chrome" is a difference in the *harness*,
   not the model — but it changed what got verified. If a capability matters
   (browser, network, a specific tool), confirm each harness actually has it
   before the round, not during it.

## Part two — from a merged branch to an app on a phone

The round ended with four builds in `main`. Getting one onto a phone as an
installed app took no Android toolchain at all, and the chain is worth recording
because most of its friction was in places the documentation does not warn about.

**The chain.** Vite PWA build → Cloudflare Pages (`wrangler pages deploy dist`)
→ PWABuilder → signed APK → sideload. Four projects were deployed, one per cell,
under deliberately neutral names so the blind ranking could not be gamed:

| URL | Cell |
| --- | --- |
| `wgp-r1-rose.pages.dev` | a1 |
| `wgp-r1-indigo.pages.dev` | a2 |
| `wgp-r1-amber.pages.dev` | b1 |
| `wgp-r1-teal.pages.dev` | b2 |

Cloudflare Pages' free tier covers this outright: static asset requests are
unlimited on the free plan, and 500 deploys/month is far beyond what a round
needs. No card, no cost.

**Four traps, in the order they were hit:**

1. **PWABuilder's "Other Android" tab always emits an *unsigned* APK** (its own
   tooltip says so). Android refuses to install an unsigned APK — developer mode
   does not change that; the signature is a platform requirement, not a store
   policy. The signing key option lives on the **Google Play** tab
   (`None` / `New` / `Mine`), and `None` is the default. Use the Google Play tab
   with `Signing key: New` even when you never intend to touch the Play Store.
2. **The `.aab` is not installable.** It is a publishing format that only Google
   Play can expand into device-specific APKs. For sideloading, the `.apk` is the
   only usable artefact.
3. **A TWA is not a standalone app.** It is a thin shell that loads the live URL
   in a Chrome container. The site has to keep existing. Offline play works only
   because these are real PWAs with a full precache service worker — and only
   *after* one successful online launch.
4. **Digital Asset Links are verified at install time.** Deploying
   `/.well-known/assetlinks.json` after the app is already installed changes
   nothing until you uninstall and reinstall. Without it the app runs with a
   browser address bar visible.

**Operational lesson:** the isolation clones were deleted at "end of round", and
then one was needed again to redeploy. It cost only a rebuild here, because the
build is reproducible from a lockfile — but the general rule is to keep the
environment until the *downstream consumers* are done, not until the round is.

## Lessons that generalise beyond this experiment

- **Verify claims, do not relay them.** Every worker self-reported success; every
  reviewer stated findings with confidence. Spot-checking them cost minutes and
  changed the record twice: an `EPERM` failure during cold-start verification
  turned out to be a `vite preview` process the *previous* worker had left
  running, which would otherwise have been logged as "this variant fails to
  build"; and a reviewer's arithmetic claim about an ineffective test was
  confirmed only by re-deriving it by hand.
- **Blind your own evaluation deliberately.** Evaluation was delegated to
  subagents with an explicit rule forbidding them from reading the agent mapping,
  so they judged in `a1/a2/b1/b2` terms. That is what makes it meaningful that
  their ranking disagreed with the players'.
- **Park cleanly at human-gated boundaries.** Some steps are structurally the
  human's: creating accounts, entering credentials, generating a signing key,
  approving a push. An orchestrator should name the handoff and stop, rather than
  doing adjacent work to stay busy. That boundary is where the human's trust in
  everything else is set.
- **Pin what you claim to have pinned.** The environment record said one model;
  the workers ran another, because the launch command omitted `--model` and
  inherited a default that had moved. Two independent parts of this session were
  wrong about their own model. Record what the transcript says, not what you
  intended.
- **A contradiction left in a spec ships as an artefact.** Plan B specified a
  sprite that was both `34×26` and a circle of radius `15`. One implementer chose
  the ellipse, the other the circle; a player noticed the squashed one and marked
  it down. Plan A left the collision-vs-score tie unspecified and got two
  different games. Ambiguity is not deferred — it is delegated, and then it is
  scored as yours.

## If you reuse this repository as a template

What transfers: the role separation in `AGENTS.md`; single-branch clones as the
isolation mechanism (stronger and simpler than worktrees, which carry the whole
ref graph); the orchestrator owning git so that "did it stay in its lane?"
becomes a merge check; a rubric fixed *before* the round and visible to every
agent; and `NOTES.md` as a required deliverable — it is what turned "the sprite
looks squashed" into a traceable plan defect.

What was incidental: the game, the engine, `Phaser 4`, and the specific brief.
The 2×2 shape only needs two producers of a spec and two consumers of it.

One thing to fix before reusing: this round deliberately published its A/B/1/2 ↔
agent mapping once it was over. If you run another round in the same repository,
a worker's clone will contain that file and can read it. Move it out of tracked
files first, or accept the leak knowingly.

Deployment note for anyone redeploying `wgp-r1-indigo`: the
`/.well-known/assetlinks.json` served there was injected into `dist` at deploy
time and is **not** in the variant's sources — deliberately, so the recorded
experiment result stayed untouched. A rebuild-and-redeploy will drop it and the
installed app will show an address bar again. Its content is the `assetlinks.json`
that PWABuilder ships in the signed package.

## Reproducibility record (corrections to the pin)

- Claude worker model: **`claude-opus-5`** (transcript-confirmed), CLI 2.1.220,
  `acceptEdits` + narrow allow-list, no FS sandbox.
- Codex worker model: **`gpt-5.6-sol`**, CLI 0.146.0, reasoning **xhigh**,
  `workspace-write` + network, approval `never`.
- Orchestrator: Claude Code, Opus 4.8 (a *third*, distinct model from the two
  worker identities).
- Node 24.18.0, npm 11.6.0, git 2.50.1, Windows 11. Phaser resolved to 4.2.1 in
  all four variants.
