/**
 * Geometry and timing constants. World units throughout, seconds for time.
 * Nothing in `core/` may touch Phaser, the DOM, the clock or Math.random.
 */

/** Shaft width. The shaft is always exactly this wide, on every device. */
export const WORLD_W = 540;

/** Mote visual core radius. */
export const R_VIS = 18;

/** Mote collision radius — deliberately smaller than R_VIS (hitbox forgiveness). */
export const R_HIT = 12;

/** Radius used for the wall bounce, so the *visible* edge kisses the wall. */
export const WALL_R = 18;

/** Barrier band height. */
export const BAND_H = 26;

/** Barrier rects shrink by this on all four sides for collision. */
export const INSET = 3;

/** A gap edge never comes closer than this to a wall. */
export const GAP_EDGE_MARGIN = 26;

/** Visible world units below the mote. */
export const LOOKAHEAD = 840;

/** Difficulty ramp length, in barriers. */
export const RAMP_BARRIERS = 15;

/** Fixed simulation timestep. */
export const DT = 1 / 120;

/** Seconds of death animation before input reopens. */
export const DYING_TIME = 0.45;

/** Real frame delta clamp (tab-switch protection). */
export const MAX_FRAME_DT = 0.1;

/** Minimum visible world width — equal to the shaft width. */
export const MIN_VIEW_W = WORLD_W;

/** Minimum visible world height. */
export const MIN_VIEW_H = 900;

/** Clamp bounds for the mote's on-screen distance from the top of the view. */
export const ANCHOR_MIN = 240;
export const ANCHOR_MAX = 480;

/** A pass counts as a near miss when the gap-edge clearance is under this. */
export const NEAR_MISS_SLACK = 14;
