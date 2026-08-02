import {
  GATE_COLLISION_RELIEF_U,
  GATE_HIT_W_U,
  GATE_VISUAL_W_U,
  PLAYER_HIT_H_U,
  PLAYER_HIT_W_U,
} from './constants'
import type { Gate, Layout } from './types'

/** Axis-aligned box, top-left anchored. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Inclusive AABB overlap: touching edges count as a hit. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}

/**
 * The spark's hitbox: 22 x 16 U centred on the sprite, inset 6U horizontally
 * and 5U vertically from the 34 x 26 U art. Visual rotation never touches it.
 */
export function playerHitRect(playerX: number, playerY: number, u: number): Rect {
  const w = PLAYER_HIT_W_U * u
  const h = PLAYER_HIT_H_U * u
  return { x: playerX - w / 2, y: playerY - h / 2, w, h }
}

/** Half-width of a gate's *visible* column — the edge scoring and despawn use. */
export function gateHalfVisualWidth(u: number): number {
  return (GATE_VISUAL_W_U / 2) * u
}

/**
 * A gate's two solid columns, as collision boxes.
 *
 * They are 4U narrower per side than the art, and stop 5U short of each visible
 * lip, so the playable gap is 10U taller than it looks. Near misses read as
 * near misses instead of as unfair deaths.
 */
export function gateHitRects(gate: Gate, center: number, layout: Layout): [Rect, Rect] {
  const u = layout.u
  const w = GATE_HIT_W_U * u
  const x = gate.x - w / 2
  const relief = GATE_COLLISION_RELIEF_U * u

  const topEnds = center - gate.gapHeight / 2 - relief
  const bottomStarts = center + gate.gapHeight / 2 + relief

  return [
    { x, y: layout.playTop, w, h: Math.max(0, topEnds - layout.playTop) },
    { x, y: bottomStarts, w, h: Math.max(0, layout.playBottom - bottomStarts) },
  ]
}

/** Touching or crossing either rail is fatal. */
export function hitsCorridor(rect: Rect, playTop: number, playBottom: number): boolean {
  return rect.y <= playTop || rect.y + rect.h >= playBottom
}

export function hitsGate(playerRect: Rect, gate: Gate, center: number, layout: Layout): boolean {
  const [top, bottom] = gateHitRects(gate, center, layout)
  return rectsOverlap(playerRect, top) || rectsOverlap(playerRect, bottom)
}
