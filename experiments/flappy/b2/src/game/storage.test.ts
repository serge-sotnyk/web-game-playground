import { describe, expect, it } from 'vitest';
import { MAX_BEST, STORAGE_KEY } from './constants';
import { loadSettings, saveSettings, type StorageLike } from './storage';

class MemoryStorage implements StorageLike {
  public value: string | null = null;
  public failRead = false;
  public failWrite = false;

  getItem(key: string): string | null {
    expect(key).toBe(STORAGE_KEY);
    if (this.failRead) throw new Error('blocked');
    return this.value;
  }

  setItem(key: string, value: string): void {
    expect(key).toBe(STORAGE_KEY);
    if (this.failWrite) throw new Error('quota');
    this.value = value;
  }
}

describe('settings storage', () => {
  it.each([
    null,
    '{broken',
    JSON.stringify({ best: '7', muted: 'no' }),
    JSON.stringify({ best: -3, muted: false }),
  ])('normalizes missing/corrupt/wrong values: %s', (value) => {
    const storage = new MemoryStorage();
    storage.value = value;
    expect(loadSettings(storage)).toEqual({ best: 0, muted: false });
  });

  it('floors and clamps best while retaining valid mute', () => {
    const storage = new MemoryStorage();
    storage.value = JSON.stringify({ best: Number.MAX_SAFE_INTEGER, muted: true });
    expect(loadSettings(storage)).toEqual({ best: MAX_BEST, muted: true });
    storage.value = JSON.stringify({ best: 8.9, muted: false });
    expect(loadSettings(storage)).toEqual({ best: 8, muted: false });
  });

  it('stays silent and safe when storage is unavailable', () => {
    const storage = new MemoryStorage();
    storage.failRead = true;
    expect(loadSettings(storage)).toEqual({ best: 0, muted: false });
    storage.failWrite = true;
    expect(() => saveSettings({ best: 4, muted: true }, storage)).not.toThrow();
    expect(loadSettings(null)).toEqual({ best: 0, muted: false });
  });
});
