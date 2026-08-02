import { describe, expect, it } from 'vitest'
import { NO_INSETS, baseCenterBounds, computeLayout, corridorMid, isLandscape, remapRun } from './layout'
import { createRun, gapHeightFor } from './simulation'
import { U_MAX, U_MIN } from './constants'

const REFERENCE = computeLayout(360, 800, NO_INSETS)
const FLAGSHIP = computeLayout(412, 915, { top: 24, right: 0, bottom: 16, left: 0 })

describe('computeLayout', () => {
  it('resolves the 360x800 reference viewport to U = 1', () => {
    expect(REFERENCE.u).toBe(1)
    expect(REFERENCE.playTop).toBe(56)
    expect(REFERENCE.playBottom).toBe(752)
    expect(REFERENCE.playerX).toBeCloseTo(97.2, 10)
  })

  it('resolves a 412x915 device with safe insets', () => {
    expect(FLAGSHIP.u).toBeCloseTo(1.14375, 10)
    expect(FLAGSHIP.playTop).toBeCloseTo(78.9, 10)
    expect(FLAGSHIP.playBottom).toBeCloseTo(860.1, 10)
    expect(FLAGSHIP.playerX).toBeCloseTo(111.24, 10)
  })

  it('lets the safe inset win only when it is larger than the minimum', () => {
    // 24 + 48 = 72 beats the 56 floor; with no inset the floor applies.
    expect(computeLayout(360, 800, { ...NO_INSETS, top: 24 }).playTop).toBe(72)
    expect(computeLayout(360, 800, { ...NO_INSETS, top: 4 }).playTop).toBe(56)
  })

  it('clamps U for very small and very large viewports', () => {
    expect(computeLayout(240, 400, NO_INSETS).u).toBe(U_MIN)
    expect(computeLayout(1200, 2400, NO_INSETS).u).toBe(U_MAX)
  })

  it('treats a viewport at least as wide as it is tall as landscape', () => {
    expect(isLandscape(REFERENCE)).toBe(false)
    expect(isLandscape(computeLayout(800, 360, NO_INSETS))).toBe(true)
    expect(isLandscape(computeLayout(500, 500, NO_INSETS))).toBe(true)
  })
})

describe('remapRun', () => {
  it('keeps positions and velocity proportional across a resize', () => {
    const run = createRun(REFERENCE, 12345)
    const gate = run.gates[0]
    expect(gate).toBeDefined()
    if (!gate) return

    const oldSpan = REFERENCE.playBottom - REFERENCE.playTop
    run.player.y = REFERENCE.playTop + oldSpan * 0.25
    run.player.vy = 100

    const normalizedX = gate.x / REFERENCE.width
    const normalizedCenter = (gate.baseCenter - REFERENCE.playTop) / oldSpan

    remapRun(run, FLAGSHIP)

    const newSpan = FLAGSHIP.playBottom - FLAGSHIP.playTop
    expect(run.player.y).toBeCloseTo(FLAGSHIP.playTop + newSpan * 0.25, 8)
    expect(run.player.vy).toBeCloseTo(100 * (FLAGSHIP.u / REFERENCE.u), 8)
    expect(gate.x).toBeCloseTo(normalizedX * FLAGSHIP.width, 8)
    expect((gate.baseCenter - FLAGSHIP.playTop) / newSpan).toBeCloseTo(normalizedCenter, 8)
    expect(run.layout).toBe(FLAGSHIP)
  })

  it('rescales gate magnitudes to the new U', () => {
    const run = createRun(REFERENCE, 7)
    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')

    gate.amplitude = 10
    remapRun(run, FLAGSHIP)

    expect(gate.gapHeight).toBeCloseTo(gapHeightFor(0, FLAGSHIP.u), 8)
    expect(gate.amplitude).toBeCloseTo(10 * (FLAGSHIP.u / REFERENCE.u), 8)
  })

  it('clears interpolation history so a resize cannot render as a jump', () => {
    const run = createRun(REFERENCE, 99)
    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')

    gate.prevX = gate.x + 40
    run.player.prevY = run.player.y - 40

    remapRun(run, FLAGSHIP)

    expect(gate.prevX).toBe(gate.x)
    expect(run.player.prevY).toBe(run.player.y)
  })

  it('keeps every gap inside the legal band after an extreme resize', () => {
    const squat = computeLayout(400, 420, NO_INSETS)
    const run = createRun(REFERENCE, 4242)
    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')

    gate.baseCenter = REFERENCE.playBottom - 40
    remapRun(run, squat)

    const { lo, hi } = baseCenterBounds(squat, gate.gapHeight, gate.amplitude)
    expect(gate.baseCenter).toBeGreaterThanOrEqual(Math.min(lo, hi) - 1e-9)
    expect(gate.baseCenter).toBeLessThanOrEqual(Math.max(lo, hi) + 1e-9)
  })
})

describe('corridorMid', () => {
  it('sits halfway between the rails', () => {
    expect(corridorMid(REFERENCE)).toBe(404)
  })
})
