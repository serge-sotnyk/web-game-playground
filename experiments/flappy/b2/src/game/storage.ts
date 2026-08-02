import { MAX_BEST, STORAGE_KEY } from './constants';
import type { StoredSettings } from './types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const defaults = (): StoredSettings => ({ best: 0, muted: false });

const browserStorage = (): StorageLike | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export const normalizeSettings = (value: unknown): StoredSettings => {
  if (typeof value !== 'object' || value === null) return defaults();
  const candidate = value as Record<string, unknown>;
  const best =
    typeof candidate.best === 'number' && Number.isFinite(candidate.best) && candidate.best >= 0
      ? Math.min(MAX_BEST, Math.floor(candidate.best))
      : 0;
  const muted = typeof candidate.muted === 'boolean' ? candidate.muted : false;
  return { best, muted };
};

export const loadSettings = (storage: StorageLike | null = browserStorage()): StoredSettings => {
  if (!storage) return defaults();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw === null ? defaults() : normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return defaults();
  }
};

export const saveSettings = (
  settings: StoredSettings,
  storage: StorageLike | null = browserStorage(),
): void => {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // Storage is optional; privacy and quota errors deliberately stay silent.
  }
};
