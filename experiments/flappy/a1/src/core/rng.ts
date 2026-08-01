/**
 * Deterministic PRNG. The seed is always injected from outside `core/`, so the
 * simulation never reads the clock and a run is reproducible from seed + taps.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derives the seed for the next run from the current one, so that a restart
 * does not need a clock reading inside `core/`. A classic Numerical-Recipes LCG
 * step — its only job is to move to a decorrelated seed.
 */
export function deriveSeed(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}
