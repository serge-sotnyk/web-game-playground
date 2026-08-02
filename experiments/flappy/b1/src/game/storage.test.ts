import { describe, expect, it } from 'vitest'
import { MAX_BEST, STORAGE_KEY } from './constants'
import {
  DEFAULT_SETTINGS,
  type StorageLike,
  loadSettings,
  normalizeSettings,
  saveSettings,
} from './storage'

function fakeStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value
    },
    setItem(_key: string, next: string) {
      this.value = next
    },
  }
}

const hostileStorage: StorageLike = {
  getItem() {
    throw new Error('blocked')
  },
  setItem() {
    throw new Error('quota exceeded')
  },
}

describe('normalizeSettings', () => {
  it('accepts a well-formed record', () => {
    expect(normalizeSettings({ best: 42, muted: true })).toEqual({ best: 42, muted: true })
  })

  it('falls back on non-objects', () => {
    for (const raw of [null, undefined, 7, 'nope', true, []]) {
      expect(normalizeSettings(raw)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('rejects wrong types field by field', () => {
    expect(normalizeSettings({ best: '99', muted: 'yes' })).toEqual(DEFAULT_SETTINGS)
    // A bad `muted` must not cost a good `best`.
    expect(normalizeSettings({ best: 12, muted: 1 })).toEqual({ best: 12, muted: false })
  })

  it('rejects negative, NaN and infinite bests', () => {
    expect(normalizeSettings({ best: -5 }).best).toBe(0)
    expect(normalizeSettings({ best: Number.NaN }).best).toBe(0)
    expect(normalizeSettings({ best: Number.POSITIVE_INFINITY }).best).toBe(0)
  })

  it('clamps an enormous best and floors a fractional one', () => {
    expect(normalizeSettings({ best: 1e12 }).best).toBe(MAX_BEST)
    expect(normalizeSettings({ best: 7.9 }).best).toBe(7)
  })

  it('ignores unknown keys', () => {
    expect(normalizeSettings({ best: 3, muted: true, cheat: true })).toEqual({
      best: 3,
      muted: true,
    })
  })
})

describe('loadSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults for corrupt JSON', () => {
    expect(loadSettings(fakeStorage('{not json'))).toEqual(DEFAULT_SETTINGS)
  })

  it('returns defaults when storage is unavailable', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(loadSettings(hostileStorage)).toEqual(DEFAULT_SETTINGS)
  })

  it('reads back what was written', () => {
    const store = fakeStorage()
    saveSettings({ best: 21, muted: true }, store)
    expect(loadSettings(store)).toEqual({ best: 21, muted: true })
  })

  it('does not hand out a shared default object', () => {
    const a = loadSettings(null)
    a.best = 999
    expect(loadSettings(null).best).toBe(0)
    expect(DEFAULT_SETTINGS.best).toBe(0)
  })
})

describe('saveSettings', () => {
  it('writes normalized values under the versioned key', () => {
    const store = fakeStorage()
    expect(saveSettings({ best: 1e12, muted: true }, store)).toBe(true)
    expect(JSON.parse(store.value ?? 'null')).toEqual({ best: MAX_BEST, muted: true })
    expect(STORAGE_KEY).toBe('flux-flip:v1')
  })

  it('reports failure instead of throwing', () => {
    expect(saveSettings({ best: 1, muted: false }, null)).toBe(false)
    expect(saveSettings({ best: 1, muted: false }, hostileStorage)).toBe(false)
  })
})
