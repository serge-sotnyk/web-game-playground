import type Phaser from 'phaser'
import { MAX_DPR } from './game/constants'
import { clamp } from './game/math'
import type { SafeInsets } from './game/types'

export interface ViewportSnapshot {
  /** Logical CSS pixels — the units the whole simulation works in. */
  width: number
  height: number
  /** Device pixels per CSS pixel, clamped to something a GPU will tolerate. */
  dpr: number
  safe: SafeInsets
}

function readPx(value: string): number {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Owns the bridge between the DOM and Phaser's Scale Manager.
 *
 * Phaser 4 has no `resolution` option and its RESIZE mode pins the canvas
 * backing store to the parent's CSS size — which is blurry on any phone with
 * `devicePixelRatio > 1`. So the game runs in NONE mode and we drive it: the
 * canvas is sized in *device* pixels and `zoom = 1 / dpr` scales it back down
 * to CSS pixels for display. The scene then draws through a container scaled by
 * `dpr`, which restores logical-CSS-pixel coordinates for everything above.
 *
 * See NOTES.md — the plan asked for RESIZE + `resolution`, which does not exist.
 */
export class Viewport {
  private lastDpr = 0
  private lastWidth = 0
  private lastHeight = 0
  private game: Phaser.Game | null = null
  private observer: ResizeObserver | null = null
  private readonly onWindowChange = () => this.sync()

  constructor(
    private readonly parent: HTMLElement,
    private readonly probe: HTMLElement,
  ) {}

  read(): ViewportSnapshot {
    const rect = this.parent.getBoundingClientRect()
    const style = getComputedStyle(this.probe)

    return {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      dpr: clamp(window.devicePixelRatio || 1, 1, MAX_DPR),
      safe: {
        top: readPx(style.paddingTop),
        right: readPx(style.paddingRight),
        bottom: readPx(style.paddingBottom),
        left: readPx(style.paddingLeft),
      },
    }
  }

  attach(game: Phaser.Game): void {
    this.game = game

    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onWindowChange)
      this.observer.observe(this.parent)
    }

    window.addEventListener('resize', this.onWindowChange)
    window.addEventListener('orientationchange', this.onWindowChange)
    window.visualViewport?.addEventListener('resize', this.onWindowChange)

    this.sync()
  }

  detach(): void {
    this.observer?.disconnect()
    this.observer = null
    window.removeEventListener('resize', this.onWindowChange)
    window.removeEventListener('orientationchange', this.onWindowChange)
    window.visualViewport?.removeEventListener('resize', this.onWindowChange)
    this.game = null
  }

  /**
   * Push the current measurement into the Scale Manager. Idempotent: if nothing
   * moved, no RESIZE event is emitted.
   */
  sync(): void {
    const game = this.game
    if (!game) return

    const view = this.read()
    const backingWidth = Math.max(1, Math.round(view.width * view.dpr))
    const backingHeight = Math.max(1, Math.round(view.height * view.dpr))

    // DPR changes when the window moves between displays, or under emulation.
    if (view.dpr !== this.lastDpr) {
      this.lastDpr = view.dpr
      game.scale.setZoom(1 / view.dpr)
      this.lastWidth = 0
    }

    if (backingWidth === this.lastWidth && backingHeight === this.lastHeight) return

    this.lastWidth = backingWidth
    this.lastHeight = backingHeight
    game.scale.resize(backingWidth, backingHeight)
  }
}
