const BEST_KEY = 'neonfall.best';
const MUTED_KEY = 'neonfall.muted';

export function loadBest(): number {
  try {
    const value = Number.parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

export function saveBest(best: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(Math.max(0, Math.floor(best))));
  } catch {
    // Persistence is optional when storage is blocked.
  }
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, String(muted));
  } catch {
    // Persistence is optional when storage is blocked.
  }
}
