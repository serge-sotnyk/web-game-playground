import { describe, expect, it } from 'vitest'
import {
  FIXED_STEP,
  FLIP_DEBOUNCE_MS,
  FLIP_IMPULSE_U,
  GRAVITY_U,
  MAX_STEPS_PER_FRAME,
  MAX_VY_U,
} from './constants'
import { NO_INSETS, computeLayout } from './layout'
import { advanceRun, createRun, createStepper, requestFlip, stepAlpha, stepRun } from './simulation'
import type { Run, SimEvent } from './types'

const LAYOUT = computeLayout(360, 800, NO_INSETS)
const GRAVITY_PER_STEP = GRAVITY_U * FIXED_STEP // 7.5 at U = 1

function freshRun(seed = 1): Run {
  return createRun(LAYOUT, seed)
}

describe('flip impulse', () => {
  it('turns the first tap into an upward flip of -330U', () => {
    const run = freshRun()
    expect(run.player.direction).toBe(1)
    expect(run.player.vy).toBe(0)

    expect(requestFlip(run, 0)).toBe(true)
    stepRun(run, [])

    expect(run.player.direction).toBe(-1)
    // The step applies the impulse first, then one step of gravity in the new
    // direction: -330 - 7.5.
    expect(run.player.vy).toBeCloseTo(-(FLIP_IMPULSE_U + GRAVITY_PER_STEP), 10)
  })

  it('reverses again on the next accepted tap', () => {
    const run = freshRun()
    requestFlip(run, 0)
    stepRun(run, [])

    const before = run.player.vy
    requestFlip(run, FLIP_DEBOUNCE_MS)
    stepRun(run, [])

    expect(run.player.direction).toBe(1)
    expect(run.player.vy).toBeCloseTo(before + FLIP_IMPULSE_U + GRAVITY_PER_STEP, 10)
  })

  it('emits FLIPPED exactly once per accepted tap', () => {
    const run = freshRun()
    requestFlip(run, 0)
    requestFlip(run, 10) // debounced away
    const events: SimEvent[] = []
    stepRun(run, events)

    expect(events.filter((e) => e.type === 'FLIPPED')).toHaveLength(1)
  })
})

describe('flip debounce', () => {
  it('ignores taps inside the 70 ms window and accepts the one on the boundary', () => {
    const run = freshRun()
    expect(requestFlip(run, 1000)).toBe(true)
    expect(requestFlip(run, 1000 + FLIP_DEBOUNCE_MS - 1)).toBe(false)
    expect(requestFlip(run, 1000 + FLIP_DEBOUNCE_MS)).toBe(true)
  })

  it('measures the window from the last accepted tap, not the last attempt', () => {
    const run = freshRun()
    requestFlip(run, 0)
    requestFlip(run, 40) // rejected, must not restart the window
    expect(requestFlip(run, FLIP_DEBOUNCE_MS)).toBe(true)
  })
})

describe('velocity clamp', () => {
  it('never exceeds 420U in free fall', () => {
    const run = freshRun()
    for (let i = 0; i < 400 && run.alive; i += 1) {
      stepRun(run, [])
      expect(Math.abs(run.player.vy)).toBeLessThanOrEqual(MAX_VY_U * LAYOUT.u + 1e-9)
    }
  })

  it('never exceeds 420U when flips stack in one direction', () => {
    const run = freshRun()
    for (let i = 0; i < 200 && run.alive; i += 1) {
      // Force same-direction impulses by flipping the sign back each time.
      run.player.direction = 1
      run.flipQueued = true
      stepRun(run, [])
      expect(Math.abs(run.player.vy)).toBeLessThanOrEqual(MAX_VY_U * LAYOUT.u + 1e-9)
    }
  })
})

describe('fixed stepping', () => {
  /** Drive a fresh run for `seconds` of wall clock at a given frame rate. */
  function driveAt(hz: number, seconds: number): { run: Run; steps: number } {
    const run = freshRun(2024)
    const stepper = createStepper()
    const frames = Math.round(seconds * hz)
    let steps = 0
    for (let i = 0; i < frames; i += 1) {
      steps += advanceRun(run, stepper, 1 / hz, [])
    }
    return { run, steps }
  }

  it('produces the same state at 30, 60 and 120 Hz', () => {
    const seconds = 0.5
    const a = driveAt(30, seconds)
    const b = driveAt(60, seconds)
    const c = driveAt(120, seconds)

    const expectedSteps = Math.round(seconds / FIXED_STEP)
    expect(a.steps).toBe(expectedSteps)
    expect(b.steps).toBe(expectedSteps)
    expect(c.steps).toBe(expectedSteps)

    for (const other of [b, c]) {
      expect(other.run.player.y).toBeCloseTo(a.run.player.y, 9)
      expect(other.run.player.vy).toBeCloseTo(a.run.player.vy, 9)
      expect(other.run.distance).toBeCloseTo(a.run.distance, 9)
      expect(other.run.gates.length).toBe(a.run.gates.length)
      expect(other.run.score).toBe(a.run.score)
    }
  })

  it('clamps a long frame instead of replaying it', () => {
    const run = freshRun()
    const stepper = createStepper()
    // Two seconds of stalled tab: capped at MAX_FRAME_DELTA, so at most six steps.
    const steps = advanceRun(run, stepper, 2, [])
    expect(steps).toBeLessThanOrEqual(MAX_STEPS_PER_FRAME)
  })

  it('drops the backlog rather than accumulating one', () => {
    const run = freshRun()
    const stepper = createStepper()
    for (let i = 0; i < 20; i += 1) advanceRun(run, stepper, 2, [])
    expect(stepper.accumulator).toBeLessThan(FIXED_STEP)
  })

  it('reports interpolation alpha inside [0, 1)', () => {
    const run = freshRun()
    const stepper = createStepper()
    advanceRun(run, stepper, 1 / 90, [])
    const alpha = stepAlpha(stepper)
    expect(alpha).toBeGreaterThanOrEqual(0)
    expect(alpha).toBeLessThan(1)
  })

  it('stops stepping the moment the run dies', () => {
    const run = freshRun()
    const stepper = createStepper()
    // Park the spark on the lower rail: the next step must be the last.
    run.player.y = LAYOUT.playBottom
    const events: SimEvent[] = []
    advanceRun(run, stepper, 1 / 30, events)

    expect(run.alive).toBe(false)
    expect(events.filter((e) => e.type === 'CRASHED')).toHaveLength(1)
    expect(stepper.accumulator).toBe(0)
  })
})

describe('render interpolation history', () => {
  it('records the pre-step position every step', () => {
    const run = freshRun()
    const before = run.player.y
    stepRun(run, [])
    expect(run.player.prevY).toBe(before)
    expect(run.player.y).not.toBe(before)

    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')
    expect(gate.prevX).toBeGreaterThan(gate.x)
  })
})
