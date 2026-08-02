import { GAP_EDGE_MARGIN, WORLD_W } from './constants';
import { clamp, difficultyAt } from './difficulty';
import { mulberry32 } from './rng';
import type { Barrier } from './types';

/**
 * The reachability bound for barrier `n`: half the horizontal distance the mote
 * can cover while falling one barrier's worth of spacing. A gap centre never
 * moves further than this, so no gap is ever placed somewhere the mote
 * physically cannot reach in time.
 */
export function maxDeltaAt(n: number): number {
  const d = difficultyAt(n);
  return clamp((0.5 * d.driftSpeed * d.spacing) / d.fallSpeed, 80, 200);
}

/** Legal range for a gap centre at barrier `n`, given GAP_EDGE_MARGIN. */
export function gapCentreBounds(n: number): { minCx: number; maxCx: number } {
  const half = difficultyAt(n).gapWidth / 2;
  return {
    minCx: GAP_EDGE_MARGIN + half,
    maxCx: WORLD_W - GAP_EDGE_MARGIN - half,
  };
}

/**
 * Stateful, seeded barrier stream. Barrier 0 sits at 0.90 * viewH with its gap
 * centred; every later gap centre does a bounded random walk.
 */
export class BarrierGenerator {
  private readonly rng: () => number;
  private cx = WORLD_W / 2;
  /** Walk direction of the *gap*. Unrelated to the mote's drift direction. */
  private gapDrift: -1 | 1 = 1;
  private nextIndex = 0;
  private nextY: number;

  constructor(seed: number, viewH: number) {
    this.rng = mulberry32(seed);
    this.nextY = 0.9 * viewH;
  }

  next(): Barrier {
    const n = this.nextIndex;
    const d = difficultyAt(n);

    if (n > 0) {
      const maxDelta = maxDeltaAt(n);
      const mag = maxDelta * (0.35 + 0.65 * this.rng());
      if (this.rng() < 0.3) this.gapDrift = this.gapDrift === 1 ? -1 : 1;

      let cx = this.cx + this.gapDrift * mag;
      const { minCx, maxCx } = gapCentreBounds(n);
      if (cx < minCx) {
        cx = minCx;
        this.gapDrift = 1;
      }
      if (cx > maxCx) {
        cx = maxCx;
        this.gapDrift = -1;
      }
      this.cx = cx;
    }

    const barrier: Barrier = {
      index: n,
      y: this.nextY,
      gapL: this.cx - d.gapWidth / 2,
      gapR: this.cx + d.gapWidth / 2,
      scored: false,
    };

    this.nextIndex = n + 1;
    this.nextY += d.spacing;
    return barrier;
  }
}
