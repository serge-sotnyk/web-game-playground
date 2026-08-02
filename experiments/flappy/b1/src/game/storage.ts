import { MAX_BEST, STORAGE_KEY } from './constants'
import type { Settings } from './types'

export const DEFAULT_SETTINGS: Settings = { best: 0, muted: false }

/** The slice of the Storage API we use — so tests can hand us a fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * `localStorage` throws on access (not just on use) in some privacy modes, so
 * even reaching for it needs a guard.
 */
export function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** Coerce anything at all into usable settings. Never throws. */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS }
  if (typeof raw !== 'object' || raw === null) return out

  const record = raw as Record<string, unknown>

  const best = record['best']
  if (typeof best === 'number' && Number.isFinite(best) && best >= 0) {
    out.best = Math.min(Math.floor(best), MAX_BEST)
  }

  const muted = record['muted']
  if (typeof muted === 'boolean') out.muted = muted

  return out
}

export function loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS }
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_SETTINGS }
    return normalizeSettings(JSON.parse(raw) as unknown)
  } catch {
    // Corrupt JSON, blocked storage, quota — all mean "start fresh, silently".
    return { ...DEFAULT_SETTINGS }
  }
}

/** Returns whether the write actually landed. Callers may ignore it. */
export function saveSettings(
  settings: Settings,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)))
    return true
  } catch {
    return false
  }
}
