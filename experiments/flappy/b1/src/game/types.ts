/** Shared data shapes. No behaviour lives here. */

export type GameState = 'BOOT' | 'READY' | 'PLAYING' | 'PAUSED' | 'DYING' | 'RESULTS'

/** Polarity: -1 pulls the spark up, +1 pulls it down. */
export type Direction = -1 | 1

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * A resolved play field, in logical CSS pixels. Everything the simulation needs
 * to know about the screen.
 */
export interface Layout {
  /** Logical viewport width, CSS px. */
  width: number
  /** Logical viewport height, CSS px. */
  height: number
  /** Design scale; multiply every `*_U` constant by this. */
  u: number
  /** Top of the play corridor (the deadly upper rail edge). */
  playTop: number
  /** Bottom of the play corridor (the deadly lower rail edge). */
  playBottom: number
  /** Fixed horizontal position of the spark. */
  playerX: number
  safe: SafeInsets
}

export interface Gate {
  id: number
  /** Centre x of the column pair, logical px. */
  x: number
  /** Value of `x` at the start of the current fixed step, for interpolation. */
  prevX: number
  /** Seconds since this gate spawned; drives the drift phase. */
  age: number
  gapHeight: number
  /** Undrifted centre of the gap. */
  baseCenter: number
  /** Peak drift excursion; 0 disables drift entirely. */
  amplitude: number
  phase: number
  scored: boolean
}

export interface Player {
  y: number
  /** Value of `y` at the start of the current fixed step, for interpolation. */
  prevY: number
  vy: number
  direction: Direction
}

export type SimEvent =
  | { type: 'FLIPPED'; direction: Direction; y: number }
  | { type: 'GATE_SPAWNED'; gateId: number }
  | { type: 'SCORED'; score: number; gateId: number }
  | { type: 'CRASHED'; y: number; cause: 'rail' | 'gate' }

export interface Run {
  layout: Layout
  player: Player
  gates: Gate[]
  score: number
  /** Cumulative world scroll in logical px; drives rail dashes and parallax. */
  distance: number
  /** Simulated seconds since the run started. */
  elapsed: number
  alive: boolean
  rng: () => number
  nextGateId: number
  /** Base centre of the most recently spawned gate. */
  lastBaseCenter: number
  flipQueued: boolean
  /** Timestamp (ms) of the last *accepted* flip request; drives the debounce. */
  lastFlipAtMs: number
}

/** Owned by the scene; kept here so the accumulator can be tested headlessly. */
export interface Stepper {
  accumulator: number
}

export interface Settings {
  best: number
  muted: boolean
}
