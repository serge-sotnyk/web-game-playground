import { BAND_H, INSET, WORLD_W } from './constants';

/** Closest-point circle/AABB overlap test. Touching exactly does not count. */
export function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  if (rw <= 0 || rh <= 0) return false;
  const nx = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
  const ny = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/**
 * Tests the mote against one barrier's two bands. Each band rect is inset by
 * INSET on all four sides, which widens the gap by 2*INSET and thins the band
 * by 2*INSET — the forgiveness described in the plan.
 */
export function circleHitsBand(
  cx: number,
  cy: number,
  r: number,
  by: number,
  gapL: number,
  gapR: number,
): boolean {
  const ry = by + INSET;
  const rh = BAND_H - 2 * INSET;

  // Left band: x in [0, gapL].
  if (circleHitsRect(cx, cy, r, INSET, ry, gapL - 2 * INSET, rh)) return true;

  // Right band: x in [gapR, WORLD_W].
  if (circleHitsRect(cx, cy, r, gapR + INSET, ry, WORLD_W - gapR - 2 * INSET, rh))
    return true;

  return false;
}
