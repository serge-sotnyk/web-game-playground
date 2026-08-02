type Cue = 'flip' | 'score' | 'hit';

interface CueSpec {
  wave: OscillatorType;
  fromHz: number;
  toHz: number;
  duration: number;
  peak: number;
}

const CUES: Record<Cue, CueSpec> = {
  flip: { wave: 'triangle', fromHz: 520, toHz: 760, duration: 0.045, peak: 0.035 },
  score: { wave: 'sine', fromHz: 880, toHz: 1180, duration: 0.07, peak: 0.04 },
  hit: { wave: 'sawtooth', fromHz: 150, toHz: 70, duration: 0.18, peak: 0.055 },
};

export class AudioService {
  private context: AudioContext | null = null;
  private muted: boolean;

  public constructor(muted: boolean) {
    this.muted = muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public async unlock(): Promise<void> {
    try {
      if (!this.context) {
        const Context = window.AudioContext;
        this.context = new Context();
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      this.context = null;
    }
  }

  public play(cue: Cue): void {
    const context = this.context;
    if (!context || this.muted || context.state !== 'running') return;
    try {
      const spec = CUES[cue];
      const now = context.currentTime;
      const end = now + spec.duration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = spec.wave;
      oscillator.frequency.setValueAtTime(spec.fromHz, now);
      oscillator.frequency.exponentialRampToValueAtTime(spec.toHz, end);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(spec.peak, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        gain.disconnect();
      });
      oscillator.start(now);
      oscillator.stop(end + 0.002);
    } catch {
      // Web Audio is feedback only; failures intentionally remain silent.
    }
  }

  public destroy(): void {
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => undefined);
  }
}
