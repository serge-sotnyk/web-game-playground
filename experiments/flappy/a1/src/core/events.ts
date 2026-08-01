import type { Phase } from './types';

type Listener<T> = (payload: T) => void;

/** Messages GameScene sends to UiScene. */
export interface BusEvents {
  phase: { phase: Phase; score: number; best: number; newBest: boolean };
  pass: { score: number; nearMiss: boolean };
}

/** Tiny typed emitter. No dependency, no Phaser. */
export class Emitter<M> {
  private readonly handlers = new Map<keyof M, Set<Listener<never>>>();

  on<K extends keyof M>(key: K, fn: Listener<M[K]>): void {
    let set = this.handlers.get(key);
    if (!set) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(fn as Listener<never>);
  }

  off<K extends keyof M>(key: K, fn: Listener<M[K]>): void {
    this.handlers.get(key)?.delete(fn as Listener<never>);
  }

  emit<K extends keyof M>(key: K, payload: M[K]): void {
    const set = this.handlers.get(key);
    if (!set) return;
    // Copy, so a handler may unsubscribe itself while we iterate.
    for (const fn of [...set]) (fn as Listener<M[K]>)(payload);
  }
}

export const bus = new Emitter<BusEvents>();
