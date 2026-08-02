export const COLORS = {
  background: 0x071225,
  backgroundEnd: 0x111a38,
  cyan: 0x4debff,
  coral: 0xff6687,
  gate: 0x26346b,
  pale: 0xd9faff,
  white: 0xffffff,
  rail: 0x030817,
  shadow: '#030817',
} as const;

export const STORAGE_KEY = 'flux-flip:v1';
export const MAX_BEST = 999_999;

export const BASE_WIDTH = 360;
export const BASE_HEIGHT = 800;
export const MIN_U = 0.75;
export const MAX_U = 1.35;
export const PLAYER_X_RATIO = 0.27;
export const TOP_HUD_CLEARANCE = 48;
export const TOP_MIN = 56;
export const BOTTOM_SAFE_CLEARANCE = 28;
export const BOTTOM_MIN = 48;

export const FIXED_STEP = 1 / 120;
export const MAX_FRAME_SECONDS = 0.05;
export const MAX_STEPS_PER_FRAME = 6;

export const PLAYER_VISUAL_WIDTH = 34;
export const PLAYER_VISUAL_HEIGHT = 26;
export const SPARK_RING_RADIUS = 11;
export const SPARK_CORE_RADIUS = 7;
export const SPARK_CENTER_RADIUS = 3;
export const PLAYER_HIT_WIDTH = 22;
export const PLAYER_HIT_HEIGHT = 16;
export const PLAYER_ACCELERATION = 900;
export const FLIP_IMPULSE = 330;
export const PLAYER_MAX_SPEED = 420;
export const FLIP_DEBOUNCE_MS = 70;
export const PLAYER_MAX_ROTATION_DEG = 24;

export const GATE_VISUAL_WIDTH = 58;
export const GATE_COLLISION_WIDTH = 50;
export const GATE_GAP_START = 184;
export const GATE_GAP_MIN = 146;
export const GATE_GAP_SCORE_DELTA = 1.6;
export const GATE_SPEED_START = 132;
export const GATE_SPEED_MAX = 170;
export const GATE_SPEED_SCORE_DELTA = 1.6;
export const GATE_SPACING = 205;
export const GATE_SPAWN_MARGIN = 72;
export const GATE_REMOVE_MARGIN = 24;
export const GATE_EDGE_CLEARANCE = 24;
export const GATE_CENTER_OFFSET = 118;
export const GATE_MIN_CENTER_CHANGE = 36;
export const GATE_COLLISION_GAP_FORGIVENESS = 5;
export const GATE_OUTLINE_WIDTH = 2;
export const GATE_LIP_HEIGHT = 8;
export const DRIFT_START_SCORE = 6;
export const DRIFT_MAX = 20;
export const DRIFT_SCORE_DELTA = 1.25;
export const DRIFT_PERIOD_SECONDS = 3.4;

export const READY_ARROW_INTERVAL_MS = 700;
export const READY_BOB = 4;
export const DYING_SLOWDOWN_MS = 250;
export const DYING_DURATION_MS = 650;
export const RETRY_LOCK_MS = 350;

export const FLIP_RING_MS = 180;
export const SCORE_GROW_MS = 70;
export const SCORE_SHRINK_MS = 100;
export const SCORE_FLASH_MS = 90;
export const BURST_MS = 450;
export const SHAKE_MS = 180;
export const HIT_FLASH_MS = 80;

export const GATE_RENDER_POOL = 6;
export const PARTICLE_POOL = 48;
export const TRAIL_POOL = 16;
export const BACKGROUND_BANDS = 12;
export const BACKGROUND_DOTS = 24;
export const CIRCUIT_NODES_PER_SEGMENT = 3;
export const PARALLAX_RATE = 0.15;
export const RAIL_BAR_WIDTH = 10;
export const RAIL_INNER_LINE_WIDTH = 2;

export const TAU = Math.PI * 2;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;
