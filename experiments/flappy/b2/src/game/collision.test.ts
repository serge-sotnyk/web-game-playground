import { describe, expect, it } from 'vitest';
import { corridorCollision, gateCollision, intersectsInclusive, playerBounds } from './collision';
import { calculateLayout } from './layout';
import { createRun, stepSimulation } from './simulation';

const layout = calculateLayout(360, 800, { top: 0, right: 0, bottom: 0, left: 0 });

describe('collision geometry', () => {
  it('uses inclusive AABB edge contact', () => {
    const box = { left: 0, top: 0, right: 10, bottom: 10 };
    expect(intersectsInclusive(box, { left: 10, top: 2, right: 20, bottom: 8 })).toBe(true);
    expect(intersectsInclusive(box, { left: 10.001, top: 2, right: 20, bottom: 8 })).toBe(false);
  });

  it('keeps visual-only player and gate inset areas non-colliding', () => {
    const { run } = createRun(layout, 1);
    const player = playerBounds(run.player, layout);
    const visualPlayerRight = layout.playerX + 17;
    expect(player.right).toBe(layout.playerX + 11);
    expect(visualPlayerRight).toBeGreaterThan(player.right);

    const gate = run.gates[0]!;
    gate.x = layout.playerX + 17 + 25.01;
    gate.baseCenter = layout.playBottom - gate.gapHeight / 2;
    expect(gateCollision(run.player, gate, gate.baseCenter, layout)).toBe(false);
    gate.x = layout.playerX + 11 + 25;
    expect(gateCollision(run.player, gate, gate.baseCenter, layout)).toBe(true);
  });

  it('collides when the player hitbox touches a rail', () => {
    const { run } = createRun(layout, 2);
    run.player.y = layout.playTop + 8;
    expect(corridorCollision(run.player, layout)).toBe(true);
    run.player.y += 0.001;
    expect(corridorCollision(run.player, layout)).toBe(false);
  });

  it('emits only crash when collision and passing coincide', () => {
    const { run } = createRun(layout, 3);
    const gate = run.gates[0]!;
    gate.x = layout.playerX - 29.01;
    gate.previousX = gate.x;
    gate.baseCenter = layout.playBottom - gate.gapHeight / 2;
    run.player.y = layout.playTop + 20;
    run.player.previousY = run.player.y;
    const events = stepSimulation(run, 0);
    expect(events).toEqual([{ type: 'CRASHED', score: 0 }]);
    expect(run.score).toBe(0);
  });
});
