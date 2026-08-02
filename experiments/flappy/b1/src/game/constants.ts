/**
 * Every tuning value for Flux Flip.
 *
 * Values suffixed `_U` are expressed at `U = 1`, i.e. in the coordinates of the
 * 360 x 800 CSS-pixel reference viewport. Multiply them by `Layout.u` before
 * use. No other module may contain an unexplained gameplay literal.
 */

// ── Layout ────────────────────────────────────────────────────────────────────
export const REF_WIDTH = 360
export const REF_HEIGHT = 800
export const U_MIN = 0.75
export const U_MAX = 1.35
export const MAX_DPR = 4

export const PLAY_TOP_INSET_U = 48
export const PLAY_TOP_MIN_U = 56
export const PLAY_BOTTOM_INSET_U = 28
export const PLAY_BOTTOM_MIN_U = 48
export const PLAYER_X_RATIO = 0.27

// ── Fixed-step simulation ─────────────────────────────────────────────────────
export const FIXED_STEP = 1 / 120
export const MAX_FRAME_DELTA = 0.05
export const MAX_STEPS_PER_FRAME = 6

// ── Player ────────────────────────────────────────────────────────────────────
export const PLAYER_VISUAL_W_U = 34
export const PLAYER_VISUAL_H_U = 26
export const PLAYER_HIT_W_U = 22
export const PLAYER_HIT_H_U = 16
export const GRAVITY_U = 900
export const FLIP_IMPULSE_U = 330
export const MAX_VY_U = 420
export const FLIP_DEBOUNCE_MS = 70
export const MAX_TILT_RAD = (24 * Math.PI) / 180

// Spark art (radii, at U = 1).
export const SPARK_HALO_R_U = 15
export const SPARK_HALO_ALPHA = 0.12
export const SPARK_RING_R_U = 11
export const SPARK_RING_W_U = 2
export const SPARK_CORE_R_U = 7
export const SPARK_CENTER_R_U = 3

// ── Gates ─────────────────────────────────────────────────────────────────────
export const GATE_VISUAL_W_U = 58
export const GATE_HIT_W_U = 50
export const GATE_GAP_BASE_U = 184
export const GATE_GAP_MIN_U = 146
export const GATE_GAP_PER_SCORE_U = 1.6
export const GATE_SPACING_U = 205
export const GATE_SPAWN_MARGIN_U = 72
export const GATE_DESPAWN_MARGIN_U = 24
/** Minimum clearance kept between a gap edge and a rail. */
export const GATE_EDGE_MARGIN_U = 24
export const GATE_CENTER_JITTER_U = 118
export const GATE_MIN_CENTER_CHANGE_U = 36
/** Collision columns stop this far short of the visible lips (both sides). */
export const GATE_COLLISION_RELIEF_U = 5
export const GATE_OUTLINE_W_U = 2
export const GATE_LIP_H_U = 8

export const SPEED_BASE_U = 132
export const SPEED_MAX_U = 170
export const SPEED_PER_SCORE_U = 1.6

export const DRIFT_FREE_SCORE = 5
export const DRIFT_AMP_PER_SCORE_U = 1.25
export const DRIFT_AMP_MAX_U = 20
export const DRIFT_PERIOD = 3.4

// ── Rails & background ────────────────────────────────────────────────────────
export const RAIL_BAR_H_U = 10
export const RAIL_LINE_H_U = 2
export const RAIL_DASH_LEN_U = 18
export const RAIL_DASH_GAP_U = 28
export const BG_BAND_COUNT = 12
export const BG_DOT_COUNT = 24
export const BG_DOT_PARALLAX = 0.15
export const BG_DOT_SEED = 0x5eed7a11

// ── Presentation timings (ms unless noted) ────────────────────────────────────
export const READY_ARROW_PERIOD_MS = 700
export const READY_BOB_U = 4
export const READY_BOB_PERIOD_MS = 1600

export const FLIP_RING_MS = 180
export const FLIP_RING_FROM_U = 12
export const FLIP_RING_TO_U = 34
export const FLIP_PARTICLES = 6

export const SCORE_POP_UP_MS = 70
export const SCORE_POP_DOWN_MS = 100
export const SCORE_POP_SCALE = 1.18
export const GATE_LIP_FLASH_MS = 90

export const CRASH_PARTICLES = 24
export const CRASH_PARTICLE_MS = 450
export const CRASH_SHAKE_MS = 180
export const CRASH_SHAKE_U = 5
export const CRASH_FLASH_MS = 80
export const CRASH_FLASH_ALPHA = 0.18

export const REDUCED_MOTION_PARTICLE_FACTOR = 0.25

export const DYING_SCROLL_MS = 250
export const DYING_TO_RESULTS_MS = 650
export const RESULTS_LOCK_MS = 350

export const TRAIL_MOTE_COUNT = 16
export const PARTICLE_POOL = 48
export const GATE_POOL = 6

// ── Typography (px at U = 1) ──────────────────────────────────────────────────
export const FONT_STACK = 'system-ui, Roboto, "Helvetica Neue", Arial, sans-serif'
export const FONT_SCORE_U = 42
export const FONT_TITLE_U = 38
export const FONT_BODY_U = 18
export const FONT_RESULT_SCORE_U = 52
export const TEXT_SHADOW_PX = 2

// ── Colours ───────────────────────────────────────────────────────────────────
export const COLOR_BG = 0x071225
export const COLOR_BG_BAND = 0x111a38
export const COLOR_BG_DOT = 0x9fd8ff
export const COLOR_UP = 0x4debff
export const COLOR_DOWN = 0xff6687
export const COLOR_UP_CSS = '#4DEBFF'
export const COLOR_DOWN_CSS = '#FF6687'
export const COLOR_RAIL_BAR = 0x0d1a33
export const COLOR_GATE = 0x26346b
export const COLOR_GATE_OUTLINE = 0x8fa4e8
export const COLOR_WHITE = 0xffffff
export const COLOR_WHITE_CSS = '#FFFFFF'
export const COLOR_MUTED_CSS = '#9FB2D8'
export const COLOR_SHADOW_CSS = '#02060F'

// ── Audio ─────────────────────────────────────────────────────────────────────
export const SFX_FLIP = { type: 'triangle', from: 520, to: 760, ms: 45, gain: 0.035 } as const
export const SFX_SCORE = { type: 'sine', from: 880, to: 1180, ms: 70, gain: 0.04 } as const
export const SFX_HIT = { type: 'sawtooth', from: 150, to: 70, ms: 180, gain: 0.055 } as const

// ── Persistence ───────────────────────────────────────────────────────────────
export const STORAGE_KEY = 'flux-flip:v1'
export const MAX_BEST = 999999

// ── Copy ──────────────────────────────────────────────────────────────────────
export const TITLE_TEXT = 'FLUX FLIP'
export const READY_HINT = 'Tap to flip gravity'
export const PAUSED_TEXT = 'Paused · tap to continue'
export const ROTATE_TEXT = 'Rotate your phone'
export const RETRY_TEXT = 'Tap to retry'
export const NEW_BEST_TEXT = 'NEW BEST'
