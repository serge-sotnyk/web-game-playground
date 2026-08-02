/**
 * Seedable RNG. The simulation never touches `Math.random`, so a run replays
 * exactly from its seed — which is what makes the gate tests meaningful.
 */

/** mulberry32: 32-bit state, good distribution, three lines. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform in `[min, max)`. */
export function rangeFloat(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Uniform in `[-magnitude, +magnitude)`. */
export function symmetric(rng: () => number, magnitude: number): number {
  return rangeFloat(rng, -magnitude, magnitude)
}

/**
 * Seed for a fresh run. `runCounter` keeps successive runs in one session
 * distinct even when `Date.now()` has not ticked between them.
 */
export function runSeed(nowMs: number, runCounter: number): number {
  return (nowMs ^ Math.imul(runCounter, 0x9e3779b9)) >>> 0
}
