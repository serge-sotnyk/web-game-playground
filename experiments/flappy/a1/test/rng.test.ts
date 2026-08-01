import { describe, expect, it } from 'vitest';
import { deriveSeed, mulberry32 } from '../src/core/rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('diverges for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const sameCount = Array.from({ length: 50 }, () => (a() === b() ? 1 : 0)).reduce<number>(
      (x, y) => x + y,
      0,
    );
    expect(sameCount).toBe(0);
  });

  it('stays inside [0, 1)', () => {
    const r = mulberry32(0xc0ffee);
    for (let i = 0; i < 20000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const r = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r() * 10)]!++;
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 50);
  });
});

describe('deriveSeed', () => {
  it('produces a different, stable 32-bit seed', () => {
    const s = deriveSeed(12345);
    expect(s).toBe(deriveSeed(12345));
    expect(s).not.toBe(12345);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});
