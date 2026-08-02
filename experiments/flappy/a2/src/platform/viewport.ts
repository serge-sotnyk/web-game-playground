import type Phaser from 'phaser';
import { computeViewportDimensions } from './viewportMath';

export interface ViewportState {
  cssW: number;
  cssH: number;
  dpr: number;
  gameW: number;
  gameH: number;
  k: number;
  viewW: number;
  viewH: number;
  safeTopUnits: number;
  safeBottomUnits: number;
  isLandscape: boolean;
}

type ViewportListener = (viewport: ViewportState) => void;
const listeners = new Set<ViewportListener>();

function readSafeInset(property: 'paddingTop' | 'paddingBottom'): number {
  const probe = document.getElementById('safe');
  if (!probe) return 0;
  const parsed = Number.parseFloat(getComputedStyle(probe)[property]);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function measure(): ViewportState {
  const dimensions = computeViewportDimensions(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  );
  const { cssW, cssH, dpr, gameW, gameH, k, viewW, viewH, isLandscape } = dimensions;
  const unitsPerCssPixel = viewW / cssW;
  return {
    cssW,
    cssH,
    dpr,
    gameW,
    gameH,
    k,
    viewW,
    viewH,
    safeTopUnits: readSafeInset('paddingTop') * unitsPerCssPixel,
    safeBottomUnits: readSafeInset('paddingBottom') * unitsPerCssPixel,
    isLandscape,
  };
}

let current = measure();

export function getViewport(): ViewportState {
  return current;
}

export function onChange(listener: ViewportListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function bindViewport(game: Phaser.Game): () => void {
  let timeout: number | undefined;
  const schedule = (): void => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      current = measure();
      game.scale.resize(current.gameW, current.gameH);
      game.scale.setZoom(1 / current.dpr);
      listeners.forEach((listener) => listener(current));
      timeout = undefined;
    }, 150);
  };

  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  window.visualViewport?.addEventListener('resize', schedule);

  return () => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
  };
}
