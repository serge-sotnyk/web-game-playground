import { SFX_FLIP, SFX_HIT, SFX_SCORE } from './constants'

interface Cue {
  readonly type: OscillatorType
  readonly from: number
  readonly to: number
  readonly ms: number
  readonly gain: number
}

type AudioContextCtor = new () => AudioContext

function audioContextCtor(): AudioContextCtor | null {
  const scope = globalThis as typeof globalThis & {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/**
 * Creating or resuming an AudioContext without user activation leaves it
 * suspended *and* makes the browser log an autoplay warning.
 *
 * The subtlety: a touch does not grant activation on `touchstart` or
 * `pointerdown` — it grants it on the touch *end*. So "we are inside a pointer
 * handler" is not the same as "we are allowed to start audio", and only this
 * check can tell the difference. Browsers without the API get the benefit of
 * the doubt.
 */
function hasUserActivation(): boolean {
  const activation = (
    globalThis as typeof globalThis & {
      navigator?: { userActivation?: { isActive: boolean } }
    }
  ).navigator?.userActivation
  return activation ? activation.isActive : true
}

/**
 * Three procedural cues, no asset files, no autoplay.
 *
 * The AudioContext is not created until the first user gesture, and every
 * failure path here is silent: a browser that refuses audio should cost the
 * player nothing but sound.
 */
export class AudioService {
  private ctx: AudioContext | null = null
  private muted = false
  private unavailable = false

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  isMuted(): boolean {
    return this.muted
  }

  /**
   * Call from every user gesture. Safe to call repeatedly, and a no-op until
   * the browser is actually willing to start audio.
   */
  unlock(): void {
    if (this.unavailable) return
    if (this.ctx?.state === 'running') return
    if (!hasUserActivation()) return

    if (!this.ctx) {
      const Ctor = audioContextCtor()
      if (!Ctor) {
        this.unavailable = true
        return
      }
      try {
        this.ctx = new Ctor()
      } catch {
        this.unavailable = true
        return
      }
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined)
    }
  }

  flip(): void {
    this.play(SFX_FLIP)
  }

  score(): void {
    this.play(SFX_SCORE)
  }

  hit(): void {
    this.play(SFX_HIT)
  }

  dispose(): void {
    const ctx = this.ctx
    this.ctx = null
    if (!ctx) return
    void ctx.close().catch(() => undefined)
  }

  /**
   * One oscillator, one gain, an exponential pitch sweep and short ramps at
   * both ends so nothing clicks. Nodes disconnect themselves when they finish.
   */
  private play(cue: Cue): void {
    const ctx = this.ctx
    if (!ctx || this.muted || ctx.state !== 'running') return

    try {
      const now = ctx.currentTime
      const duration = cue.ms / 1000
      const attack = Math.min(0.008, duration * 0.3)

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = cue.type
      osc.frequency.setValueAtTime(cue.from, now)
      osc.frequency.exponentialRampToValueAtTime(Math.max(cue.to, 1), now + duration)

      // Exponential ramps cannot touch zero, hence the epsilon floor.
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(cue.gain, now + attack)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.onended = () => {
        try {
          osc.disconnect()
          gain.disconnect()
        } catch {
          // Already torn down.
        }
      }

      osc.start(now)
      osc.stop(now + duration + 0.02)
    } catch {
      // A cue that will not play is not worth a console error.
    }
  }
}
