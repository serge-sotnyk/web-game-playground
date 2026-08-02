import { describe, expect, it } from 'vitest';
import { RAMP_BARRIERS } from '../src/core/constants';
import { EASY, HARD, difficultyAt } from '../src/core/difficulty';

describe('difficultyAt', () => {
  it('is exactly the easy end at n = 0', () => {
    expect(difficultyAt(0)).toEqual(EASY);
  });

  it('is exactly the hard end at the top of the ramp', () => {
    expect(difficultyAt(RAMP_BARRIERS)).toEqual(HARD);
  });

  it('holds flat forever past the ramp', () => {
    expect(difficultyAt(RAMP_BARRIERS + 1)).toEqual(HARD);
    expect(difficultyAt(1000)).toEqual(HARD);
  });

  it('clamps below zero', () => {
    expect(difficultyAt(-5)).toEqual(EASY);
  });

  it('moves monotonically towards harder across the ramp', () => {
    for (let n = 1; n <= RAMP_BARRIERS; n++) {
      const prev = difficultyAt(n - 1);
      const cur = difficultyAt(n);
      expect(cur.fallSpeed).toBeGreaterThan(prev.fallSpeed);
      expect(cur.driftSpeed).toBeGreaterThan(prev.driftSpeed);
      expect(cur.gapWidth).toBeLessThan(prev.gapWidth);
      expect(cur.spacing).toBeLessThan(prev.spacing);
    }
  });

  it('stays inside the declared endpoints everywhere', () => {
    for (let n = 0; n <= 40; n++) {
      const d = difficultyAt(n);
      expect(d.fallSpeed).toBeGreaterThanOrEqual(EASY.fallSpeed);
      expect(d.fallSpeed).toBeLessThanOrEqual(HARD.fallSpeed);
      expect(d.gapWidth).toBeLessThanOrEqual(EASY.gapWidth);
      expect(d.gapWidth).toBeGreaterThanOrEqual(HARD.gapWidth);
    }
  });
});
