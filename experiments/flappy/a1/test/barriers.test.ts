import { describe, expect, it } from 'vitest';
import { BarrierGenerator, gapCentreBounds, maxDeltaAt } from '../src/core/barriers';
import { GAP_EDGE_MARGIN, WORLD_W } from '../src/core/constants';
import { difficultyAt } from '../src/core/difficulty';

const VIEW_H = 1200;

function generate(seed: number, count: number) {
  const gen = new BarrierGenerator(seed, VIEW_H);
  return Array.from({ length: count }, () => gen.next());
}

describe('BarrierGenerator', () => {
  it('places barrier 0 near the bottom of the ready screen, centred', () => {
    const [first] = generate(1, 1);
    expect(first!.y).toBeCloseTo(0.9 * VIEW_H, 6);
    expect((first!.gapL + first!.gapR) / 2).toBeCloseTo(WORLD_W / 2, 6);
    expect(first!.index).toBe(0);
    expect(first!.scored).toBe(false);
  });

  it('spaces barriers by difficultyAt(n).spacing', () => {
    const bs = generate(3, 30);
    for (let n = 1; n < bs.length; n++) {
      expect(bs[n]!.y - bs[n - 1]!.y).toBeCloseTo(difficultyAt(n - 1).spacing, 6);
    }
  });

  it('bakes the gap width from the barrier index', () => {
    const bs = generate(4, 30);
    for (const b of bs) {
      expect(b.gapR - b.gapL).toBeCloseTo(difficultyAt(b.index).gapWidth, 6);
    }
  });

  // This is the fairness invariant. If it breaks, the game is unwinnable
  // somewhere and no amount of skill helps.
  it.each([1, 2, 12345, 0xc0ffee, 987654321])(
    'keeps 200 barriers inside the margins and reachable (seed %i)',
    (seed) => {
      const bs = generate(seed, 200);
      for (const b of bs) {
        expect(b.gapL).toBeGreaterThanOrEqual(GAP_EDGE_MARGIN - 1e-9);
        expect(b.gapR).toBeLessThanOrEqual(WORLD_W - GAP_EDGE_MARGIN + 1e-9);
        const cx = (b.gapL + b.gapR) / 2;
        const { minCx, maxCx } = gapCentreBounds(b.index);
        expect(cx).toBeGreaterThanOrEqual(minCx - 1e-9);
        expect(cx).toBeLessThanOrEqual(maxCx + 1e-9);
      }
      for (let n = 1; n < bs.length; n++) {
        const prev = (bs[n - 1]!.gapL + bs[n - 1]!.gapR) / 2;
        const cur = (bs[n]!.gapL + bs[n]!.gapR) / 2;
        expect(Math.abs(cur - prev)).toBeLessThanOrEqual(maxDeltaAt(n) + 1e-9);
      }
    },
  );

  it('actually moves the gap around rather than sitting still', () => {
    const cs = generate(99, 60).map((b) => (b.gapL + b.gapR) / 2);
    const spread = Math.max(...cs) - Math.min(...cs);
    expect(spread).toBeGreaterThan(150);
  });

  it('is reproducible from the seed and differs between seeds', () => {
    expect(generate(42, 40)).toEqual(generate(42, 40));
    expect(generate(42, 40)).not.toEqual(generate(43, 40));
  });
});
