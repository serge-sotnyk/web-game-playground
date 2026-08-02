import { appendBarrier, firstBarrier } from './barriers';
import { circleHitsRect } from './collision';
import {
  BAND_H,
  DYING_TIME,
  INSET,
  R_HIT,
  WALL_R,
  WORLD_W,
  anchorForView,
} from './constants';
import { difficultyAt } from './difficulty';
import { mulberry32 } from './rng';
import type { Barrier, GameEvent, Orb, Phase } from './types';

export class GameState {
  readonly orb: Orb = { x: WORLD_W / 2, y: 0, dir: 1 };
  phase: Phase = 'ready';
  score = 0;
  best: number;
  barriers: Barrier[] = [];
  cameraTopY = 0;

  private viewH: number;
  private rng: () => number;
  private gapDrift: -1 | 1 = 1;
  private queuedTaps = 0;
  private dyingT = 0;
  private pausedFrom: Exclude<Phase, 'paused'> = 'ready';
  private pendingEvents: GameEvent[] = [];

  constructor(opts: { seed: number; viewH: number; best: number }) {
    this.viewH = opts.viewH;
    this.best = Math.max(0, opts.best);
    this.rng = mulberry32(opts.seed);
    this.reset(opts.seed);
    this.pendingEvents.length = 0;
  }

  setViewHeight(viewH: number): void {
    const previousViewH = this.viewH;
    this.viewH = Math.max(1, viewH);
    if (this.phase === 'ready' || (this.phase === 'paused' && this.pausedFrom === 'ready')) {
      const barrierShift = 0.9 * (this.viewH - previousViewH);
      this.barriers.forEach((barrier) => {
        barrier.y += barrierShift;
      });
      this.orb.y = anchorForView(this.viewH);
    }
    this.updateCameraAndBarriers();
  }

  tap(): void {
    this.queuedTaps += 1;
  }

  requestPause(): void {
    if (this.phase === 'paused') return;
    this.pausedFrom = this.phase;
    this.phase = 'paused';
    this.queuedTaps = 0;
    this.pendingEvents.push({ type: 'pause' });
  }

  requestResume(): void {
    if (this.phase !== 'paused') return;
    this.phase = this.pausedFrom;
    this.queuedTaps = 0;
    this.pendingEvents.push({ type: 'resume' });
  }

  step(dt: number): GameEvent[] {
    const events = this.pendingEvents.splice(0);
    this.consumeOneTap(events);

    if (this.phase === 'dying') {
      this.dyingT += dt;
      if (this.dyingT + Number.EPSILON >= DYING_TIME) {
        this.phase = 'dead';
        events.push({ type: 'dead' });
      }
      return events;
    }

    if (this.phase !== 'ready' && this.phase !== 'playing') return events;

    const difficulty = difficultyAt(this.score);
    const previousY = this.orb.y;
    this.orb.x += this.orb.dir * difficulty.driftSpeed * dt;
    if (this.phase === 'playing') this.orb.y += difficulty.fallSpeed * dt;

    if (this.orb.x < WALL_R) {
      this.orb.x = WALL_R;
      this.orb.dir = 1;
      events.push({ type: 'bounce', side: 'left', y: this.orb.y });
    } else if (this.orb.x > WORLD_W - WALL_R) {
      this.orb.x = WORLD_W - WALL_R;
      this.orb.dir = -1;
      events.push({ type: 'bounce', side: 'right', y: this.orb.y });
    }

    if (this.phase === 'playing') {
      const collision = this.findCollision();
      if (collision) {
        this.phase = 'dying';
        this.dyingT = 0;
        const newBest = this.score > this.best;
        if (newBest) this.best = this.score;
        events.push({
          type: 'death',
          x: this.orb.x,
          y: this.orb.y,
          score: this.score,
          best: this.best,
          newBest,
        });
      } else {
        this.scoreCrossedBarriers(previousY, this.orb.y, events);
      }
    }

    this.updateCameraAndBarriers();
    return events;
  }

  reset(seed: number): void {
    this.rng = mulberry32(seed);
    this.gapDrift = 1;
    this.phase = 'ready';
    this.score = 0;
    this.queuedTaps = 0;
    this.dyingT = 0;
    this.pausedFrom = 'ready';
    this.orb.x = WORLD_W / 2;
    this.orb.y = anchorForView(this.viewH);
    this.orb.dir = 1;
    this.cameraTopY = 0;
    this.barriers = [firstBarrier(this.viewH)];
    this.fillAhead();
    this.pendingEvents.push({ type: 'reset' });
  }

  private consumeOneTap(events: GameEvent[]): void {
    if (this.queuedTaps <= 0) return;
    this.queuedTaps -= 1;
    if (this.phase === 'ready') {
      this.phase = 'playing';
      events.push({ type: 'start' });
    } else if (this.phase === 'playing') {
      this.orb.dir = this.orb.dir === 1 ? -1 : 1;
      events.push({ type: 'flip', x: this.orb.x, y: this.orb.y });
    }
  }

  private findCollision(): boolean {
    for (const barrier of this.barriers) {
      if (
        Math.abs(barrier.y + BAND_H / 2 - this.orb.y) >=
        BAND_H / 2 + R_HIT + 4
      ) {
        continue;
      }
      const y = barrier.y + INSET;
      const height = BAND_H - INSET * 2;
      if (
        circleHitsRect(
          this.orb.x,
          this.orb.y,
          R_HIT,
          INSET,
          y,
          barrier.gapL - INSET * 2,
          height,
        ) ||
        circleHitsRect(
          this.orb.x,
          this.orb.y,
          R_HIT,
          barrier.gapR + INSET,
          y,
          WORLD_W - barrier.gapR - INSET * 2,
          height,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private scoreCrossedBarriers(
    previousY: number,
    newY: number,
    events: GameEvent[],
  ): void {
    for (const barrier of this.barriers) {
      const plane = barrier.y + BAND_H / 2;
      if (!barrier.scored && previousY < plane && plane <= newY) {
        barrier.scored = true;
        this.score += 1;
        const edgeDistance = Math.min(
          this.orb.x - barrier.gapL,
          barrier.gapR - this.orb.x,
        );
        events.push({
          type: 'pass',
          index: barrier.index,
          score: this.score,
          nearMiss: edgeDistance < R_HIT + 14,
        });
      }
    }
  }

  private updateCameraAndBarriers(): void {
    this.cameraTopY = this.orb.y - anchorForView(this.viewH);
    this.barriers = this.barriers.filter(
      (barrier) => barrier.y + BAND_H >= this.cameraTopY - 200,
    );
    this.fillAhead();
  }

  private fillAhead(): void {
    const targetY = this.orb.y + this.viewH + 400;
    while (this.barriers[this.barriers.length - 1].y < targetY) {
      const next = appendBarrier(
        this.barriers[this.barriers.length - 1],
        this.rng,
        this.gapDrift,
      );
      this.gapDrift = next.gapDrift;
      this.barriers.push(next.barrier);
    }
  }
}
