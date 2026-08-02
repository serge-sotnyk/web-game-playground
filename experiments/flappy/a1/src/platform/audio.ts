import { loadMuted, saveMuted } from './storage';

/**
 * Procedural WebAudio. No audio files: nothing to load, works offline, nothing
 * copied from anywhere. Phaser's sound manager is bypassed entirely.
 *
 * Every entry point is wrapped so a thrown or blocked AudioContext can never
 * break the game and never writes to the console.
 */

interface ToneOpts {
  freq: number;
  freqTo?: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

type AudioContextCtor = new () => AudioContext;

let ctx: AudioContext | null = null;
let muted = loadMuted();

function ctor(): AudioContextCtor | undefined {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Called from the first pointerdown — Android Chrome will not start audio
 * otherwise. Safe to call repeatedly.
 */
export function unlock(): void {
  try {
    if (!ctx) {
      const AC = ctor();
      if (!AC) return;
      ctx = new AC();
      // A one-sample silent buffer is the classic "really start it" nudge.
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      src.connect(ctx.destination);
      src.start(0);
    }
    if (ctx.state === 'suspended') {
      // An unhandled rejection here would print to the console.
      void ctx.resume().catch(() => undefined);
    }
  } catch {
    ctx = null;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  saveMuted(value);
}

function tone(o: ToneOpts): void {
  if (muted || !ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = o.type;
    osc.frequency.setValueAtTime(o.freq, now);
    if (o.freqTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqTo), now + o.dur);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(o.gain, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + o.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + o.dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* already torn down */
      }
    };
  } catch {
    /* never let a sound take the game down */
  }
}

function noiseBurst(dur: number, peak: number): void {
  if (muted || !ctx) return;
  try {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.onended = () => {
      try {
        src.disconnect();
        gain.disconnect();
      } catch {
        /* already torn down */
      }
    };
  } catch {
    /* see above */
  }
}

/** Tap / direction flip. */
export function blip(): void {
  tone({ freq: 660, freqTo: 880, dur: 0.06, type: 'square', gain: 0.1 });
}

/** Wall bounce. */
export function tick(): void {
  tone({ freq: 300, dur: 0.05, type: 'triangle', gain: 0.07 });
}

/** Barrier passed. Pitch climbs through a run and resets with the score. */
export function ping(score: number): void {
  const freq = 520 * 2 ** (Math.min(Math.max(score, 0), 12) / 24);
  tone({ freq, dur: 0.09, type: 'sine', gain: 0.12 });
}

/** Barrier passed with a near miss. */
export function nearMiss(score: number): void {
  ping(score);
  tone({ freq: 1200, dur: 0.04, type: 'sine', gain: 0.06 });
}

/** Death. */
export function boom(): void {
  tone({ freq: 220, freqTo: 60, dur: 0.35, type: 'sawtooth', gain: 0.16 });
  noiseBurst(0.1, 0.1);
}
