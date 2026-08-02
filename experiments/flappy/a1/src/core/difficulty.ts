import { RAMP_BARRIERS } from './constants';
import type { DifficultyParams } from './types';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Endpoints of the ramp: [easy at n = 0, hard at n >= RAMP_BARRIERS]. */
export const EASY: DifficultyParams = {
  fallSpeed: 320,
  driftSpeed: 300,
  gapWidth: 230,
  spacing: 420,
};

export const HARD: DifficultyParams = {
  fallSpeed: 460,
  driftSpeed: 360,
  gapWidth: 150,
  spacing: 380,
};

/**
 * Difficulty at barrier index / score `n`. Smoothstep across the first
 * RAMP_BARRIERS barriers, then flat forever.
 */
export function difficultyAt(n: number): DifficultyParams {
  const t = clamp(n / RAMP_BARRIERS, 0, 1);
  const ease = t * t * (3 - 2 * t);
  return {
    fallSpeed: lerp(EASY.fallSpeed, HARD.fallSpeed, ease),
    driftSpeed: lerp(EASY.driftSpeed, HARD.driftSpeed, ease),
    gapWidth: lerp(EASY.gapWidth, HARD.gapWidth, ease),
    spacing: lerp(EASY.spacing, HARD.spacing, ease),
  };
}
