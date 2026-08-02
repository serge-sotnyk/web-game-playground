import {
  BASE_HEIGHT,
  BASE_WIDTH,
  BOTTOM_MIN,
  BOTTOM_SAFE_CLEARANCE,
  MAX_U,
  MIN_U,
  PLAYER_X_RATIO,
  TOP_HUD_CLEARANCE,
  TOP_MIN,
  clamp,
} from './constants';
import type { GateState, Layout, RunState, SafeInsets } from './types';

export const calculateLayout = (
  width: number,
  height: number,
  safe: SafeInsets,
): Layout => {
  const U = clamp(Math.min(width / BASE_WIDTH, height / BASE_HEIGHT), MIN_U, MAX_U);
  return {
    width,
    height,
    safe: { ...safe },
    U,
    playTop: Math.max(safe.top + TOP_HUD_CLEARANCE * U, TOP_MIN * U),
    playBottom: height - Math.max(safe.bottom + BOTTOM_SAFE_CLEARANCE * U, BOTTOM_MIN * U),
    playerX: PLAYER_X_RATIO * width,
  };
};

const remapVertical = (value: number, oldLayout: Layout, newLayout: Layout): number => {
  const oldSpan = oldLayout.playBottom - oldLayout.playTop;
  const normalized = oldSpan > 0 ? (value - oldLayout.playTop) / oldSpan : 0.5;
  return newLayout.playTop + normalized * (newLayout.playBottom - newLayout.playTop);
};

export const remapGate = (gate: GateState, oldLayout: Layout, newLayout: Layout): GateState => ({
  ...gate,
  x: (gate.x / oldLayout.width) * newLayout.width,
  previousX: (gate.previousX / oldLayout.width) * newLayout.width,
  baseCenter: remapVertical(gate.baseCenter, oldLayout, newLayout),
  previousCenter: remapVertical(gate.previousCenter, oldLayout, newLayout),
  gapHeight: gate.gapHeight * (newLayout.U / oldLayout.U),
  amplitude: gate.amplitude * (newLayout.U / oldLayout.U),
});

export const remapRun = (run: RunState, newLayout: Layout): RunState => {
  const oldLayout = run.layout;
  const scaleRatio = newLayout.U / oldLayout.U;
  return {
    ...run,
    layout: newLayout,
    player: {
      ...run.player,
      y: remapVertical(run.player.y, oldLayout, newLayout),
      previousY: remapVertical(run.player.previousY, oldLayout, newLayout),
      velocityY: run.player.velocityY * scaleRatio,
    },
    gates: run.gates.map((gate) => remapGate(gate, oldLayout, newLayout)),
  };
};
