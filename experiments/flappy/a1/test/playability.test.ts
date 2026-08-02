import { describe, expect, it } from 'vitest';
import { BAND_H, DT, R_HIT, WALL_R, WORLD_W } from '../src/core/constants';
import { difficultyAt } from '../src/core/difficulty';
import { GameState } from '../src/core/gameState';

const VIEW_H = 1200;

/** Where a mote at `x` heading `dir` ends up after travelling `dist`, walls included. */
function reflect(x: number, dir: -1 | 1, dist: number): number {
  const lo = WALL_R;
  const hi = WORLD_W - WALL_R;
  const span = hi - lo;
  const period = 2 * span;
  let p = x - lo + dir * dist;
  p = ((p % period) + period) % period;
  if (p > span) p = period - p;
  return lo + p;
}

/**
 * A deliberately simple bot: each step it asks "where do I cross the next
 * barrier's midline if I hold this direction, and where if I flip now?", and
 * takes whichever lands nearer the gap centre. It is not optimal — it has no
 * multi-barrier plan — so whatever it scores is a floor on what a human can.
 */
function autoplay(seed: number, maxScore: number): number {
  const s = new GameState({ seed, viewH: VIEW_H, best: 0 });
  s.tap();

  const budget = 200000;
  for (let i = 0; i < budget; i++) {
    if (s.phase !== 'playing' && s.phase !== 'ready') break;
    if (s.score >= maxScore) break;

    const target = s.barriers.find((b) => !b.scored && b.y + BAND_H / 2 > s.orb.y);
    if (target) {
      const d = difficultyAt(s.score);
      const time = (target.y + BAND_H / 2 - s.orb.y) / d.fallSpeed;
      const dist = d.driftSpeed * time;
      const centre = (target.gapL + target.gapR) / 2;

      const keep = Math.abs(reflect(s.orb.x, s.orb.dir, dist) - centre);
      const flip = Math.abs(
        reflect(s.orb.x, s.orb.dir === 1 ? -1 : 1, dist) - centre,
      );
      // Hysteresis, so it does not thrash when both options are equally bad.
      if (flip < keep - 4) s.tap();
    }

    s.step(DT);
  }
  return s.score;
}

describe('playability', () => {
  // The tuning in the plan is only worth anything if the game is winnable at
  // the hard end. A bot with one barrier of look-ahead should cruise past the
  // ramp; if a tuning change breaks that, this is the test that notices.
  it.each([1, 2, 3, 7, 11, 12345])('is beatable well past the ramp (seed %i)', (seed) => {
    expect(autoplay(seed, 120)).toBeGreaterThanOrEqual(60);
  });

  it('leaves a sane margin at the hard end', () => {
    // The plan's own sanity check: the mote must be within this of the gap
    // centre when crossing, and it drifts this far while inside the band.
    const d = difficultyAt(999);
    const window = d.gapWidth / 2 - R_HIT;
    const crossing = (BAND_H + 2 * R_HIT) / d.fallSpeed;
    expect(window).toBeGreaterThan(60);
    expect(d.driftSpeed * crossing).toBeLessThan(window);
  });
});
