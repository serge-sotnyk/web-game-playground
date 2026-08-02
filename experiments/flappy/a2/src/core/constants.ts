export const WORLD_W = 540;
export const MIN_VIEW_W = 540;
export const MIN_VIEW_H = 900;
export const R_VIS = 18;
export const R_HIT = 12;
export const WALL_R = 18;
export const BAND_H = 26;
export const INSET = 3;
export const GAP_EDGE_MARGIN = 26;
export const LOOKAHEAD = 840;
export const RAMP_BARRIERS = 15;
export const DT = 1 / 120;
export const DYING_TIME = 0.45;
export const MAX_FRAME_DT = 0.1;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function anchorForView(viewH: number): number {
  return clamp(viewH - LOOKAHEAD, 240, 480);
}
