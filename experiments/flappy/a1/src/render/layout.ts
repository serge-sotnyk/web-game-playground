import Phaser from 'phaser';
import { WORLD_W } from '../core/constants';
import type { ViewportState } from '../platform/viewport';
import { CSS, FONT_FAMILY } from './theme';

export interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * Canvas pixel -> UiScene world unit. UiScene's camera is centred on
 * (WORLD_W/2, viewH/2) with zoom k over a gameW x gameH viewport, so the
 * inverse of Phaser's camera transform is this one line.
 */
export function screenToUi(
  px: number,
  py: number,
  vp: ViewportState,
): { x: number; y: number } {
  return {
    x: (px - vp.gameW / 2) / vp.k + WORLD_W / 2,
    y: (py - vp.gameH / 2) / vp.k + vp.viewH / 2,
  };
}

/** 64 x 64 hit area, inside the top-right corner of the view, below the notch. */
export function muteButtonRect(vp: ViewportState): Rect {
  return {
    cx: WORLD_W / 2 + vp.viewW / 2 - 46,
    cy: vp.safeTopUnits + 46,
    w: 64,
    h: 64,
  };
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return (
    x >= r.cx - r.w / 2 &&
    x <= r.cx + r.w / 2 &&
    y >= r.cy - r.h / 2 &&
    y <= r.cy + r.h / 2
  );
}

/**
 * Text renders to a canvas texture at its nominal font size, which the camera
 * zoom then scales — blurry at k = 2.7. So the texture is authored at
 * `sizeUnits * k` device pixels and scaled back down by 1/k, leaving the object
 * exactly `sizeUnits` tall in world space and crisp at any k.
 *
 * `maxWidthUnits` shrinks it further if the string would otherwise run past the
 * shaft: font metrics vary by device, so a size that fits on one phone can
 * overflow on another. Returns the scale it settled on, which the caller needs
 * if it animates the object.
 */
export function fitText(
  text: Phaser.GameObjects.Text,
  sizeUnits: number,
  k: number,
  strokeUnits = 0,
  maxWidthUnits = 0,
  strokeColor: string = CSS.textStroke,
): number {
  text.setFontSize(Math.max(8, Math.round(sizeUnits * k)));
  if (strokeUnits > 0) text.setStroke(strokeColor, strokeUnits * k);

  let scale = 1 / k;
  if (maxWidthUnits > 0) {
    const widthUnits = text.width / k;
    if (widthUnits > maxWidthUnits) scale *= maxWidthUnits / widthUnits;
  }
  text.setScale(scale);
  return scale;
}

export function makeText(
  scene: Phaser.Scene,
  content: string,
  color: string = CSS.text,
): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, content, { fontFamily: FONT_FAMILY, color, align: 'center' })
    .setOrigin(0.5, 0.5);
}
