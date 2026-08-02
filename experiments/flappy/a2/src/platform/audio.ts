import { loadMuted, saveMuted } from './storage';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface ToneOptions {
  freq: number;
  freqTo?: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

class AudioEngine {
  private context: AudioContext | null = null;
  private muted = loadMuted();

  unlock(): void {
    if (this.muted) return;
    try {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.context ??= new AudioContextClass();
      void this.context.resume().catch(() => undefined);
      const buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.start();
    } catch {
      // Audio must never interrupt gameplay.
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
    if (!this.muted) this.unlock();
  }

  blip(): void {
    this.tone({ freq: 660, freqTo: 880, dur: 0.06, type: 'square', gain: 0.1 });
  }

  tick(): void {
    this.tone({ freq: 300, dur: 0.05, type: 'triangle', gain: 0.07 });
  }

  ping(score: number, nearMiss: boolean): void {
    this.tone({
      freq: 520 * 2 ** (Math.min(score, 12) / 24),
      dur: 0.09,
      type: 'sine',
      gain: 0.12,
    });
    if (nearMiss) {
      this.tone({ freq: 1200, dur: 0.04, type: 'sine', gain: 0.06 });
    }
  }

  boom(): void {
    this.tone({ freq: 220, freqTo: 60, dur: 0.35, type: 'sawtooth', gain: 0.16 });
    if (this.muted || !this.context) return;
    try {
      const ctx = this.context;
      const duration = 0.1;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      source.buffer = buffer;
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      source.stop(now + duration);
    } catch {
      // Audio must never interrupt gameplay.
    }
  }

  private tone(options: ToneOptions): void {
    if (this.muted || !this.context) return;
    try {
      const ctx = this.context;
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = options.type;
      oscillator.frequency.setValueAtTime(options.freq, now);
      if (options.freqTo !== undefined) {
        oscillator.frequency.exponentialRampToValueAtTime(options.freqTo, now + options.dur);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(options.gain, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + options.dur);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + options.dur);
    } catch {
      // Audio must never interrupt gameplay.
    }
  }
}

export const audio = new AudioEngine();
