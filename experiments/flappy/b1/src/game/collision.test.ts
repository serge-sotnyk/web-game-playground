import { describe, expect, it } from 'vitest'
import {
  GATE_COLLISION_RELIEF_U,
  GATE_HIT_W_U,
  GATE_VISUAL_W_U,
  PLAYER_HIT_H_U,
  PLAYER_HIT_W_U,
  PLAYER_VISUAL_H_U,
  PLAYER_VISUAL_W_U,
} from './constants'
import { gateHitRects, hitsCorridor, hitsGate, playerHitRect, rectsOverlap } from './collision'
import { NO_INSETS, computeLayout, corridorMid } from './layout'
import { createRun, stepRun } from './simulation'
import type { Gate, SimEvent } from './types'

const LAYOUT = computeLayout(360, 800, NO_INSETS)
const U = LAYOUT.u

function gateAt(x: number, center: number, gapHeight = 184): Gate {
  return {
    id: 0,
    x,
    prevX: x,
    age: 0,
    gapHeight,
    baseCenter: center,
    amplitude: 0,
    phase: 0,
    scored: false,
  }
}

describe('playerHitRect', () => {
  it('is 22 x 16 U centred on the spark', () => {
    expect(playerHitRect(100, 200, 1)).toEqual({ x: 89, y: 192, w: 22, h: 16 })
  })

  it('is inset 6U horizontally and 5U vertically from the art', () => {
    expect((PLAYER_VISUAL_W_U - PLAYER_HIT_W_U) / 2).toBe(6)
    expect((PLAYER_VISUAL_H_U - PLAYER_HIT_H_U) / 2).toBe(5)
  })
})

describe('rectsOverlap', () => {
  it('counts edge contact as a hit', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    expect(rectsOverlap(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(true)
    expect(rectsOverlap(a, { x: 10.0001, y: 0, w: 5, h: 5 })).toBe(false)
  })

  it('is symmetric', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 }
    const b = { x: 5, y: 5, w: 10, h: 10 }
    expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a))
  })
})

describe('gateHitRects', () => {
  it('is 50U wide and stops 5U short of each visible lip', () => {
    const gate = gateAt(100, 400)
    const [top, bottom] = gateHitRects(gate, 400, LAYOUT)

    expect(top.w).toBe(GATE_HIT_W_U * U)
    expect(top.x).toBe(100 - (GATE_HIT_W_U / 2) * U)
    expect(top.y).toBe(LAYOUT.playTop)
    expect(top.y + top.h).toBeCloseTo(400 - 92 - GATE_COLLISION_RELIEF_U, 10)

    expect(bottom.y).toBeCloseTo(400 + 92 + GATE_COLLISION_RELIEF_U, 10)
    expect(bottom.y + bottom.h).toBe(LAYOUT.playBottom)
  })

  it('leaves a collision gap 10U taller than the art', () => {
    const gate = gateAt(100, 400)
    const [top, bottom] = gateHitRects(gate, 400, LAYOUT)
    expect(bottom.y - (top.y + top.h)).toBeCloseTo(gate.gapHeight + 2 * GATE_COLLISION_RELIEF_U, 10)
  })

  it('follows the drifted centre, not the base centre', () => {
    const gate = gateAt(100, 400)
    gate.amplitude = 20
    const [top] = gateHitRects(gate, 430, LAYOUT)
    expect(top.y + top.h).toBeCloseTo(430 - 92 - GATE_COLLISION_RELIEF_U, 10)
  })
})

describe('the art is more forgiving than it looks', () => {
  const gate = gateAt(200, 400)

  it('does not collide in the 4U horizontal margin inside the column edge', () => {
    // Player hitbox right edge exactly on the visible column edge.
    const visibleEdge = gate.x - (GATE_VISUAL_W_U / 2) * U
    const justInsideArt = visibleEdge + 1 - (PLAYER_HIT_W_U / 2) * U
    const player = playerHitRect(justInsideArt, LAYOUT.playTop + 30, U)
    expect(hitsGate(player, gate, 400, LAYOUT)).toBe(false)
  })

  it('does collide once the hitbox touches the collision column', () => {
    const collisionEdge = gate.x - (GATE_HIT_W_U / 2) * U
    const touching = collisionEdge - (PLAYER_HIT_W_U / 2) * U
    expect(hitsGate(playerHitRect(touching, LAYOUT.playTop + 30, U), gate, 400, LAYOUT)).toBe(true)
    expect(
      hitsGate(playerHitRect(touching - 0.001, LAYOUT.playTop + 30, U), gate, 400, LAYOUT),
    ).toBe(false)
  })

  it('does not collide in the 5U vertical relief just past a lip', () => {
    // Just above the visible top lip: inside the art, outside the hitbox.
    const lipY = 400 - gate.gapHeight / 2
    const player = playerHitRect(gate.x, lipY - 1 + (PLAYER_HIT_H_U / 2) * U, U)
    expect(hitsGate(player, gate, 400, LAYOUT)).toBe(false)
  })

  it('does collide once the hitbox reaches the collision column', () => {
    const columnEnd = 400 - gate.gapHeight / 2 - GATE_COLLISION_RELIEF_U * U
    const touching = columnEnd + (PLAYER_HIT_H_U / 2) * U
    expect(hitsGate(playerHitRect(gate.x, touching, U), gate, 400, LAYOUT)).toBe(true)
    expect(hitsGate(playerHitRect(gate.x, touching + 0.001, U), gate, 400, LAYOUT)).toBe(false)
  })
})

describe('corridor', () => {
  it('kills on contact with either rail', () => {
    const onTop = playerHitRect(100, LAYOUT.playTop + (PLAYER_HIT_H_U / 2) * U, U)
    expect(hitsCorridor(onTop, LAYOUT.playTop, LAYOUT.playBottom)).toBe(true)

    const onBottom = playerHitRect(100, LAYOUT.playBottom - (PLAYER_HIT_H_U / 2) * U, U)
    expect(hitsCorridor(onBottom, LAYOUT.playTop, LAYOUT.playBottom)).toBe(true)
  })

  it('spares a hair of clearance', () => {
    const clear = playerHitRect(100, LAYOUT.playTop + (PLAYER_HIT_H_U / 2) * U + 0.001, U)
    expect(hitsCorridor(clear, LAYOUT.playTop, LAYOUT.playBottom)).toBe(false)
  })
})

describe('ordering within a step', () => {
  it('emits only CRASHED when a pass and a collision land together', () => {
    const run = createRun(LAYOUT, 3)
    const gate = run.gates[0]
    if (!gate) throw new Error('expected an opening gate')

    // Trailing edge about to clear the spark...
    gate.x = LAYOUT.playerX - (GATE_VISUAL_W_U / 2) * U + 0.5
    // ...while the spark sits deep inside the upper column.
    gate.baseCenter = LAYOUT.playBottom - 150
    run.player.y = corridorMid(LAYOUT)
    run.player.vy = 0

    const events: SimEvent[] = []
    stepRun(run, events)

    expect(events.map((e) => e.type)).toEqual(['CRASHED'])
    expect(run.score).toBe(0)
    expect(gate.scored).toBe(false)
    expect(run.alive).toBe(false)
  })

  it('stops simulating once dead', () => {
    const run = createRun(LAYOUT, 3)
    run.player.y = LAYOUT.playBottom
    stepRun(run, [])
    expect(run.alive).toBe(false)

    const frozen = { y: run.player.y, distance: run.distance, elapsed: run.elapsed }
    stepRun(run, [])
    expect(run.player.y).toBe(frozen.y)
    expect(run.distance).toBe(frozen.distance)
    expect(run.elapsed).toBe(frozen.elapsed)
  })
})
