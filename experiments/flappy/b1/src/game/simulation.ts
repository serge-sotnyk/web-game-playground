import {
  DRIFT_AMP_MAX_U,
  DRIFT_AMP_PER_SCORE_U,
  DRIFT_FREE_SCORE,
  DRIFT_PERIOD,
  FIXED_STEP,
  FLIP_DEBOUNCE_MS,
  FLIP_IMPULSE_U,
  GATE_CENTER_JITTER_U,
  GATE_DESPAWN_MARGIN_U,
  GATE_GAP_BASE_U,
  GATE_GAP_MIN_U,
  GATE_GAP_PER_SCORE_U,
  GATE_MIN_CENTER_CHANGE_U,
  GATE_SPACING_U,
  GATE_SPAWN_MARGIN_U,
  GRAVITY_U,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
  MAX_VY_U,
  SPEED_BASE_U,
  SPEED_MAX_U,
  SPEED_PER_SCORE_U,
} from './constants'
import { gateHalfVisualWidth, hitsCorridor, hitsGate, playerHitRect } from './collision'
import { baseCenterBounds, corridorMid } from './layout'
import { clamp } from './math'
import { mulberry32, symmetric } from './rng'
import type { Direction, Gate, Layout, Run, SimEvent, Stepper } from './types'

// ── Difficulty curves ─────────────────────────────────────────────────────────

/** Gap shrinks 1.6U per point, bottoming out at 146U (score 24). */
export function gapHeightFor(score: number, u: number): number {
  return Math.max(GATE_GAP_MIN_U * u, (GATE_GAP_BASE_U - score * GATE_GAP_PER_SCORE_U) * u)
}

/** Scroll speeds up 1.6U/s per point, topping out at 170U/s. */
export function speedFor(score: number, u: number): number {
  return Math.min(SPEED_MAX_U * u, (SPEED_BASE_U + score * SPEED_PER_SCORE_U) * u)
}

/** Gaps hold still for the first six gates, then start to sway. */
export function driftAmplitudeFor(score: number, u: number): number {
  if (score <= DRIFT_FREE_SCORE) return 0
  return Math.min(DRIFT_AMP_MAX_U * u, (score - DRIFT_FREE_SCORE) * DRIFT_AMP_PER_SCORE_U * u)
}

/** Seconds between gates. Derived, not tuned: spacing is what stays constant. */
export function spawnIntervalFor(score: number, u: number): number {
  return (GATE_SPACING_U * u) / speedFor(score, u)
}

/** Where a gate's gap sits right now. Rendering and collision share this. */
export function gateCenter(gate: Gate): number {
  if (gate.amplitude === 0) return gate.baseCenter
  return (
    gate.baseCenter +
    gate.amplitude * Math.sin((2 * Math.PI * gate.age) / DRIFT_PERIOD + gate.phase)
  )
}

export function gateSpawnX(layout: Layout): number {
  return layout.width + GATE_SPAWN_MARGIN_U * layout.u
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────

export function createStepper(): Stepper {
  return { accumulator: 0 }
}

export function resetStepper(stepper: Stepper): void {
  stepper.accumulator = 0
}

export function createRun(layout: Layout, seed: number): Run {
  const mid = corridorMid(layout)
  const run: Run = {
    layout,
    player: { y: mid, prevY: mid, vy: 0, direction: 1 },
    gates: [],
    score: 0,
    distance: 0,
    elapsed: 0,
    alive: true,
    rng: mulberry32(seed),
    nextGateId: 0,
    lastBaseCenter: mid,
    flipQueued: false,
    // -Infinity, not 0: the very first tap of a run is never debounced.
    lastFlipAtMs: Number.NEGATIVE_INFINITY,
  }

  // The opening gate is fully determined — centred, no drift — so the player
  // has one unambiguous target while learning the control.
  spawnGate(run, gateSpawnX(layout), [])
  return run
}

/**
 * Accept a flip request, unless it lands inside the debounce window.
 * The flip itself is applied at the start of the next fixed step, never
 * part-way through one.
 */
export function requestFlip(run: Run, nowMs: number): boolean {
  if (nowMs - run.lastFlipAtMs < FLIP_DEBOUNCE_MS) return false
  run.lastFlipAtMs = nowMs
  run.flipQueued = true
  return true
}

// ── Gate spawning ─────────────────────────────────────────────────────────────

/**
 * Pick the next gate's base centre: a random hop from the previous one, pulled
 * back inside the legal band, then nudged out again if the hop was too small to
 * read as a change of direction.
 */
function chooseBaseCenter(run: Run, gapHeight: number, amplitude: number): number {
  const { lo, hi } = baseCenterBounds(run.layout, gapHeight, amplitude)
  if (lo >= hi) return (lo + hi) / 2

  const prev = run.lastBaseCenter
  const offset = symmetric(run.rng, GATE_CENTER_JITTER_U * run.layout.u)
  const minChange = GATE_MIN_CENTER_CHANGE_U * run.layout.u

  const candidate = clamp(prev + offset, lo, hi)
  if (Math.abs(candidate - prev) >= minChange) return candidate

  // Too flat. Push a full `minChange` the way the offset was already leaning
  // (coin-flip if it was leaning nowhere), and fall back to the other side.
  const sign: Direction = offset > 0 ? 1 : offset < 0 ? -1 : run.rng() < 0.5 ? -1 : 1

  const pushed = clamp(prev + sign * minChange, lo, hi)
  if (Math.abs(pushed - prev) >= minChange) return pushed

  const mirrored = clamp(prev - sign * minChange, lo, hi)
  if (Math.abs(mirrored - prev) >= minChange) return mirrored

  // Corridor too tight for a readable hop either way; take what we can get.
  return candidate
}

function spawnGate(run: Run, x: number, events: SimEvent[]): Gate {
  const u = run.layout.u
  const gapHeight = gapHeightFor(run.score, u)
  const amplitude = driftAmplitudeFor(run.score, u)
  const isFirst = run.nextGateId === 0

  const phase = isFirst ? 0 : run.rng() * Math.PI * 2
  const baseCenter = isFirst ? corridorMid(run.layout) : chooseBaseCenter(run, gapHeight, amplitude)

  const gate: Gate = {
    id: run.nextGateId++,
    x,
    prevX: x,
    age: 0,
    gapHeight,
    baseCenter,
    amplitude,
    phase,
    scored: false,
  }

  run.gates.push(gate)
  run.lastBaseCenter = baseCenter
  events.push({ type: 'GATE_SPAWNED', gateId: gate.id })
  return gate
}

/**
 * Top the field up so the rightmost gate is always within one spacing of the
 * spawn line. Spawning off the *previous gate's* x — not off the spawn line —
 * is what keeps spacing at exactly 205U as the scroll speed changes.
 */
function refillGates(run: Run, events: SimEvent[]): void {
  const spawnX = gateSpawnX(run.layout)
  const spacing = GATE_SPACING_U * run.layout.u

  if (run.gates.length === 0) {
    spawnGate(run, spawnX, events)
  }

  for (;;) {
    const rightmost = run.gates[run.gates.length - 1]
    if (rightmost === undefined) return
    const next = rightmost.x + spacing
    if (next > spawnX) return
    spawnGate(run, next, events)
  }
}

// ── The fixed step ────────────────────────────────────────────────────────────

/**
 * Advance the run by exactly one `FIXED_STEP`.
 *
 * The order below is part of the game's rules, not an implementation detail:
 * flip, integrate, scroll, collide, score, retire, spawn. A crash returns
 * immediately, which is what makes collision beat scoring on a tie.
 */
export function stepRun(run: Run, events: SimEvent[]): void {
  if (!run.alive) return

  const { layout, player } = run
  const u = layout.u
  const maxVy = MAX_VY_U * u

  // 1. Consume the queued flip.
  if (run.flipQueued) {
    run.flipQueued = false
    player.direction = -player.direction as Direction
    player.vy = clamp(player.vy + player.direction * FLIP_IMPULSE_U * u, -maxVy, maxVy)
    events.push({ type: 'FLIPPED', direction: player.direction, y: player.y })
  }

  // 2. Semi-implicit Euler.
  player.prevY = player.y
  player.vy = clamp(player.vy + player.direction * GRAVITY_U * u * FIXED_STEP, -maxVy, maxVy)
  player.y += player.vy * FIXED_STEP

  // 3. Scroll the world. Speed is read from the score as it stood *before* any
  //    point scored this step.
  const speed = speedFor(run.score, u)
  for (const gate of run.gates) {
    gate.prevX = gate.x
    gate.x -= speed * FIXED_STEP
    gate.age += FIXED_STEP
  }
  run.distance += speed * FIXED_STEP
  run.elapsed += FIXED_STEP

  // 4. Collisions.
  const hitbox = playerHitRect(layout.playerX, player.y, u)
  if (hitsCorridor(hitbox, layout.playTop, layout.playBottom)) {
    run.alive = false
    events.push({ type: 'CRASHED', y: player.y, cause: 'rail' })
    return
  }
  for (const gate of run.gates) {
    if (hitsGate(hitbox, gate, gateCenter(gate), layout)) {
      run.alive = false
      events.push({ type: 'CRASHED', y: player.y, cause: 'gate' })
      return
    }
  }

  // 5. Scoring — once per gate, when its trailing edge clears the spark.
  const halfVisual = gateHalfVisualWidth(u)
  for (const gate of run.gates) {
    if (!gate.scored && gate.x + halfVisual < layout.playerX) {
      gate.scored = true
      run.score += 1
      events.push({ type: 'SCORED', score: run.score, gateId: gate.id })
    }
  }

  // 6. Retire gates that have left the screen.
  const despawnX = -GATE_DESPAWN_MARGIN_U * u
  while (run.gates.length > 0) {
    const first = run.gates[0]
    if (first === undefined || first.x + halfVisual >= despawnX) break
    run.gates.shift()
  }

  // 7. Spawn using the score as it stands *now*, so a point just scored raises
  //    the difficulty of the gate it earned.
  refillGates(run, events)
}

/**
 * Drain a frame's worth of real time into fixed steps.
 *
 * A long frame (tab restored, GC pause) is clamped rather than replayed, and
 * the backlog is dropped once the step budget is spent — a slow device falls
 * behind in wall-clock terms but never enters a death spiral.
 */
export function advanceRun(
  run: Run,
  stepper: Stepper,
  frameDelta: number,
  events: SimEvent[],
): number {
  stepper.accumulator += Math.min(Math.max(frameDelta, 0), MAX_FRAME_DELTA)

  let steps = 0
  while (stepper.accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
    stepper.accumulator -= FIXED_STEP
    steps += 1
    stepRun(run, events)
    if (!run.alive) {
      stepper.accumulator = 0
      return steps
    }
  }

  if (stepper.accumulator >= FIXED_STEP) stepper.accumulator = 0
  return steps
}

/** 0..1 progress towards the next fixed step, for render interpolation. */
export function stepAlpha(stepper: Stepper): number {
  return clamp(stepper.accumulator / FIXED_STEP, 0, 1)
}

/**
 * Presentation-only scroll used during DYING: gates keep coasting to a stop
 * while nothing collides, scores or spawns.
 */
export function coastGates(run: Run, dt: number, factor: number): void {
  const speed = speedFor(run.score, run.layout.u) * clamp(factor, 0, 1)
  for (const gate of run.gates) {
    gate.x -= speed * dt
    gate.prevX = gate.x
    gate.age += dt
  }
  run.distance += speed * dt
}
