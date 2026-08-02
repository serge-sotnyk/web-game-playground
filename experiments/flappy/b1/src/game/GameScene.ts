import Phaser from 'phaser'
import { Renderer, type FrameView } from './Renderer'
import { AudioService } from './audio'
import { MAX_FRAME_DELTA } from './constants'
import { computeLayout, isLandscape, remapRun } from './layout'
import { runSeed } from './rng'
import {
  advanceRun,
  coastGates,
  createRun,
  createStepper,
  requestFlip,
  resetStepper,
  stepAlpha,
} from './simulation'
import { StateMachine } from './stateMachine'
import { loadSettings, saveSettings } from './storage'
import type { Layout, Run, Settings, SimEvent, Stepper } from './types'
import type { Viewport } from '../viewport'

const START_KEYS = new Set([' ', 'Spacebar', 'Enter', 'ArrowUp'])
// Events that can carry user activation. `pointerdown` is listed so audio is
// ready as early as possible on mouse; on touch it is `touchend`/`pointerup`
// that actually grants it. AudioService ignores the ones that arrive too early.
const GESTURE_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'mouseup'] as const

/**
 * Phaser lifecycle, the fixed-step accumulator, input routing and the bridge
 * from simulation events to sound, effects and storage.
 *
 * The scene owns the state machine; the simulation owns run data; the renderer
 * owns pixels. Nothing here reads state back out of the display list.
 */
export class GameScene extends Phaser.Scene {
  private readonly machine = new StateMachine()
  private activeRun: Run | null = null
  private layoutInfo!: Layout
  private readonly stepper: Stepper = createStepper()
  private saved: Settings = { best: 0, muted: false }

  private art!: Renderer
  private readonly audioSvc = new AudioService()

  private readonly simEvents: SimEvent[] = []
  private runCounter = 0
  private newBest = false
  private dpr = 1
  private reducedMotion = false

  private soundButton: HTMLButtonElement | null = null
  private statusEl: HTMLElement | null = null

  constructor(private readonly viewport: Viewport) {
    super('flux-flip')
  }

  // ── BOOT ────────────────────────────────────────────────────────────────────

  // `create` is not declared on Phaser's Scene type, so no `override` here.
  create(): void {
    const snap = this.viewport.read()

    this.dpr = snap.dpr
    this.reducedMotion = matchMediaSafe('(prefers-reduced-motion: reduce)')
    this.layoutInfo = computeLayout(snap.width, snap.height, snap.safe)
    this.machine.setLandscape(isLandscape(this.layoutInfo))

    this.saved = loadSettings()
    this.audioSvc.setMuted(this.saved.muted)

    this.art = new Renderer(this, snap.dpr, this.reducedMotion, this.layoutInfo)

    this.statusEl = document.getElementById('a11y-status')
    this.bindSoundButton()

    this.input.on('pointerdown', this.onPointerDown)
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize)
    // Phaser dispatches its pointer events from the game loop, which is no
    // longer a user-gesture context — creating the AudioContext there makes
    // Chrome log an autoplay warning. These capture-phase listeners run inside
    // the real gesture instead. All three, because which one a browser sends
    // first depends on the device.
    for (const type of GESTURE_EVENTS) {
      window.addEventListener(type, this.onGesture, { capture: true, passive: true })
    }
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('blur', this.onWindowBlur)
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown)
    this.events.once(Phaser.Scenes.Events.DESTROY, this.teardown)

    // No external assets, so BOOT completes the moment the scene is built.
    this.enterReady()
  }

  // ── Frame ───────────────────────────────────────────────────────────────────

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_DELTA)
    this.simEvents.length = 0

    const before = this.machine.state

    if (before === 'PLAYING' && this.activeRun) {
      advanceRun(this.activeRun, this.stepper, dt, this.simEvents)
    } else if (before === 'DYING' && this.activeRun) {
      // Presentation-only coast to a standstill; nothing can collide now.
      coastGates(this.activeRun, dt, this.machine.scrollFactor())
    }

    this.machine.advance(deltaMs)
    this.consumeEvents()
    this.art.update(this.buildView(dt))
  }

  private buildView(dt: number): FrameView {
    return {
      state: this.machine.state,
      run: this.activeRun,
      layout: this.layoutInfo,
      alpha: stepAlpha(this.stepper),
      score: this.activeRun?.score ?? 0,
      best: this.saved.best,
      newBest: this.newBest,
      landscape: this.machine.isBlocked,
      dt,
    }
  }

  /** Map semantic simulation events onto sound, effects and state changes. */
  private consumeEvents(): void {
    for (const event of this.simEvents) {
      switch (event.type) {
        case 'FLIPPED':
          this.art.onFlip(event.y, event.direction)
          this.audioSvc.flip()
          break
        case 'SCORED':
          this.art.onScore(event.gateId)
          this.audioSvc.score()
          break
        case 'CRASHED':
          this.onCrash(event.y)
          break
        case 'GATE_SPAWNED':
          break
      }
    }
  }

  // ── State effects ───────────────────────────────────────────────────────────

  private enterReady(): void {
    this.machine.toReady()
    this.activeRun = null
    this.newBest = false
    resetStepper(this.stepper)
    this.art.onRunStart()
    this.announce('Ready. Tap to flip gravity.')
  }

  /** Starts a run *and* consumes the same tap as its first flip. */
  private startRun(): void {
    this.runCounter += 1
    this.activeRun = createRun(this.layoutInfo, runSeed(Date.now(), this.runCounter))
    resetStepper(this.stepper)
    this.newBest = false
    this.art.onRunStart()
    requestFlip(this.activeRun, performance.now())
    this.announce('Playing.')
  }

  private onCrash(y: number): void {
    if (!this.machine.crash()) return

    // The best score is banked at the moment of impact, not at the results
    // screen — a tab closed mid-death still keeps the score.
    const score = this.activeRun?.score ?? 0
    if (score > this.saved.best) {
      this.saved = { ...this.saved, best: score }
      this.newBest = true
      saveSettings(this.saved)
    }

    this.art.onCrash(y)
    this.audioSvc.hit()
    this.announce(`Game over. Score ${score}. Best ${this.saved.best}.`)
  }

  private pause(): void {
    if (!this.machine.pause()) return
    resetStepper(this.stepper)
    this.announce('Paused. Tap to continue.')
  }

  // ── Input ───────────────────────────────────────────────────────────────────

  /** Every accepted tap and key lands here; the machine decides what it means. */
  private handleTap(): void {
    switch (this.machine.tap()) {
      case 'START_RUN':
        this.startRun()
        break
      case 'FLIP':
        if (this.activeRun) requestFlip(this.activeRun, performance.now())
        break
      case 'RESUME':
        resetStepper(this.stepper)
        this.announce('Playing.')
        break
      case 'IGNORE':
        break
    }
  }

  /** Runs synchronously inside a real user gesture; audio needs that. */
  private readonly onGesture = (): void => {
    this.audioSvc.unlock()
  }

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // Checked before anything else, so muting can never flip or start a run.
    if (this.isOverSoundButton(pointer)) return
    this.handleTap()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return

    if (event.key === 'm' || event.key === 'M') {
      event.preventDefault()
      this.toggleMute()
      return
    }

    if (START_KEYS.has(event.key)) {
      event.preventDefault()
      this.audioSvc.unlock()
      this.handleTap()
    }
  }

  /**
   * Phaser listens on the canvas, so a tap on the sibling <button> should never
   * arrive here — but the geometric check is cheap and makes the guarantee
   * independent of Phaser's input target configuration.
   */
  private isOverSoundButton(pointer: Phaser.Input.Pointer): boolean {
    const button = this.soundButton
    if (!button) return false

    const source = pointer.event
    let clientX: number
    let clientY: number

    if (source instanceof MouseEvent) {
      clientX = source.clientX
      clientY = source.clientY
    } else if (typeof TouchEvent !== 'undefined' && source instanceof TouchEvent) {
      const touch = source.changedTouches[0]
      if (!touch) return false
      clientX = touch.clientX
      clientY = touch.clientY
    } else {
      return false
    }

    const rect = button.getBoundingClientRect()
    return (
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    )
  }

  // ── Sound button ────────────────────────────────────────────────────────────

  private bindSoundButton(): void {
    const element = document.getElementById('sound-toggle')
    if (!(element instanceof HTMLButtonElement)) return

    this.soundButton = element
    this.syncSoundButton()
    element.addEventListener('click', this.onSoundClick)
    element.addEventListener('pointerdown', stopPropagation)
  }

  private readonly onSoundClick = (event: Event): void => {
    event.preventDefault()
    event.stopPropagation()
    this.toggleMute()
  }

  private toggleMute(): void {
    this.saved = { ...this.saved, muted: !this.saved.muted }
    this.audioSvc.setMuted(this.saved.muted)
    saveSettings(this.saved)
    this.syncSoundButton()
    if (!this.saved.muted) this.audioSvc.unlock()
  }

  private syncSoundButton(): void {
    const button = this.soundButton
    if (!button) return
    button.setAttribute('aria-pressed', String(this.saved.muted))
    button.setAttribute('aria-label', this.saved.muted ? 'Unmute sound' : 'Mute sound')
  }

  // ── Environment ─────────────────────────────────────────────────────────────

  private readonly onScaleResize = (): void => {
    const snap = this.viewport.read()
    const next = computeLayout(snap.width, snap.height, snap.safe)

    // Remap before swapping the layout in: remapRun needs the old one.
    if (this.activeRun) remapRun(this.activeRun, next)
    this.layoutInfo = next

    // A resize must not hand the simulation a backlog to catch up on.
    resetStepper(this.stepper)

    if (snap.dpr !== this.dpr) {
      this.dpr = snap.dpr
      this.art.setDevicePixelRatio(snap.dpr)
    }
    this.art.applyLayout(next)

    if (this.machine.setLandscape(isLandscape(next))) {
      this.announce('Rotate your phone to portrait.')
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) this.pause()
  }

  private readonly onWindowBlur = (): void => {
    this.pause()
  }

  private announce(message: string): void {
    if (this.statusEl) this.statusEl.textContent = message
  }

  /** Every listener registered in create() is released here. */
  private readonly teardown = (): void => {
    this.input.off('pointerdown', this.onPointerDown)
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize)
    for (const type of GESTURE_EVENTS) {
      window.removeEventListener(type, this.onGesture, { capture: true })
    }
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('blur', this.onWindowBlur)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)

    this.soundButton?.removeEventListener('click', this.onSoundClick)
    this.soundButton?.removeEventListener('pointerdown', stopPropagation)
    this.soundButton = null

    this.audioSvc.dispose()
  }
}

function stopPropagation(event: Event): void {
  event.stopPropagation()
}

function matchMediaSafe(query: string): boolean {
  try {
    return window.matchMedia(query).matches
  } catch {
    return false
  }
}
