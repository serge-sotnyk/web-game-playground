import { describe, expect, it } from 'vitest'
import {
  DRIFT_PERIOD,
  GATE_EDGE_MARGIN_U,
  GATE_HIT_W_U,
  GATE_MIN_CENTER_CHANGE_U,
  GATE_SPACING_U,
  GATE_SPAWN_MARGIN_U,
  PLAYER_HIT_W_U,
} from './constants'
import { gateHalfVisualWidth } from './collision'
import { NO_INSETS, baseCenterBounds, computeLayout, corridorMid } from './layout'
import { createRun, gateCenter, gateSpawnX, stepRun } from './simulation'
import type { Run, SimEvent } from './types'

const LAYOUT = computeLayout(360, 800, NO_INSETS)

/**
 * Pin the spark to whichever gap it is threading, so the run survives long
 * enough to observe the gate stream at high scores. Physics is deliberately
 * bypassed here; motion has its own tests.
 *
 * The target is the first gate that could *still* collide — a gate scores when
 * its trailing edge passes the spark's centre, which is a few pixels before it
 * clears the spark's hitbox, so switching on `scored` would steer straight into
 * the gate just passed.
 */
function targetGate(run: Run): number {
  const reach = (GATE_HIT_W_U / 2) * run.layout.u
  const nose = run.layout.playerX - (PLAYER_HIT_W_U / 2) * run.layout.u
  const gate = run.gates.find((g) => g.x + reach >= nose)
  return gate ? gateCenter(gate) : corridorMid(run.layout)
}

function autopilot(run: Run, steps: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let i = 0; i < steps && run.alive; i += 1) {
    run.player.y = targetGate(run)
    run.player.vy = 0
    stepRun(run, events)
  }
  return events
}

describe('the opening gate', () => {
  it('spawns centred, undrifted, at the spawn line', () => {
    const run = createRun(LAYOUT, 1)
    expect(run.gates).toHaveLength(1)

    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')

    expect(gate.x).toBe(gateSpawnX(LAYOUT))
    expect(gate.x).toBeCloseTo(360 + GATE_SPAWN_MARGIN_U, 10)
    expect(gate.baseCenter).toBe(corridorMid(LAYOUT))
    expect(gate.amplitude).toBe(0)
    expect(gate.scored).toBe(false)
  })

  it('reaches the spark about 2.75 s into the run at 360x800', () => {
    const run = createRun(LAYOUT, 1)
    while (run.alive && run.score === 0 && run.elapsed < 5) autopilot(run, 1)

    expect(run.score).toBe(1)
    expect(run.elapsed).toBeGreaterThan(2.6)
    expect(run.elapsed).toBeLessThan(2.9)
  })
})

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const a = createRun(LAYOUT, 0xc0ffee)
    const b = createRun(LAYOUT, 0xc0ffee)
    autopilot(a, 3000)
    autopilot(b, 3000)

    expect(a.score).toBe(b.score)
    expect(a.gates.map((g) => [g.baseCenter, g.phase, g.amplitude, g.gapHeight])).toEqual(
      b.gates.map((g) => [g.baseCenter, g.phase, g.amplitude, g.gapHeight]),
    )
  })

  it('diverges from a different seed', () => {
    const a = createRun(LAYOUT, 1)
    const b = createRun(LAYOUT, 2)
    autopilot(a, 1500)
    autopilot(b, 1500)
    expect(a.gates.map((g) => g.baseCenter)).not.toEqual(b.gates.map((g) => g.baseCenter))
  })
})

describe('gate stream', () => {
  it('holds spacing at exactly 205U regardless of speed', () => {
    const run = createRun(LAYOUT, 77)
    autopilot(run, 4000)

    expect(run.score).toBeGreaterThan(10) // difficulty really did ramp
    expect(run.gates.length).toBeGreaterThan(1)

    for (let i = 1; i < run.gates.length; i += 1) {
      const left = run.gates[i - 1]
      const right = run.gates[i]
      if (!left || !right) throw new Error('unexpected sparse gate array')
      expect(right.x - left.x).toBeCloseTo(GATE_SPACING_U * LAYOUT.u, 6)
    }
  })

  it('moves the gap by at least 36U between consecutive gates', () => {
    const run = createRun(LAYOUT, 31337)
    const centers: number[] = []

    // Record every base centre as it is spawned, including retired gates.
    const seen = new Set<number>()
    for (let i = 0; i < 6000 && run.alive; i += 1) {
      autopilot(run, 1)
      for (const gate of run.gates) {
        if (seen.has(gate.id)) continue
        seen.add(gate.id)
        centers.push(gate.baseCenter)
      }
    }

    expect(centers.length).toBeGreaterThan(12)
    // The opening gate is fixed at the midpoint, so the rule starts at index 1.
    for (let i = 2; i < centers.length; i += 1) {
      const a = centers[i - 1]
      const b = centers[i]
      if (a === undefined || b === undefined) throw new Error('unexpected gap')
      expect(Math.abs(b - a)).toBeGreaterThanOrEqual(GATE_MIN_CENTER_CHANGE_U * LAYOUT.u - 1e-9)
    }
  })

  it('keeps every base centre inside its legal band', () => {
    const run = createRun(LAYOUT, 555)
    for (let i = 0; i < 6000 && run.alive; i += 1) {
      autopilot(run, 1)
      for (const gate of run.gates) {
        const { lo, hi } = baseCenterBounds(LAYOUT, gate.gapHeight, gate.amplitude)
        expect(gate.baseCenter).toBeGreaterThanOrEqual(lo - 1e-9)
        expect(gate.baseCenter).toBeLessThanOrEqual(hi + 1e-9)
      }
    }
  })

  it('never lets a drifting gap eat into the rail clearance', () => {
    const run = createRun(LAYOUT, 8080)
    autopilot(run, 5000)

    const drifting = run.gates.filter((g) => g.amplitude > 0)
    expect(drifting.length).toBeGreaterThan(0)

    const margin = GATE_EDGE_MARGIN_U * LAYOUT.u
    for (const gate of run.gates) {
      // Sweep a whole drift period rather than trusting the current phase.
      for (let t = 0; t <= DRIFT_PERIOD; t += DRIFT_PERIOD / 64) {
        const center = gateCenter({ ...gate, age: t })
        expect(center - gate.gapHeight / 2).toBeGreaterThanOrEqual(LAYOUT.playTop + margin - 1e-9)
        expect(center + gate.gapHeight / 2).toBeLessThanOrEqual(LAYOUT.playBottom - margin + 1e-9)
      }
    }
  })

  it('retires gates once they leave the screen', () => {
    const run = createRun(LAYOUT, 4)
    autopilot(run, 4000)
    for (const gate of run.gates) {
      expect(gate.x + gateHalfVisualWidth(LAYOUT.u)).toBeGreaterThan(-24 * LAYOUT.u - 1e-9)
    }
    // The field is topped up, not drained.
    expect(run.gates.length).toBeGreaterThan(1)
  })
})

describe('scoring', () => {
  it('scores a gate exactly once, when its trailing edge clears the spark', () => {
    const run = createRun(LAYOUT, 11)
    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')

    // Park the trailing edge just short of the spark.
    gate.x = LAYOUT.playerX - gateHalfVisualWidth(LAYOUT.u) + 0.5
    run.player.y = gate.baseCenter

    const first: SimEvent[] = []
    stepRun(run, first)
    expect(first.filter((e) => e.type === 'SCORED')).toHaveLength(1)
    expect(run.score).toBe(1)
    expect(gate.scored).toBe(true)

    const second: SimEvent[] = []
    run.player.y = gate.baseCenter
    stepRun(run, second)
    expect(second.filter((e) => e.type === 'SCORED')).toHaveLength(0)
    expect(run.score).toBe(1)
  })

  it('emits one SCORED per point over a long run', () => {
    const run = createRun(LAYOUT, 606)
    const events = autopilot(run, 4000)
    const scored = events.filter((e) => e.type === 'SCORED')

    expect(scored).toHaveLength(run.score)
    expect(new Set(scored.map((e) => (e.type === 'SCORED' ? e.gateId : -1))).size).toBe(run.score)
  })

  it('announces every spawn', () => {
    const run = createRun(LAYOUT, 12)
    const events = autopilot(run, 2000)
    const spawned = events.filter((e) => e.type === 'GATE_SPAWNED')
    // The opening gate is created before any listener exists, hence the -1.
    expect(spawned.length).toBe(run.nextGateId - 1)
  })
})
