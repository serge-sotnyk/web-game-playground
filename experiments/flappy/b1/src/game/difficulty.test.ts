import { describe, expect, it } from 'vitest'
import { GATE_SPACING_U } from './constants'
import { NO_INSETS, computeLayout } from './layout'
import { driftAmplitudeFor, gapHeightFor, spawnIntervalFor, speedFor } from './simulation'

const U = 1
const SCALED = computeLayout(412, 915, NO_INSETS).u

describe('gap height', () => {
  it('starts at 184U and bottoms out at 146U by score 24', () => {
    expect(gapHeightFor(0, U)).toBe(184)
    expect(gapHeightFor(10, U)).toBeCloseTo(168, 10)
    expect(gapHeightFor(24, U)).toBe(146)
    expect(gapHeightFor(100, U)).toBe(146)
  })

  it('scales with U', () => {
    expect(gapHeightFor(0, SCALED)).toBeCloseTo(184 * SCALED, 10)
    expect(gapHeightFor(60, SCALED)).toBeCloseTo(146 * SCALED, 10)
  })
})

describe('scroll speed', () => {
  it('starts at 132U/s and tops out at 170U/s', () => {
    expect(speedFor(0, U)).toBe(132)
    expect(speedFor(10, U)).toBeCloseTo(148, 10)
    expect(speedFor(24, U)).toBe(170)
    expect(speedFor(500, U)).toBe(170)
  })

  it('scales with U', () => {
    expect(speedFor(0, SCALED)).toBeCloseTo(132 * SCALED, 10)
    expect(speedFor(99, SCALED)).toBeCloseTo(170 * SCALED, 10)
  })
})

describe('spawn interval', () => {
  it('follows from constant 205U spacing over the current speed', () => {
    expect(spawnIntervalFor(0, U)).toBeCloseTo(1.553, 3)
    expect(spawnIntervalFor(24, U)).toBeCloseTo(1.206, 3)
    expect(spawnIntervalFor(0, U)).toBeCloseTo(GATE_SPACING_U / speedFor(0, U), 10)
  })

  it('is independent of U, because spacing and speed both scale', () => {
    expect(spawnIntervalFor(0, SCALED)).toBeCloseTo(spawnIntervalFor(0, U), 10)
    expect(spawnIntervalFor(30, SCALED)).toBeCloseTo(spawnIntervalFor(30, U), 10)
  })
})

describe('drift amplitude', () => {
  it('is zero for the first six gates', () => {
    for (let score = 0; score <= 5; score += 1) {
      expect(driftAmplitudeFor(score, U)).toBe(0)
    }
  })

  it('ramps 1.25U per point from score 6 and caps at 20U', () => {
    expect(driftAmplitudeFor(6, U)).toBeCloseTo(1.25, 10)
    expect(driftAmplitudeFor(10, U)).toBeCloseTo(6.25, 10)
    expect(driftAmplitudeFor(21, U)).toBe(20)
    expect(driftAmplitudeFor(200, U)).toBe(20)
  })
})
