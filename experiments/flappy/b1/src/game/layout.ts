import {
  GATE_EDGE_MARGIN_U,
  PLAYER_X_RATIO,
  PLAY_BOTTOM_INSET_U,
  PLAY_BOTTOM_MIN_U,
  PLAY_TOP_INSET_U,
  PLAY_TOP_MIN_U,
  REF_HEIGHT,
  REF_WIDTH,
  U_MAX,
  U_MIN,
} from './constants'
import { clamp, lerp, normalize } from './math'
import type { Layout, Run, SafeInsets } from './types'

export const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * Resolve a viewport into a play field. Pure: same inputs, same Layout.
 *
 * The corridor is inset far enough from the top that the HUD always has room
 * above the upper rail, and far enough from the bottom to clear a gesture bar.
 */
export function computeLayout(
  width: number,
  height: number,
  safe: SafeInsets = NO_INSETS,
): Layout {
  const u = clamp(Math.min(width / REF_WIDTH, height / REF_HEIGHT), U_MIN, U_MAX)
  const playTop = Math.max(safe.top + PLAY_TOP_INSET_U * u, PLAY_TOP_MIN_U * u)
  const playBottom = height - Math.max(safe.bottom + PLAY_BOTTOM_INSET_U * u, PLAY_BOTTOM_MIN_U * u)

  return {
    width,
    height,
    u,
    playTop,
    playBottom,
    playerX: PLAYER_X_RATIO * width,
    safe,
  }
}

export function corridorHeight(layout: Layout): number {
  return layout.playBottom - layout.playTop
}

export function corridorMid(layout: Layout): number {
  return (layout.playTop + layout.playBottom) / 2
}

/** True when the viewport is wider than it is tall — play is blocked. */
export function isLandscape(layout: Layout): boolean {
  return layout.width >= layout.height
}

/**
 * The legal band for a gate's base centre, given its gap and drift amplitude.
 * Reserving the amplitude here is what keeps a drifting gap from ever eating
 * into the `GATE_EDGE_MARGIN_U` clearance at the rails.
 */
export function baseCenterBounds(
  layout: Layout,
  gapHeight: number,
  amplitude: number,
): { lo: number; hi: number } {
  const margin = GATE_EDGE_MARGIN_U * layout.u
  return {
    lo: layout.playTop + gapHeight / 2 + margin + amplitude,
    hi: layout.playBottom - gapHeight / 2 - margin - amplitude,
  }
}

/**
 * Carry an in-flight run across a viewport change.
 *
 * Positions are preserved *proportionally* — normalized vertically inside the
 * corridor, normalized horizontally against the viewport width — and every
 * tuned magnitude is rescaled from the old `u` to the new one. The result is
 * that a resize mid-run looks like the same run on a different screen, not a
 * teleport.
 *
 * The caller must clear the fixed-step accumulator afterwards.
 */
export function remapRun(run: Run, next: Layout): void {
  const prev = run.layout
  if (prev === next) return

  const uRatio = prev.u > 0 ? next.u / prev.u : 1
  const xRatio = prev.width > 0 ? next.width / prev.width : 1

  const reposition = (y: number): number =>
    lerp(next.playTop, next.playBottom, normalize(y, prev.playTop, prev.playBottom))

  run.player.y = reposition(run.player.y)
  run.player.prevY = run.player.y
  run.player.vy *= uRatio

  for (const gate of run.gates) {
    gate.x *= xRatio
    gate.prevX = gate.x
    gate.gapHeight *= uRatio
    gate.amplitude *= uRatio

    // Re-clamp: the corridor and `u` can scale by different factors, so a
    // proportionally-placed centre is not automatically still legal.
    const { lo, hi } = baseCenterBounds(next, gate.gapHeight, gate.amplitude)
    const moved = reposition(gate.baseCenter)
    gate.baseCenter = lo <= hi ? clamp(moved, lo, hi) : (lo + hi) / 2
  }

  run.lastBaseCenter = reposition(run.lastBaseCenter)
  run.layout = next
}
