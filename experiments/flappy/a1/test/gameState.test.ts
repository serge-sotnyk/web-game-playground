import { describe, expect, it } from 'vitest';
import {
  BAND_H,
  DT,
  DYING_TIME,
  WALL_R,
  WORLD_W,
} from '../src/core/constants';
import { GameState, anchorUnitsFor } from '../src/core/gameState';
import type { GameEvent, Phase } from '../src/core/types';

const VIEW_H = 1200;

function fresh(seed = 1, best = 0): GameState {
  return new GameState({ seed, viewH: VIEW_H, best });
}

/** Runs `steps` fixed steps, collecting every event. */
function run(s: GameState, steps: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < steps; i++) out.push(...s.step(DT));
  return out;
}

/** Runs until `pred` holds or the budget is spent. Returns the events seen. */
function runUntil(
  s: GameState,
  pred: (s: GameState) => boolean,
  budget = 20000,
): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < budget && !pred(s); i++) out.push(...s.step(DT));
  return out;
}

describe('GameState — start', () => {
  it('starts ready, centred, with the camera at zero', () => {
    const s = fresh();
    expect(s.phase).toBe('ready');
    expect(s.score).toBe(0);
    expect(s.orb.x).toBe(WORLD_W / 2);
    expect(s.orb.y).toBe(anchorUnitsFor(VIEW_H));
    expect(s.cameraTopY).toBe(0);
    expect(s.orb.dir).toBe(1);
  });

  it('drifts but does not fall while ready', () => {
    const s = fresh();
    const y0 = s.orb.y;
    run(s, 60);
    expect(s.orb.y).toBe(y0);
    expect(s.orb.x).toBeGreaterThan(WORLD_W / 2);
  });

  it('goes ready -> playing on a tap, without reversing the drift', () => {
    const s = fresh();
    const dir = s.orb.dir;
    s.tap();
    const events = run(s, 1);
    expect(s.phase).toBe('playing');
    expect(s.orb.dir).toBe(dir);
    expect(events.map((e) => e.type)).toContain('start');
    expect(events.map((e) => e.type)).not.toContain('flip');
  });

  it('falls once playing', () => {
    const s = fresh();
    s.tap();
    const y0 = s.orb.y;
    run(s, 60);
    expect(s.orb.y).toBeGreaterThan(y0);
  });
});

describe('GameState — input', () => {
  it('consumes at most one tap per step, so a double tap is a no-op', () => {
    const s = fresh();
    s.tap();
    run(s, 1); // start
    const dir = s.orb.dir;
    s.tap();
    s.tap();
    const a = run(s, 1);
    expect(s.orb.dir).toBe(-dir);
    expect(a.filter((e) => e.type === 'flip')).toHaveLength(1);
    const b = run(s, 1);
    expect(s.orb.dir).toBe(dir);
    expect(b.filter((e) => e.type === 'flip')).toHaveLength(1);
  });
});

describe('GameState — walls', () => {
  it('bounces off the left and right walls without dying', () => {
    const s = fresh();
    s.tap();
    run(s, 1);

    const events = runUntil(s, (g) => g.orb.x >= WORLD_W - WALL_R - 1e-9, 2000);
    const bounces = events.filter((e) => e.type === 'bounce');
    expect(bounces.length).toBeGreaterThan(0);
    expect(bounces[0]).toMatchObject({ type: 'bounce', side: 'right' });
    expect(s.orb.dir).toBe(-1);
    expect(s.orb.x).toBeLessThanOrEqual(WORLD_W - WALL_R);
    expect(s.phase).not.toBe('dying');
  });

  it('never lets the mote leave the shaft', () => {
    const s = fresh(7);
    s.tap();
    for (let i = 0; i < 5000; i++) {
      s.step(DT);
      expect(s.orb.x).toBeGreaterThanOrEqual(WALL_R - 1e-9);
      expect(s.orb.x).toBeLessThanOrEqual(WORLD_W - WALL_R + 1e-9);
      if (s.phase !== 'playing') break;
    }
  });
});

describe('GameState — scoring', () => {
  it('scores each barrier exactly once, in order', () => {
    const s = fresh(11);
    s.tap();
    const events = runUntil(s, (g) => g.phase !== 'playing' && g.phase !== 'ready');
    const passes = events.filter((e) => e.type === 'pass');
    const indices = passes.map((e) => (e as { index: number }).index);
    expect(new Set(indices).size).toBe(indices.length);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBe(indices[i - 1]! + 1);
    }
    expect(passes.map((e) => (e as { score: number }).score)).toEqual(
      indices.map((_, i) => i + 1),
    );
  });

  it('scores the barrier whose midline the mote crossed', () => {
    const s = fresh(11);
    s.tap();
    const before = s.barriers[0]!;
    runUntil(s, (g) => g.score > 0 || g.phase === 'dying');
    if (s.score > 0) {
      expect(s.orb.y).toBeGreaterThanOrEqual(before.y + BAND_H / 2);
    }
  });
});

describe('GameState — death', () => {
  it('reaches dying, then dead after exactly DYING_TIME', () => {
    const s = fresh(11);
    s.tap();
    const deathEvents = runUntil(s, (g) => g.phase === 'dying');
    expect(s.phase).toBe('dying');
    expect(deathEvents.some((e) => e.type === 'death')).toBe(true);

    const expected = Math.round(DYING_TIME / DT);
    for (let i = 0; i < expected - 1; i++) {
      expect(s.step(DT).some((e) => e.type === 'dead')).toBe(false);
      expect(s.phase).toBe('dying');
    }
    expect(s.step(DT).some((e) => e.type === 'dead')).toBe(true);
    expect(s.phase).toBe('dead');
  });

  it('freezes the mote while dying and dead', () => {
    const s = fresh(11);
    s.tap();
    runUntil(s, (g) => g.phase === 'dying');
    const { x, y } = s.orb;
    run(s, 200);
    expect(s.phase).toBe('dead');
    expect(s.orb.x).toBe(x);
    expect(s.orb.y).toBe(y);
  });

  it('ignores taps while dying', () => {
    const s = fresh(11);
    s.tap();
    runUntil(s, (g) => g.phase === 'dying');
    s.tap();
    run(s, 10);
    expect(s.phase).toBe('dying');
  });

  it('reports and keeps a new best', () => {
    const s = fresh(11, 0);
    s.tap();
    const events = runUntil(s, (g) => g.phase === 'dying');
    const death = events.find((e) => e.type === 'death') as Extract<
      GameEvent,
      { type: 'death' }
    >;
    expect(death.score).toBe(s.score);
    expect(death.newBest).toBe(s.score > 0);
    expect(s.best).toBe(Math.max(0, s.score));
  });

  it('does not report a new best when the old one stands', () => {
    const s = fresh(11, 9999);
    s.tap();
    const events = runUntil(s, (g) => g.phase === 'dying');
    const death = events.find((e) => e.type === 'death') as Extract<
      GameEvent,
      { type: 'death' }
    >;
    expect(death.newBest).toBe(false);
    expect(s.best).toBe(9999);
  });

  it('restarts from a tap while dead, into a different run', () => {
    const s = fresh(11);
    s.tap();
    runUntil(s, (g) => g.phase === 'dead');
    const oldGaps = s.barriers.map((b) => b.gapL);

    s.tap();
    const events = run(s, 1);
    expect(events.some((e) => e.type === 'reset')).toBe(true);
    expect(s.phase).toBe('ready');
    expect(s.score).toBe(0);
    expect(s.orb.x).toBe(WORLD_W / 2);
    expect(s.orb.dir).toBe(1);
    expect(s.cameraTopY).toBe(0);
    expect(s.barriers.every((b) => !b.scored)).toBe(true);
    expect(s.barriers.map((b) => b.gapL)).not.toEqual(oldGaps);
  });
});

describe('GameState — pause', () => {
  it('freezes and does not consume the resume tap as a flip', () => {
    const s = fresh();
    s.tap();
    run(s, 120);
    const { x, y, dir } = s.orb;

    s.requestPause();
    expect(s.phase).toBe('paused');
    const paused = run(s, 60);
    expect(paused.map((e) => e.type)).toContain('pause');
    expect(s.orb.x).toBe(x);
    expect(s.orb.y).toBe(y);

    s.tap(); // a stray tap arriving while paused must not be banked
    s.requestResume();
    const resumed = run(s, 1);
    expect(resumed.map((e) => e.type)).toContain('resume');
    expect(resumed.map((e) => e.type)).not.toContain('flip');
    expect(s.orb.dir).toBe(dir);
    expect(s.phase).toBe('playing');
  });

  it('pauses and resumes from ready too', () => {
    const s = fresh();
    s.requestPause();
    expect(s.phase).toBe('paused');
    s.requestResume();
    expect(s.phase).toBe('ready');
  });

  it('will not pause mid-death', () => {
    const s = fresh(11);
    s.tap();
    runUntil(s, (g) => g.phase === 'dying');
    s.requestPause();
    expect(s.phase).toBe('dying');
  });
});

describe('GameState — resize', () => {
  it('re-anchors while ready without disturbing the camera', () => {
    const s = fresh();
    s.setViewHeight(900);
    expect(s.orb.y).toBe(anchorUnitsFor(900));
    expect(s.cameraTopY).toBe(0);
  });

  it('never resets a run in progress', () => {
    const s = fresh(5);
    s.tap();
    run(s, 400);
    const { x, y } = s.orb;
    const score = s.score;
    const phase: Phase = s.phase;
    const gaps = s.barriers.map((b) => b.gapL);

    s.setViewHeight(2000);
    expect(s.phase).toBe(phase);
    expect(s.score).toBe(score);
    expect(s.orb.x).toBe(x);
    expect(s.orb.y).toBe(y);
    // Already-placed barriers do not move.
    expect(s.barriers.slice(0, gaps.length).map((b) => b.gapL)).toEqual(gaps);
  });

  it('keeps enough barriers ahead of the mote for the taller view', () => {
    const s = fresh(5);
    s.tap();
    run(s, 400);
    s.setViewHeight(2400);
    const last = s.barriers[s.barriers.length - 1]!;
    expect(last.y).toBeGreaterThanOrEqual(s.orb.y + 2400 + 400);
  });
});

describe('GameState — barrier housekeeping', () => {
  it('culls what is behind and keeps the list bounded', () => {
    const s = fresh(5);
    s.tap();
    for (let i = 0; i < 6000; i++) {
      s.step(DT);
      if (s.phase !== 'playing') {
        s.tap();
        s.step(DT);
        s.tap();
      }
      expect(s.barriers.length).toBeLessThan(20);
    }
  });
});
