import type Phaser from 'phaser';
import { WORLD_W } from '../core/constants';
import type { ViewportState } from '../platform/viewport';

export function setCrispText(
  text: Phaser.GameObjects.Text,
  designSize: number,
  k: number,
): void {
  text.setFontSize(Math.max(8, Math.round(designSize * k)));
  text.setScale(1 / k);
}

export function muteCenter(viewport: ViewportState): { x: number; y: number } {
  return {
    x: WORLD_W / 2 + viewport.viewW / 2 - 46,
    y: viewport.safeTopUnits + 46,
  };
}

export function pointHitsMute(
  x: number,
  y: number,
  viewport: ViewportState,
): boolean {
  const center = muteCenter(viewport);
  return Math.abs(x - center.x) <= 32 && Math.abs(y - center.y) <= 32;
}
