import { GAP_EDGE_MARGIN, WORLD_W, clamp } from './constants';
import { difficultyAt } from './difficulty';
import type { Barrier } from './types';

export interface NextBarrier {
  barrier: Barrier;
  gapDrift: -1 | 1;
}

export function firstBarrier(viewH: number): Barrier {
  const gapWidth = difficultyAt(0).gapWidth;
  return {
    index: 0,
    y: 0.9 * viewH,
    gapL: WORLD_W / 2 - gapWidth / 2,
    gapR: WORLD_W / 2 + gapWidth / 2,
    scored: false,
  };
}

export function appendBarrier(
  previous: Barrier,
  rng: () => number,
  currentGapDrift: -1 | 1,
): NextBarrier {
  const index = previous.index + 1;
  const ownDifficulty = difficultyAt(index);
  const previousDifficulty = difficultyAt(previous.index);
  const maxDelta = clamp(
    (0.5 * ownDifficulty.driftSpeed * ownDifficulty.spacing) /
      ownDifficulty.fallSpeed,
    80,
    200,
  );
  const magnitude = maxDelta * (0.35 + 0.65 * rng());
  let gapDrift = currentGapDrift;
  if (rng() < 0.3) gapDrift = gapDrift === 1 ? -1 : 1;

  const previousCenter = (previous.gapL + previous.gapR) / 2;
  const minCenter = GAP_EDGE_MARGIN + ownDifficulty.gapWidth / 2;
  const maxCenter = WORLD_W - GAP_EDGE_MARGIN - ownDifficulty.gapWidth / 2;
  let center = previousCenter + gapDrift * magnitude;
  if (center < minCenter) {
    center = minCenter;
    gapDrift = 1;
  } else if (center > maxCenter) {
    center = maxCenter;
    gapDrift = -1;
  }

  return {
    barrier: {
      index,
      y: previous.y + previousDifficulty.spacing,
      gapL: center - ownDifficulty.gapWidth / 2,
      gapR: center + ownDifficulty.gapWidth / 2,
      scored: false,
    },
    gapDrift,
  };
}
