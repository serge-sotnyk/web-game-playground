import { MIN_VIEW_H, MIN_VIEW_W } from '../core/constants';

/**
 * The only module that reads window dimensions. It owns DPR handling, the
 * world-to-screen scale factor, the safe-area insets and the resize plumbing.
 */
export interface ViewportState {
  /** CSS pixels reported by the browser. */
  cssW: number;
  cssH: number;
  /** Device pixel ratio, capped at 3 to bound fill rate. */
  dpr: number;
  /** Canvas backing-store size, one canvas pixel per device pixel. */
  gameW: number;
  gameH: number;
  /** Canvas pixels per world unit — the camera zoom. */
  k: number;
  /** Visible world box. viewW >= 540, viewH >= 900. */
  viewW: number;
  viewH: number;
  safeTopUnits: number;
  safeBottomUnits: number;
  isLandscape: boolean;
}

/** Just enough of Phaser.Game for this module; importing Phaser here is not needed. */
interface ScaleHost {
  scale: {
    zoom: number;
    resize(width: number, height: number): unknown;
    setZoom?(value: number): unknown;
    refresh?(): unknown;
  };
}

const DEBOUNCE_MS = 150;
const MAX_DPR = 3;

let state: ViewportState = measure();
let host: ScaleHost | null = null;
let timer: number | undefined;
const listeners = new Set<(v: ViewportState) => void>();

function measure(): ViewportState {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const cssW = Math.max(1, Math.round(window.innerWidth));
  const cssH = Math.max(1, Math.round(window.innerHeight));
  const gameW = Math.max(1, Math.round(cssW * dpr));
  const gameH = Math.max(1, Math.round(cssH * dpr));

  const k = Math.min(gameW / MIN_VIEW_W, gameH / MIN_VIEW_H);
  const viewW = gameW / k;
  const viewH = gameH / k;

  // CSS px -> world units. Equivalent to dpr / k.
  const unitsPerCssPx = viewW / cssW;
  const { top, bottom } = readSafeInsets();

  return {
    cssW,
    cssH,
    dpr,
    gameW,
    gameH,
    k,
    viewW,
    viewH,
    safeTopUnits: Math.max(0, top * unitsPerCssPx),
    safeBottomUnits: Math.max(0, bottom * unitsPerCssPx),
    isLandscape: cssW > cssH,
  };
}

/** Reads env(safe-area-inset-*) off the hidden probe element in index.html. */
function readSafeInsets(): { top: number; bottom: number } {
  const probe = document.getElementById('safe');
  if (!probe) return { top: 0, bottom: 0 };
  try {
    const cs = window.getComputedStyle(probe);
    const top = Number.parseFloat(cs.paddingTop);
    const bottom = Number.parseFloat(cs.paddingBottom);
    return {
      top: Number.isFinite(top) ? top : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0,
    };
  } catch {
    return { top: 0, bottom: 0 };
  }
}

export function getViewport(): ViewportState {
  return state;
}

export function onViewportChange(cb: (v: ViewportState) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Hands the Phaser game over so that later measurements can be pushed into the
 * scale manager. Also installs the DOM listeners; before this the module is
 * measurement-only, which is what the game config needs at boot.
 */
export function attachGame(game: ScaleHost): void {
  host = game;
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
}

function schedule(): void {
  if (timer !== undefined) window.clearTimeout(timer);
  timer = window.setTimeout(apply, DEBOUNCE_MS);
}

function apply(): void {
  timer = undefined;
  const next = measure();
  const changed =
    next.gameW !== state.gameW ||
    next.gameH !== state.gameH ||
    next.dpr !== state.dpr ||
    next.safeTopUnits !== state.safeTopUnits ||
    next.safeBottomUnits !== state.safeBottomUnits ||
    next.isLandscape !== state.isLandscape;
  state = next;
  if (!changed) return;

  if (host) {
    const zoom = 1 / state.dpr;
    if (host.scale.zoom !== zoom) {
      if (typeof host.scale.setZoom === 'function') {
        host.scale.setZoom(zoom);
      } else {
        host.scale.zoom = zoom;
        host.scale.refresh?.();
      }
    }
    // NONE mode: resize() is what updates the backing store *and* the canvas
    // CSS size (it divides by zoom), which is the whole crispness trick.
    host.scale.resize(state.gameW, state.gameH);
  }

  for (const cb of [...listeners]) cb(state);
}
