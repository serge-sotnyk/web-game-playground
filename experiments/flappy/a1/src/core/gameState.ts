import { BarrierGenerator } from './barriers';
import { circleHitsBand } from './collision';
import {
  ANCHOR_MAX,
  ANCHOR_MIN,
  BAND_H,
  DYING_TIME,
  LOOKAHEAD,
  NEAR_MISS_SLACK,
  R_HIT,
  WALL_R,
  WORLD_W,
} from './constants';
import { clamp, difficultyAt } from './difficulty';
import { deriveSeed } from './rng';
import type { Barrier, GameEvent, Orb, Phase, ResumablePhase } from './types';

export interface GameStateOptions {
  seed: number;
  viewH: number;
  best: number;
}

/** How far below the top of the view the mote sits, for a given view height. */
export function anchorUnitsFor(viewH: number): number {
  return clamp(viewH - LOOKAHEAD, ANCHOR_MIN, ANCHOR_MAX);
}

/**
 * The whole simulation. Pure TypeScript: no Phaser, no DOM, no clock, no
 * Math.random. Given a seed, a view height and a sequence of taps it produces a
 * run, which is what makes it testable without a canvas.
 */
export class GameState {
  readonly orb: Orb = { x: WORLD_W / 2, y: 0, dir: 1 };
  phase: Phase = 'ready';
  score = 0;
  best: number;
  barriers: Barrier[] = [];
  cameraTopY = 0;
  /** Counts down through the death animation. */
  dyingT = 0;

  private viewH: number;
  private seed: number;
  private gen: BarrierGenerator;
  private taps = 0;
  private pending: GameEvent[] = [];
  private resumePhase: ResumablePhase = 'ready';

  constructor(opts: GameStateOptions) {
    this.viewH = opts.viewH;
    this.best = Math.max(0, opts.best | 0);
    this.seed = opts.seed >>> 0;
    this.gen = new BarrierGenerator(this.seed, this.viewH);
    this.resetInternal(this.seed);
  }

  get anchorUnits(): number {
    return anchorUnitsFor(this.viewH);
  }

  get viewHeight(): number {
    return this.viewH;
  }

  /**
   * Safe mid-run: it changes only the look-ahead anchor and the generation
   * horizon. Already-placed barriers never move, and the run is never reset.
   * While `ready` the mote is re-anchored so the camera still starts at y = 0.
   */
  setViewHeight(viewH: number): void {
    this.viewH = Math.max(1, viewH);
    if (this.phase === 'ready') this.orb.y = this.anchorUnits;
    this.cameraTopY = this.orb.y - this.anchorUnits;
    this.maintainBarriers();
  }

  /** Queues one input. Each `step()` consumes at most one. */
  tap(): void {
    this.taps++;
  }

  requestPause(): void {
    if (this.phase === 'paused' || this.phase === 'dying') return;
    this.resumePhase = this.phase;
    this.phase = 'paused';
    this.taps = 0;
    this.pending.push({ type: 'pause' });
  }

  requestResume(): void {
    if (this.phase !== 'paused') return;
    this.phase = this.resumePhase;
    this.taps = 0;
    this.pending.push({ type: 'resume' });
  }

  /** Back to `ready` with a brand-new seeded run. */
  reset(seed: number): void {
    this.resetInternal(seed >>> 0);
    this.pending.push({ type: 'reset' });
  }

  /** Advances one fixed step. `dt` is always DT. */
  step(dt: number): GameEvent[] {
    const out = this.pending;
    this.pending = [];

    switch (this.phase) {
      case 'paused':
        this.taps = 0;
        return out;

      case 'dying':
        this.taps = 0;
        this.dyingT -= dt;
        if (this.dyingT <= 0) {
          this.dyingT = 0;
          this.phase = 'dead';
          out.push({ type: 'dead' });
        }
        return out;

      case 'dead':
        if (this.consumeTap()) {
          this.resetInternal(deriveSeed(this.seed));
          out.push({ type: 'reset' });
        }
        return out;

      case 'ready':
        // The first tap starts the fall and does *not* reverse the drift.
        if (this.consumeTap()) {
          this.phase = 'playing';
          out.push({ type: 'start' });
        }
        break;

      case 'playing':
        if (this.consumeTap()) {
          this.orb.dir = this.orb.dir === 1 ? -1 : 1;
          out.push({ type: 'flip', x: this.orb.x, y: this.orb.y });
        }
        break;
    }

    const d = difficultyAt(this.score);
    const prevY = this.orb.y;

    if (this.phase === 'playing') this.orb.y += d.fallSpeed * dt;
    this.orb.x += this.orb.dir * d.driftSpeed * dt;

    if (this.orb.x < WALL_R) {
      this.orb.x = WALL_R;
      this.orb.dir = 1;
      out.push({ type: 'bounce', side: 'left', y: this.orb.y });
    } else if (this.orb.x > WORLD_W - WALL_R) {
      this.orb.x = WORLD_W - WALL_R;
      this.orb.dir = -1;
      out.push({ type: 'bounce', side: 'right', y: this.orb.y });
    }

    if (this.phase === 'playing') {
      this.scorePasses(prevY, out);
      this.testCollision(out);
    }

    this.cameraTopY = this.orb.y - this.anchorUnits;
    this.maintainBarriers();
    return out;
  }

  // ---------------------------------------------------------------- internals

  private resetInternal(seed: number): void {
    this.seed = seed >>> 0;
    this.gen = new BarrierGenerator(this.seed, this.viewH);
    this.barriers = [];
    this.score = 0;
    this.phase = 'ready';
    this.resumePhase = 'ready';
    this.dyingT = 0;
    this.taps = 0;
    this.orb.x = WORLD_W / 2;
    this.orb.dir = 1;
    this.orb.y = this.anchorUnits;
    this.cameraTopY = 0;
    this.maintainBarriers();
  }

  private consumeTap(): boolean {
    if (this.taps <= 0) return false;
    this.taps--;
    return true;
  }

  /**
   * Scoring runs before collision: a mote that has crossed a band's midline is
   * already through the gap, so it keeps the point even if it clips an edge on
   * the way out.
   */
  private scorePasses(prevY: number, out: GameEvent[]): void {
    for (const b of this.barriers) {
      if (b.scored) continue;
      const plane = b.y + BAND_H / 2;
      if (prevY < plane && this.orb.y >= plane) {
        b.scored = true;
        this.score++;
        const clearance = Math.min(this.orb.x - b.gapL, b.gapR - this.orb.x);
        out.push({
          type: 'pass',
          index: b.index,
          score: this.score,
          nearMiss: clearance < R_HIT + NEAR_MISS_SLACK,
        });
      }
    }
  }

  private testCollision(out: GameEvent[]): void {
    const reach = BAND_H / 2 + R_HIT + 4;
    for (const b of this.barriers) {
      if (Math.abs(b.y + BAND_H / 2 - this.orb.y) >= reach) continue;
      if (!circleHitsBand(this.orb.x, this.orb.y, R_HIT, b.y, b.gapL, b.gapR)) continue;

      this.phase = 'dying';
      this.dyingT = DYING_TIME;
      const newBest = this.score > this.best;
      if (newBest) this.best = this.score;
      out.push({
        type: 'death',
        x: this.orb.x,
        y: this.orb.y,
        score: this.score,
        best: this.best,
        newBest,
      });
      return;
    }
  }

  private maintainBarriers(): void {
    const horizon = this.orb.y + this.viewH + 400;
    // Spacing is never below 380, so this terminates; the cap is a guard only.
    for (let i = 0; i < 64; i++) {
      const last = this.barriers[this.barriers.length - 1];
      if (last && last.y >= horizon) break;
      this.barriers.push(this.gen.next());
    }

    const cullY = this.cameraTopY - 200;
    let drop = 0;
    while (drop < this.barriers.length && this.barriers[drop]!.y + BAND_H < cullY) {
      drop++;
    }
    if (drop > 0) this.barriers.splice(0, drop);
  }
}
