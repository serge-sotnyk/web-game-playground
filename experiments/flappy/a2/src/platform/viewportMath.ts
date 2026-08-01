import { MIN_VIEW_H, MIN_VIEW_W } from '../core/constants';

export interface ViewportDimensions {
  cssW: number;
  cssH: number;
  dpr: number;
  gameW: number;
  gameH: number;
  k: number;
  viewW: number;
  viewH: number;
  isLandscape: boolean;
}

export function computeViewportDimensions(
  rawCssW: number,
  rawCssH: number,
  rawDpr: number,
): ViewportDimensions {
  const cssW = Math.max(1, Math.round(rawCssW));
  const cssH = Math.max(1, Math.round(rawCssH));
  const dpr = Math.min(rawDpr || 1, 3);
  const gameW = Math.round(cssW * dpr);
  const gameH = Math.round(cssH * dpr);
  const k = Math.min(gameW / MIN_VIEW_W, gameH / MIN_VIEW_H);
  return {
    cssW,
    cssH,
    dpr,
    gameW,
    gameH,
    k,
    viewW: gameW / k,
    viewH: gameH / k,
    isLandscape: cssW > cssH,
  };
}
