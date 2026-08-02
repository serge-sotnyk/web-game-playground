import { describe, expect, it } from 'vitest';
import { DT } from '../src/core/constants';
import { GameState } from '../src/core/gameState';

const VIEW_H = 1200;

/** Replays a fixed tap timeline (step indices) and reports the outcome. */
function play(seed: number, tapsAt: number[], steps: number) {
  const s = new GameState({ seed, viewH: VIEW_H, best: 0 });
  const taps = new Set(tapsAt);
  const trace: number[] = [];
  let maxY = 0;
  let deaths = 0;
  for (let i = 0; i < steps; i++) {
    if (taps.has(i)) s.tap();
    for (const ev of s.step(DT)) if (ev.type === 'death') deaths++;
    maxY = Math.max(maxY, s.orb.y);
    trace.push(s.orb.x, s.orb.y);
  }
  return {
    score: s.score,
    best: s.best,
    phase: s.phase,
    x: s.orb.x,
    y: s.orb.y,
    maxY,
    deaths,
    trace,
  };
}

const SCRIPT = [0, 44, 130, 210, 260, 390, 470, 540, 700, 880, 950, 1100];

describe('determinism', () => {
  it('same seed and same taps produce an identical run', () => {
    const a = play(0x5eed, SCRIPT, 2400);
    const b = play(0x5eed, SCRIPT, 2400);
    expect(b.score).toBe(a.score);
    expect(b.best).toBe(a.best);
    expect(b.phase).toBe(a.phase);
    expect(b.x).toBe(a.x);
    expect(b.y).toBe(a.y);
    expect(b.trace).toEqual(a.trace);
  });

  it('a different seed produces a different run', () => {
    const a = play(0x5eed, SCRIPT, 2400);
    const b = play(0x5eee, SCRIPT, 2400);
    expect(b.trace).not.toEqual(a.trace);
  });

  it('a different tap timeline produces a different run', () => {
    const a = play(0x5eed, SCRIPT, 2400);
    const b = play(0x5eed, [...SCRIPT.slice(0, -1), 1101], 2400);
    expect(b.trace).not.toEqual(a.trace);
  });

  // Without this the tests above could pass on a simulation that never moves.
  // The script is long enough to die and restart, so it also pins down that a
  // restart is reproducible — the derived seed included.
  it('covers a real run, a death and a restart', () => {
    const a = play(0x5eed, SCRIPT, 2400);
    expect(a.maxY).toBeGreaterThan(1000);
    expect(a.deaths).toBeGreaterThan(0);
    expect(a.best).toBeGreaterThan(0);
  });
});
