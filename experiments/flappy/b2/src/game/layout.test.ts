import { describe, expect, it } from 'vitest';
import { calculateLayout, remapRun } from './layout';
import { createRun } from './simulation';

const zeroSafe = { top: 0, right: 0, bottom: 0, left: 0 };

describe('responsive layout', () => {
  it('matches the 360 x 800 tuning baseline', () => {
    const layout = calculateLayout(360, 800, zeroSafe);
    expect(layout.U).toBe(1);
    expect(layout.playTop).toBe(56);
    expect(layout.playBottom).toBe(752);
    expect(layout.playerX).toBeCloseTo(97.2);
  });

  it('accounts for safe areas on a larger high-DPR viewport', () => {
    const layout = calculateLayout(412, 915, { top: 24, right: 0, bottom: 16, left: 0 });
    expect(layout.U).toBeCloseTo(1.14375);
    expect(layout.playTop).toBeCloseTo(78.9);
    expect(layout.playBottom).toBeCloseTo(860.1);
    expect(layout.playerX).toBeCloseTo(111.24);
  });

  it('remaps active positions proportionally and scales velocity', () => {
    const oldLayout = calculateLayout(360, 800, zeroSafe);
    const nextLayout = calculateLayout(412, 915, { top: 24, right: 0, bottom: 16, left: 0 });
    const { run } = createRun(oldLayout, 1);
    run.player.y = oldLayout.playTop + (oldLayout.playBottom - oldLayout.playTop) * 0.25;
    run.player.previousY = run.player.y;
    run.player.velocityY = 100;
    run.gates[0]!.x = oldLayout.width * 0.8;
    run.gates[0]!.baseCenter = run.player.y;

    const remapped = remapRun(run, nextLayout);
    const normalizedY =
      (remapped.player.y - nextLayout.playTop) / (nextLayout.playBottom - nextLayout.playTop);
    expect(normalizedY).toBeCloseTo(0.25);
    expect(remapped.gates[0]!.x / nextLayout.width).toBeCloseTo(0.8);
    expect(remapped.player.velocityY).toBeCloseTo(100 * (nextLayout.U / oldLayout.U));
  });
});
