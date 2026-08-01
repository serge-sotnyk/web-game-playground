export type Phase = 'ready' | 'playing' | 'dying' | 'dead' | 'paused';

export interface Orb {
  x: number;
  y: number;
  dir: -1 | 1;
}

export interface Barrier {
  index: number;
  y: number;
  gapL: number;
  gapR: number;
  scored: boolean;
}

export interface DifficultyParams {
  fallSpeed: number;
  driftSpeed: number;
  gapWidth: number;
  spacing: number;
}

export type GameEvent =
  | { type: 'start' }
  | { type: 'flip'; x: number; y: number }
  | { type: 'bounce'; side: 'left' | 'right'; y: number }
  | { type: 'pass'; index: number; score: number; nearMiss: boolean }
  | {
      type: 'death';
      x: number;
      y: number;
      score: number;
      best: number;
      newBest: boolean;
    }
  | { type: 'dead' }
  | { type: 'reset' }
  | { type: 'pause' }
  | { type: 'resume' };
