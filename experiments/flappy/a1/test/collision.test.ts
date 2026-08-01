import { describe, expect, it } from 'vitest';
import { circleHitsBand, circleHitsRect } from '../src/core/collision';
import { BAND_H, INSET, R_HIT, WORLD_W } from '../src/core/constants';

const BY = 1000;
const GAP_L = 200;
const GAP_R = 340;
const bandAt = (x: number, y: number) => circleHitsBand(x, y, R_HIT, BY, GAP_L, GAP_R);

describe('circleHitsRect', () => {
  it('detects a corner overlap of 1 unit', () => {
    // Circle centre 1 unit inside the rect's top-left corner along both axes.
    expect(circleHitsRect(100, 100, 10, 100 + 10 / Math.SQRT2 - 1, 100 + 10 / Math.SQRT2 - 1, 50, 50)).toBe(
      true,
    );
  });

  it('misses a corner that is just out of reach', () => {
    expect(circleHitsRect(100, 100, 10, 100 + 10, 100 + 10, 50, 50)).toBe(false);
  });

  it('treats an exact touch as a miss', () => {
    expect(circleHitsRect(0, 0, 10, 10, -5, 50, 10)).toBe(false);
  });

  it('ignores degenerate rects', () => {
    expect(circleHitsRect(0, 0, 10, -5, -5, 0, 10)).toBe(false);
    expect(circleHitsRect(0, 0, 10, -5, -5, 10, -1)).toBe(false);
  });
});

describe('circleHitsBand', () => {
  it('misses when centred in the gap', () => {
    const cx = (GAP_L + GAP_R) / 2;
    for (let y = BY - 30; y <= BY + BAND_H + 30; y += 2) {
      expect(bandAt(cx, y)).toBe(false);
    }
  });

  it('hits the solid part of both bands', () => {
    const mid = BY + BAND_H / 2;
    expect(bandAt(60, mid)).toBe(true);
    expect(bandAt(WORLD_W - 60, mid)).toBe(true);
  });

  it('plays the gap 2 * INSET wider than it looks', () => {
    const mid = BY + BAND_H / 2;
    // `overlap` is how far the mote's *visible* edge reaches into the *drawn*
    // band. Anything under INSET is forgiven.
    const leftEdgeInto = (overlap: number) => GAP_L + R_HIT - overlap;
    const rightEdgeInto = (overlap: number) => GAP_R - R_HIT + overlap;

    expect(bandAt(leftEdgeInto(INSET - 1), mid)).toBe(false);
    expect(bandAt(leftEdgeInto(INSET + 1), mid)).toBe(true);
    expect(bandAt(rightEdgeInto(INSET - 1), mid)).toBe(false);
    expect(bandAt(rightEdgeInto(INSET + 1), mid)).toBe(true);
  });

  it('plays the band 2 * INSET thinner than it looks', () => {
    const solidX = 60;
    // The collision rect starts INSET below the drawn top edge.
    expect(bandAt(solidX, BY + INSET - R_HIT - 1)).toBe(false);
    expect(bandAt(solidX, BY + INSET - R_HIT + 1)).toBe(true);
    // ...and ends INSET above the drawn bottom edge.
    expect(bandAt(solidX, BY + BAND_H - INSET + R_HIT + 1)).toBe(false);
    expect(bandAt(solidX, BY + BAND_H - INSET + R_HIT - 1)).toBe(true);
  });

  it('leaves no gap between the band and the wall', () => {
    // The mote can never get past x = WALL_R, but check the inset does not open
    // a crack the collision test would miss anyway.
    const mid = BY + BAND_H / 2;
    expect(bandAt(R_HIT, mid)).toBe(true);
    expect(bandAt(WORLD_W - R_HIT, mid)).toBe(true);
  });
});
