import { clamp, RAMP_BARRIERS } from './constants';
import type { DifficultyParams } from './types';

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function difficultyAt(index: number): DifficultyParams {
  const t = clamp(index / RAMP_BARRIERS, 0, 1);
  const ease = t * t * (3 - 2 * t);
  return {
    fallSpeed: lerp(320, 460, ease),
    driftSpeed: lerp(300, 360, ease),
    gapWidth: lerp(230, 150, ease),
    spacing: lerp(420, 380, ease),
  };
}
