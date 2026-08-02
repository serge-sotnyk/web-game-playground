/**
 * localStorage access. Every call is wrapped: private-mode browsers throw on
 * write and some throw on read. On any failure we return the default and never
 * log — a silent console is part of "done".
 */

const KEY_BEST = 'neonfall.best';
const KEY_MUTED = 'neonfall.muted';

export function loadBest(): number {
  try {
    const raw = window.localStorage.getItem(KEY_BEST);
    if (raw === null) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.floor(n));
  } catch {
    return 0;
  }
}

export function saveBest(n: number): void {
  try {
    if (!Number.isFinite(n)) return;
    window.localStorage.setItem(KEY_BEST, String(Math.max(0, Math.floor(n))));
  } catch {
    /* storage denied — the run still plays, the score just does not persist */
  }
}

export function loadMuted(): boolean {
  try {
    return window.localStorage.getItem(KEY_MUTED) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(KEY_MUTED, muted ? '1' : '0');
  } catch {
    /* ignored, see above */
  }
}
