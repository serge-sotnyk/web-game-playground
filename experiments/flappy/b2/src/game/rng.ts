import type { RandomSource } from './types';

export const createMulberry32 = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
    },
    getState(): number {
      return state;
    },
  };
};

export const randomRange = (rng: RandomSource, min: number, max: number): number =>
  min + (max - min) * rng.next();

export const randomSign = (rng: RandomSource): 1 | -1 => (rng.next() < 0.5 ? -1 : 1);
