import { describe, expect, it } from 'vitest';
import { FIXED_STEP, GATE_SPACING, TAU } from './constants';
import { calculateLayout } from './layout';
import {
  advanceSimulationFrame,
  consumeQueuedFlip,
  createRun,
  driftAmplitudeForScore,
  gapHeightForScore,
  gateCenterAt,
  requestFlip,
  spawnIntervalForScore,
  speedForScore,
  stepSimulation,
} from './simulation';

const layout = calculateLayout(360, 800, { top: 0, right: 0, bottom: 0, left: 0 });

describe('player motion', () => {
  it('applies the first upward impulse, reverses next, and debounces input', () => {
    const { run } = createRun(layout, 7);
    expect(requestFlip(run, 100)).toBe(true);
    expect(requestFlip(run, 110)).toBe(false);
    expect(consumeQueuedFlip(run)).toEqual({ type: 'FLIPPED', direction: -1 });
    expect(run.player.velocityY).toBe(-330);
    expect(run.player.direction).toBe(-1);
    expect(requestFlip(run, 169)).toBe(false);
    expect(requestFlip(run, 170)).toBe(true);
    expect(consumeQueuedFlip(run)).toEqual({ type: 'FLIPPED', direction: 1 });
    expect(run.player.velocityY).toBe(0);
  });

  it('never exceeds the vertical speed clamp', () => {
    const { run } = createRun(layout, 9);
    for (let index = 0; index < 300; index += 1) stepSimulation(run);
    expect(Math.abs(run.player.velocityY)).toBeLessThanOrEqual(420);
  });

  it('is fixed-step equivalent at 30, 60, and 120 Hz', () => {
    const drive = (hz: number) => {
      const { run } = createRun(layout, 11);
      requestFlip(run, 0);
      let accumulator = 0;
      for (let frame = 0; frame < hz / 5; frame += 1) {
        accumulator = advanceSimulationFrame(run, accumulator, 1 / hz).accumulator;
      }
      return run;
    };
    const at30 = drive(30);
    const at60 = drive(60);
    const at120 = drive(120);
    expect(at30.player.y).toBeCloseTo(at60.player.y, 8);
    expect(at60.player.y).toBeCloseTo(at120.player.y, 8);
    expect(at30.gates[0]!.x).toBeCloseTo(at120.gates[0]!.x, 8);
  });
});

describe('difficulty and gate generation', () => {
  it('matches gap, speed, and interval endpoints', () => {
    expect(gapHeightForScore(0)).toBe(184);
    expect(gapHeightForScore(24)).toBe(146);
    expect(gapHeightForScore(999)).toBe(146);
    expect(speedForScore(0)).toBe(132);
    expect(speedForScore(24)).toBe(170);
    expect(speedForScore(999)).toBe(170);
    expect(spawnIntervalForScore(0)).toBeCloseTo(205 / 132);
    expect(spawnIntervalForScore(24)).toBeCloseTo(205 / 170);
  });

  it('uses deterministic RNG and exact center spacing', () => {
    const spawnSecond = (seed: number) => {
      const { run } = createRun(layout, seed);
      run.score = 6;
      run.gates[0]!.x = layout.width + 72 - GATE_SPACING;
      run.gates[0]!.previousX = run.gates[0]!.x;
      stepSimulation(run, 0);
      return run;
    };
    const first = spawnSecond(1234);
    const second = spawnSecond(1234);
    expect(first.gates[1]!.baseCenter).toBe(second.gates[1]!.baseCenter);
    expect(first.gates[1]!.phase).toBe(second.gates[1]!.phase);
    expect(first.gates[1]!.x - first.gates[0]!.x).toBeCloseTo(GATE_SPACING);
    expect(Math.abs(first.gates[1]!.baseCenter - first.gates[0]!.baseCenter)).toBeGreaterThanOrEqual(36);

    const gate = first.gates[1]!;
    expect(gate.amplitude).toBe(driftAmplitudeForScore(6));
    const lower = layout.playTop + gate.gapHeight / 2 + 24 + gate.amplitude;
    const upper = layout.playBottom - gate.gapHeight / 2 - 24 - gate.amplitude;
    for (let sample = 0; sample <= 40; sample += 1) {
      const center = gateCenterAt(gate, (sample / 40) * (TAU / TAU) * 3.4);
      expect(center - gate.gapHeight / 2 - 24).toBeGreaterThanOrEqual(layout.playTop - 1e-9);
      expect(center + gate.gapHeight / 2 + 24).toBeLessThanOrEqual(layout.playBottom + 1e-9);
      expect(center).toBeGreaterThanOrEqual(lower - gate.amplitude - 1e-9);
      expect(center).toBeLessThanOrEqual(upper + gate.amplitude + 1e-9);
    }
  });

  it('scores a gate exactly once', () => {
    const { run } = createRun(layout, 5);
    const gate = run.gates[0]!;
    gate.x = layout.playerX - 29.01;
    gate.previousX = gate.x;
    gate.baseCenter = run.player.y;
    const firstEvents = stepSimulation(run, 0);
    const secondEvents = stepSimulation(run, 0);
    expect(firstEvents.filter((event) => event.type === 'SCORED')).toHaveLength(1);
    expect(secondEvents.filter((event) => event.type === 'SCORED')).toHaveLength(0);
    expect(run.score).toBe(1);
  });

  it('uses 120 Hz as its exported fixed step', () => {
    expect(FIXED_STEP).toBeCloseTo(1 / 120);
  });
});
