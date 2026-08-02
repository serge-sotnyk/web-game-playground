import {
  GATE_COLLISION_GAP_FORGIVENESS,
  GATE_COLLISION_WIDTH,
  PLAYER_HIT_HEIGHT,
  PLAYER_HIT_WIDTH,
} from './constants';
import type { Aabb, GateState, Layout, PlayerState } from './types';

export const intersectsInclusive = (a: Aabb, b: Aabb): boolean =>
  a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

export const playerBounds = (player: PlayerState, layout: Layout): Aabb => {
  const halfWidth = (PLAYER_HIT_WIDTH * layout.U) / 2;
  const halfHeight = (PLAYER_HIT_HEIGHT * layout.U) / 2;
  return {
    left: layout.playerX - halfWidth,
    right: layout.playerX + halfWidth,
    top: player.y - halfHeight,
    bottom: player.y + halfHeight,
  };
};

export const corridorCollision = (player: PlayerState, layout: Layout): boolean => {
  const bounds = playerBounds(player, layout);
  return bounds.top <= layout.playTop || bounds.bottom >= layout.playBottom;
};

export const gateBounds = (
  gate: GateState,
  center: number,
  layout: Layout,
): readonly [Aabb, Aabb] => {
  const halfWidth = (GATE_COLLISION_WIDTH * layout.U) / 2;
  const forgiveness = GATE_COLLISION_GAP_FORGIVENESS * layout.U;
  const gapTop = center - gate.gapHeight / 2;
  const gapBottom = center + gate.gapHeight / 2;
  return [
    {
      left: gate.x - halfWidth,
      right: gate.x + halfWidth,
      top: layout.playTop,
      bottom: gapTop - forgiveness,
    },
    {
      left: gate.x - halfWidth,
      right: gate.x + halfWidth,
      top: gapBottom + forgiveness,
      bottom: layout.playBottom,
    },
  ];
};

export const gateCollision = (
  player: PlayerState,
  gate: GateState,
  center: number,
  layout: Layout,
): boolean => {
  const playerBox = playerBounds(player, layout);
  const [top, bottom] = gateBounds(gate, center, layout);
  return intersectsInclusive(playerBox, top) || intersectsInclusive(playerBox, bottom);
};
