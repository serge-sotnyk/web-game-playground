import { describe, expect, it } from 'vitest';
import { appendBarrier, firstBarrier } from '../src/core/barriers';
import { circleHitsRect } from '../src/core/collision';
import {
  BAND_H,
  DT,
  GAP_EDGE_MARGIN,
  INSET,
  R_HIT,
  WALL_R,
  WORLD_W,
  clamp,
} from '../src/core/constants';
import { difficultyAt } from '../src/core/difficulty';
import { GameState } from '../src/core/gameState';
import { mulberry32 } from '../src/core/rng';
import { computeViewportDimensions } from '../src/platform/viewportMath';

describe('responsive viewport math', () => {
  it('matches the 360x800 DPR 2 test floor without CSS upscaling', () => {
    const view = computeViewportDimensions(360, 800, 2);
    expect(view).toMatchObject({
      cssW: 360,
      cssH: 800,
      dpr: 2,
      gameW: 720,
      gameH: 1600,
      viewW: 540,
      viewH: 1200,
      isLandscape: false,
    });
    expect(view.k).toBeCloseTo(4 / 3);
  });

  it('caps a flagship viewport at DPR 3 and identifies landscape', () => {
    const portrait = computeViewportDimensions(480, 1067, 4);
    expect(portrait.dpr).toBe(3);
    expect(portrait.gameW).toBe(1440);
    expect(portrait.gameH).toBe(3201);
    expect(portrait.viewW).toBe(540);
    expect(portrait.viewH).toBeCloseTo(1200.375);
    expect(computeViewportDimensions(800, 360, 2).isLandscape).toBe(true);
  });
});

describe('mulberry32', () => {
  it('is deterministic and remains in [0, 1)', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

describe('difficultyAt', () => {
  it('matches its exact endpoints and clamps outside the ramp', () => {
    expect(difficultyAt(0)).toEqual({
      fallSpeed: 320,
      driftSpeed: 300,
      gapWidth: 230,
      spacing: 420,
    });
    expect(difficultyAt(15)).toEqual({
      fallSpeed: 460,
      driftSpeed: 360,
      gapWidth: 150,
      spacing: 380,
    });
    expect(difficultyAt(-100)).toEqual(difficultyAt(0));
    expect(difficultyAt(100)).toEqual(difficultyAt(15));
  });

  it('changes every parameter monotonically', () => {
    const values = Array.from({ length: 16 }, (_, index) => difficultyAt(index));
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index].fallSpeed).toBeGreaterThanOrEqual(values[index - 1].fallSpeed);
      expect(values[index].driftSpeed).toBeGreaterThanOrEqual(values[index - 1].driftSpeed);
      expect(values[index].gapWidth).toBeLessThanOrEqual(values[index - 1].gapWidth);
      expect(values[index].spacing).toBeLessThanOrEqual(values[index - 1].spacing);
    }
  });
});

describe('collision', () => {
  it('misses a rectangle from a centered gap and detects an overlapping corner', () => {
    expect(circleHitsRect(270, 100, R_HIT, INSET, 90, 150, 20)).toBe(false);
    expect(circleHitsRect(160, 100, R_HIT, INSET, 90, 150, 20)).toBe(true);
  });

  it('applies the three-unit inset on every rectangle edge', () => {
    const gapL = 200;
    const by = 100;
    const insetRect = {
      x: INSET,
      y: by + INSET,
      width: gapL - INSET * 2,
      height: BAND_H - INSET * 2,
    };
    expect(insetRect.width).toBe(194);
    expect(insetRect.height).toBe(20);
    expect(
      circleHitsRect(211.5, by + BAND_H / 2, R_HIT, insetRect.x, insetRect.y, insetRect.width, insetRect.height),
    ).toBe(false);
    expect(
      circleHitsRect(208, by + BAND_H / 2, R_HIT, insetRect.x, insetRect.y, insetRect.width, insetRect.height),
    ).toBe(true);
  });
});

describe('barrier generation', () => {
  it('keeps 200 barriers within the shaft and within the reachability bound', () => {
    const rng = mulberry32(1234);
    let previous = firstBarrier(1200);
    let direction: -1 | 1 = 1;
    for (let index = 1; index <= 200; index += 1) {
      const next = appendBarrier(previous, rng, direction);
      const difficulty = difficultyAt(index);
      const center = (next.barrier.gapL + next.barrier.gapR) / 2;
      const previousCenter = (previous.gapL + previous.gapR) / 2;
      const maxDelta = clamp(
        (0.5 * difficulty.driftSpeed * difficulty.spacing) / difficulty.fallSpeed,
        80,
        200,
      );
      expect(next.barrier.gapL).toBeGreaterThanOrEqual(GAP_EDGE_MARGIN - 1e-8);
      expect(next.barrier.gapR).toBeLessThanOrEqual(WORLD_W - GAP_EDGE_MARGIN + 1e-8);
      expect(Math.abs(center - previousCenter)).toBeLessThanOrEqual(maxDelta + 1e-8);
      previous = next.barrier;
      direction = next.gapDrift;
    }
  });
});

describe('GameState', () => {
  it('starts without flipping, then flips, and safely bounces from a wall', () => {
    const state = new GameState({ seed: 1, viewH: 1200, best: 0 });
    const initialDirection = state.orb.dir;
    state.tap();
    expect(state.step(DT).some((event) => event.type === 'start')).toBe(true);
    expect(state.phase).toBe('playing');
    expect(state.orb.dir).toBe(initialDirection);
    state.tap();
    expect(state.step(DT).some((event) => event.type === 'flip')).toBe(true);
    expect(state.orb.dir).toBe(-initialDirection);
    state.phase = 'ready';
    state.orb.x = WALL_R - 1;
    state.orb.dir = -1;
    const events = state.step(DT);
    expect(state.orb.x).toBe(WALL_R);
    expect(state.orb.dir).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'bounce', side: 'left' }));
  });

  it('scores a safe crossing once and transitions dying to dead after 0.45 seconds', () => {
    const state = new GameState({ seed: 2, viewH: 1200, best: 0 });
    state.phase = 'playing';
    state.orb.x = WORLD_W / 2;
    state.orb.y = 112;
    state.barriers = [{ index: 0, y: 100, gapL: 0, gapR: WORLD_W, scored: false }];
    expect(state.step(DT)).toContainEqual(expect.objectContaining({ type: 'pass', score: 1 }));
    expect(state.step(DT).some((event) => event.type === 'pass')).toBe(false);

    state.orb.x = 40;
    state.orb.y = 112;
    state.barriers = [{ index: 1, y: 100, gapL: 100, gapR: 300, scored: false }];
    expect(state.step(DT).some((event) => event.type === 'death')).toBe(true);
    expect(state.phase).toBe('dying');
    let deadEvents = 0;
    for (let index = 0; index < 54; index += 1) {
      deadEvents += state.step(DT).filter((event) => event.type === 'dead').length;
    }
    expect(state.phase).toBe('dead');
    expect(deadEvents).toBe(1);
  });

  it('consumes a resume tap without flipping and resets cleanly', () => {
    const state = new GameState({ seed: 3, viewH: 1200, best: 4 });
    state.tap();
    state.step(DT);
    const direction = state.orb.dir;
    state.requestPause();
    state.tap();
    state.requestResume();
    const events = state.step(DT);
    expect(state.phase).toBe('playing');
    expect(state.orb.dir).toBe(direction);
    expect(events.some((event) => event.type === 'flip')).toBe(false);
    state.reset(9);
    state.step(DT);
    expect(state.phase).toBe('ready');
    expect(state.score).toBe(0);
    expect(state.best).toBe(4);
    expect(state.orb.x).toBe(WORLD_W / 2 + difficultyAt(0).driftSpeed * DT);
  });

  it('is deterministic for the same seed and tap script', () => {
    const run = (): string => {
      const state = new GameState({ seed: 77, viewH: 1200, best: 0 });
      const taps = new Set([0, 25, 61, 93, 140, 201]);
      for (let step = 0; step < 260 && state.phase !== 'dead'; step += 1) {
        if (taps.has(step)) state.tap();
        state.step(DT);
      }
      return JSON.stringify({
        phase: state.phase,
        score: state.score,
        orb: state.orb,
        barriers: state.barriers,
      });
    };
    expect(run()).toBe(run());
  });
});
