import { DYING_SCROLL_MS, DYING_TO_RESULTS_MS, RESULTS_LOCK_MS } from './constants'
import { clamp } from './math'
import type { GameState } from './types'

/** What a tap means in the current state. The caller performs the effect. */
export type TapAction = 'IGNORE' | 'START_RUN' | 'FLIP' | 'RESUME'

/**
 * The high-level game state, modelled explicitly and kept free of Phaser so it
 * can be driven step by step in tests.
 *
 * It decides *what happens next*; it never creates runs, plays sounds or writes
 * storage. `GameScene` owns an instance of this and performs the effects.
 */
export class StateMachine {
  private current: GameState = 'BOOT'
  private dyingMs = 0
  private resultsMs = 0
  private landscapeBlocked = false

  get state(): GameState {
    return this.current
  }

  get isBlocked(): boolean {
    return this.landscapeBlocked
  }

  /** BOOT -> READY. With no assets to load, this happens as soon as we exist. */
  toReady(): void {
    this.current = 'READY'
    this.dyingMs = 0
    this.resultsMs = 0
  }

  tap(): TapAction {
    if (this.landscapeBlocked) return 'IGNORE'

    switch (this.current) {
      case 'READY':
        this.current = 'PLAYING'
        return 'START_RUN'

      case 'PLAYING':
        return 'FLIP'

      case 'PAUSED':
        // Deliberately distinct from FLIP: resuming must not cost a polarity.
        this.current = 'PLAYING'
        return 'RESUME'

      case 'RESULTS':
        // Swallow the tap that caused the crash.
        if (this.resultsMs < RESULTS_LOCK_MS) return 'IGNORE'
        this.current = 'PLAYING'
        return 'START_RUN'

      case 'BOOT':
      case 'DYING':
        return 'IGNORE'
    }
  }

  /** Returns true when this actually began a death; false if already dying. */
  crash(): boolean {
    if (this.current !== 'PLAYING') return false
    this.current = 'DYING'
    this.dyingMs = 0
    return true
  }

  /** Returns true when a run was actually paused. */
  pause(): boolean {
    if (this.current !== 'PLAYING') return false
    this.current = 'PAUSED'
    return true
  }

  /**
   * Landscape blocks play. Rotating back does *not* resume — the run stays
   * paused until the player deliberately taps.
   */
  setLandscape(landscape: boolean): boolean {
    this.landscapeBlocked = landscape
    return landscape ? this.pause() : false
  }

  /** Called once per frame; drives the DYING and RESULTS timers. */
  advance(deltaMs: number): void {
    if (this.current === 'DYING') {
      this.dyingMs += deltaMs
      if (this.dyingMs >= DYING_TO_RESULTS_MS) {
        this.current = 'RESULTS'
        this.resultsMs = 0
      }
      return
    }

    if (this.current === 'RESULTS') this.resultsMs += deltaMs
  }

  /** World-scroll multiplier during DYING: 1 at impact, 0 after 250 ms. */
  scrollFactor(): number {
    return 1 - clamp(this.dyingMs / DYING_SCROLL_MS, 0, 1)
  }
}
