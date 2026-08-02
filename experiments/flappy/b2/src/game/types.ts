export type GamePhase = 'BOOT' | 'READY' | 'PLAYING' | 'PAUSED' | 'DYING' | 'RESULTS';

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Layout {
  width: number;
  height: number;
  safe: SafeInsets;
  U: number;
  playTop: number;
  playBottom: number;
  playerX: number;
}

export interface PlayerState {
  y: number;
  previousY: number;
  velocityY: number;
  direction: 1 | -1;
  pendingFlip: boolean;
  lastAcceptedFlipMs: number;
}

export interface GateState {
  id: number;
  x: number;
  previousX: number;
  age: number;
  gapHeight: number;
  baseCenter: number;
  amplitude: number;
  phase: number;
  previousCenter: number;
  scored: boolean;
}

export interface RandomSource {
  next(): number;
  getState(): number;
}

export interface RunState {
  layout: Layout;
  player: PlayerState;
  gates: GateState[];
  score: number;
  worldDistance: number;
  nextGateId: number;
  rng: RandomSource;
  crashed: boolean;
}

export type SimulationEvent =
  | { type: 'FLIPPED'; direction: 1 | -1 }
  | { type: 'GATE_SPAWNED'; gateId: number }
  | { type: 'SCORED'; gateId: number; score: number }
  | { type: 'CRASHED'; score: number };

export interface FrameAdvance {
  accumulator: number;
  interpolation: number;
  events: SimulationEvent[];
  steps: number;
}

export interface GameSession {
  phase: GamePhase;
  phaseElapsedMs: number;
  accumulator: number;
  run: RunState | null;
  landscapeBlocked: boolean;
  newBest: boolean;
}

export interface Aabb {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RenderSnapshot {
  playerY: number;
  playerVelocityY: number;
  direction: 1 | -1;
  gates: ReadonlyArray<{
    id: number;
    x: number;
    center: number;
    gapHeight: number;
  }>;
  score: number;
  worldDistance: number;
}

export interface StoredSettings {
  best: number;
  muted: boolean;
}
