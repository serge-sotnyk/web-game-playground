import type Phaser from 'phaser'
import {
  BG_BAND_COUNT,
  BG_DOT_COUNT,
  BG_DOT_PARALLAX,
  BG_DOT_SEED,
  COLOR_BG,
  COLOR_BG_BAND,
  COLOR_BG_DOT,
  COLOR_DOWN,
  COLOR_DOWN_CSS,
  COLOR_GATE,
  COLOR_GATE_OUTLINE,
  COLOR_MUTED_CSS,
  COLOR_RAIL_BAR,
  COLOR_SHADOW_CSS,
  COLOR_UP,
  COLOR_UP_CSS,
  COLOR_WHITE,
  COLOR_WHITE_CSS,
  CRASH_FLASH_ALPHA,
  CRASH_FLASH_MS,
  CRASH_PARTICLES,
  CRASH_PARTICLE_MS,
  CRASH_SHAKE_MS,
  CRASH_SHAKE_U,
  FLIP_PARTICLES,
  FLIP_RING_FROM_U,
  FLIP_RING_MS,
  FLIP_RING_TO_U,
  FONT_BODY_U,
  FONT_RESULT_SCORE_U,
  FONT_SCORE_U,
  FONT_STACK,
  FONT_TITLE_U,
  GATE_LIP_FLASH_MS,
  GATE_LIP_H_U,
  GATE_OUTLINE_W_U,
  GATE_POOL,
  MAX_TILT_RAD,
  MAX_VY_U,
  NEW_BEST_TEXT,
  PARTICLE_POOL,
  PAUSED_TEXT,
  RAIL_BAR_H_U,
  RAIL_DASH_GAP_U,
  RAIL_DASH_LEN_U,
  RAIL_LINE_H_U,
  READY_ARROW_PERIOD_MS,
  READY_BOB_PERIOD_MS,
  READY_BOB_U,
  READY_HINT,
  REDUCED_MOTION_PARTICLE_FACTOR,
  RETRY_TEXT,
  ROTATE_TEXT,
  SCORE_POP_DOWN_MS,
  SCORE_POP_SCALE,
  SCORE_POP_UP_MS,
  SPARK_CENTER_R_U,
  SPARK_CORE_R_U,
  SPARK_HALO_ALPHA,
  SPARK_HALO_R_U,
  SPARK_RING_R_U,
  SPARK_RING_W_U,
  TEXT_SHADOW_PX,
  TITLE_TEXT,
  TRAIL_MOTE_COUNT,
} from './constants'
import { gateHalfVisualWidth } from './collision'
import { clamp, lerp, mixColor } from './math'
import { mulberry32 } from './rng'
import { gateCenter } from './simulation'
import type { Direction, GameState, Gate, Layout, Run } from './types'

/** Everything the renderer is allowed to know about a frame. Read-only. */
export interface FrameView {
  state: GameState
  run: Run | null
  layout: Layout
  /** 0..1 between the previous and current fixed-step snapshots. */
  alpha: number
  score: number
  best: number
  newBest: boolean
  landscape: boolean
  /** Real seconds elapsed since the previous frame. */
  dt: number
}

interface Particle {
  life: number
  maxLife: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: number
}

interface Ring {
  life: number
  y: number
  color: number
}

interface BgDot {
  nx: number
  ny: number
  radius: number
  alpha: number
}

function makeParticlePool(size: number): Particle[] {
  return Array.from({ length: size }, () => ({
    life: 0,
    maxLife: 1,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    radius: 1,
    color: COLOR_WHITE,
  }))
}

/**
 * All presentation for Flux Flip: procedural art, pooling, interpolation and
 * effect timing. It reads simulation snapshots and never writes to them.
 *
 * Coordinates here are logical CSS pixels. `root` carries the single
 * `dpr` scale that maps them onto the device-pixel canvas, so nothing below
 * this line has to think about pixel ratios — except Text, which is rasterised
 * at device size and scaled back down so glyphs stay crisp.
 */
export class Renderer {
  private readonly root: Phaser.GameObjects.Container
  private readonly bgStatic: Phaser.GameObjects.Graphics
  private readonly bgDotsGfx: Phaser.GameObjects.Graphics
  private readonly gateGfx: Phaser.GameObjects.Graphics[] = []
  private readonly rails: Phaser.GameObjects.Graphics
  private readonly fx: Phaser.GameObjects.Graphics
  private readonly spark: Phaser.GameObjects.Graphics
  private readonly flash: Phaser.GameObjects.Graphics
  private readonly readyArrow: Phaser.GameObjects.Graphics

  private readonly scoreText: Phaser.GameObjects.Text
  private readonly titleText: Phaser.GameObjects.Text
  private readonly hintText: Phaser.GameObjects.Text
  private readonly bestText: Phaser.GameObjects.Text
  private readonly overlayText: Phaser.GameObjects.Text
  private readonly resultLabel: Phaser.GameObjects.Text
  private readonly resultScore: Phaser.GameObjects.Text
  private readonly resultBest: Phaser.GameObjects.Text
  private readonly newBestText: Phaser.GameObjects.Text
  private readonly retryText: Phaser.GameObjects.Text
  private readonly allText: Phaser.GameObjects.Text[]

  private readonly crashParticles = makeParticlePool(PARTICLE_POOL)
  private readonly trailMotes = makeParticlePool(TRAIL_MOTE_COUNT)
  private readonly rings: Ring[] = []
  private readonly bgDots: BgDot[] = []
  private readonly lipFlash = new Map<number, number>()

  private layout: Layout
  private sparkDirection: Direction = 1
  private sparkDrawnU = -1
  private drawnScore = -1

  private shake = 0
  private flashLeft = 0
  private scorePop = 0
  private elapsedMs = 0
  private arrowUp = true
  private arrowDrawn = false

  constructor(
    private readonly scene: Phaser.Scene,
    private dpr: number,
    private readonly reducedMotion: boolean,
    layout: Layout,
  ) {
    this.layout = layout

    this.root = scene.add.container(0, 0)
    this.root.setScale(dpr)

    this.bgStatic = scene.add.graphics()
    this.bgDotsGfx = scene.add.graphics()
    this.root.add([this.bgStatic, this.bgDotsGfx])

    for (let i = 0; i < GATE_POOL; i += 1) {
      const g = scene.add.graphics()
      g.setVisible(false)
      this.gateGfx.push(g)
      this.root.add(g)
    }

    this.rails = scene.add.graphics()
    this.fx = scene.add.graphics()
    this.spark = scene.add.graphics()
    this.flash = scene.add.graphics()
    this.readyArrow = scene.add.graphics()
    this.root.add([this.rails, this.fx, this.spark, this.flash, this.readyArrow])

    this.scoreText = this.makeText(FONT_SCORE_U, COLOR_WHITE_CSS, 'bold')
    this.titleText = this.makeText(FONT_TITLE_U, COLOR_UP_CSS, 'bold')
    this.hintText = this.makeText(FONT_BODY_U, COLOR_WHITE_CSS)
    this.bestText = this.makeText(FONT_BODY_U, COLOR_MUTED_CSS)
    this.overlayText = this.makeText(FONT_BODY_U, COLOR_WHITE_CSS, 'bold')
    this.resultLabel = this.makeText(FONT_BODY_U, COLOR_MUTED_CSS)
    this.resultScore = this.makeText(FONT_RESULT_SCORE_U, COLOR_WHITE_CSS, 'bold')
    this.resultBest = this.makeText(FONT_BODY_U, COLOR_MUTED_CSS)
    this.newBestText = this.makeText(FONT_BODY_U, COLOR_DOWN_CSS, 'bold')
    this.retryText = this.makeText(FONT_BODY_U, COLOR_WHITE_CSS)
    this.allText = [
      this.scoreText,
      this.titleText,
      this.hintText,
      this.bestText,
      this.overlayText,
      this.resultLabel,
      this.resultScore,
      this.resultBest,
      this.newBestText,
      this.retryText,
    ]

    this.titleText.setText(TITLE_TEXT)
    this.hintText.setText(READY_HINT)
    this.resultLabel.setText('SCORE')
    this.newBestText.setText(NEW_BEST_TEXT)
    this.retryText.setText(RETRY_TEXT)

    // Deterministic star field: same dots every session, no Math.random.
    const rng = mulberry32(BG_DOT_SEED)
    for (let i = 0; i < BG_DOT_COUNT; i += 1) {
      this.bgDots.push({
        nx: rng(),
        ny: rng(),
        radius: lerp(0.8, 2.2, rng()),
        alpha: lerp(0.05, 0.16, rng()),
      })
    }

    this.applyLayout(layout)
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  /**
   * The pixel ratio can change under the app (window dragged to another
   * display, DevTools emulation). Re-scale the world container and re-rasterise
   * the text at the new device size; `applyLayout` follows and does the rest.
   */
  setDevicePixelRatio(dpr: number): void {
    this.dpr = dpr
    this.root.setScale(dpr)
  }

  applyLayout(layout: Layout): void {
    this.layout = layout
    const { u, width, playTop, playBottom } = layout
    const mid = (playTop + playBottom) / 2

    this.drawBackground()
    this.sparkDrawnU = -1
    this.arrowDrawn = false

    this.setTextSize(this.scoreText, FONT_SCORE_U)
    this.setTextSize(this.titleText, FONT_TITLE_U)
    this.setTextSize(this.hintText, FONT_BODY_U)
    this.setTextSize(this.bestText, FONT_BODY_U)
    this.setTextSize(this.overlayText, FONT_BODY_U)
    this.setTextSize(this.resultLabel, FONT_BODY_U)
    this.setTextSize(this.resultScore, FONT_RESULT_SCORE_U)
    this.setTextSize(this.resultBest, FONT_BODY_U)
    this.setTextSize(this.newBestText, FONT_BODY_U)
    this.setTextSize(this.retryText, FONT_BODY_U)

    const cx = width / 2

    // The HUD lives in the protected band between the safe-area top and the
    // upper rail, so it can never overlap the corridor.
    this.scoreText.setPosition(cx, (layout.safe.top + playTop) / 2)

    this.titleText.setPosition(cx, mid - 96 * u)
    this.hintText.setPosition(cx, mid - 46 * u)
    this.bestText.setPosition(cx, mid + 96 * u)
    this.overlayText.setPosition(cx, mid)

    this.resultLabel.setPosition(cx, mid - 92 * u)
    this.resultScore.setPosition(cx, mid - 52 * u)
    this.resultBest.setPosition(cx, mid + 4 * u)
    this.newBestText.setPosition(cx, mid + 38 * u)
    this.retryText.setPosition(cx, mid + 92 * u)
  }

  // ── Per-frame ───────────────────────────────────────────────────────────────

  update(view: FrameView): void {
    const dtMs = view.dt * 1000
    this.elapsedMs += dtMs

    this.tickEffects(dtMs)
    this.applyShake()

    const { run, layout } = view
    const u = layout.u

    this.drawBgDots(run?.distance ?? 0)
    this.drawGates(run, view)
    this.drawRails(run?.distance ?? 0)
    this.drawFx()

    // Spark position: interpolated during play, static (bobbing) on the ready
    // screen, pinned at the impact point while dying.
    const sparkY = this.sparkY(view)
    const visible = view.state !== 'BOOT' && !view.landscape
    this.spark.setVisible(visible)
    if (visible) {
      this.drawSpark(run?.player.direction ?? 1, u)
      this.spark.setPosition(layout.playerX, sparkY)
      const vy = run?.player.vy ?? 0
      this.spark.setRotation(clamp((vy / (MAX_VY_U * u)) * MAX_TILT_RAD, -MAX_TILT_RAD, MAX_TILT_RAD))
    }

    this.drawFlash()
    this.updateHud(view)
  }

  private sparkY(view: FrameView): number {
    const { run, layout, state } = view

    if (state === 'READY') {
      // Purely cosmetic: the simulation is stopped on the ready screen.
      const bob = this.reducedMotion
        ? 0
        : Math.sin((this.elapsedMs / READY_BOB_PERIOD_MS) * Math.PI * 2) * READY_BOB_U * layout.u
      return (layout.playTop + layout.playBottom) / 2 + bob
    }

    if (!run) return (layout.playTop + layout.playBottom) / 2
    if (state === 'PLAYING') return lerp(run.player.prevY, run.player.y, view.alpha)
    return run.player.y
  }

  // ── Effects ─────────────────────────────────────────────────────────────────

  onFlip(y: number, direction: Direction): void {
    const u = this.layout.u
    const color = direction === -1 ? COLOR_UP : COLOR_DOWN

    this.rings.push({ life: FLIP_RING_MS, y, color })
    if (this.rings.length > 4) this.rings.shift()

    this.emit(this.trailMotes, this.scaledCount(FLIP_PARTICLES), () => ({
      x: this.layout.playerX - 6 * u,
      y: y + (Math.random() - 0.5) * 8 * u,
      vx: -lerp(30, 90, Math.random()) * u,
      vy: (Math.random() - 0.5) * 40 * u,
      radius: lerp(1.2, 2.6, Math.random()) * u,
      maxLife: lerp(180, 320, Math.random()),
      color,
    }))
  }

  onScore(gateId: number): void {
    this.scorePop = SCORE_POP_UP_MS + SCORE_POP_DOWN_MS
    this.lipFlash.set(gateId, GATE_LIP_FLASH_MS)
  }

  onCrash(y: number): void {
    const u = this.layout.u
    if (!this.reducedMotion) this.shake = CRASH_SHAKE_MS
    this.flashLeft = CRASH_FLASH_MS

    this.emit(this.crashParticles, this.scaledCount(CRASH_PARTICLES), () => {
      const angle = Math.random() * Math.PI * 2
      const speed = lerp(60, 260, Math.random()) * u
      return {
        x: this.layout.playerX,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: lerp(1.5, 3.6, Math.random()) * u,
        maxLife: lerp(CRASH_PARTICLE_MS * 0.6, CRASH_PARTICLE_MS, Math.random()),
        color: Math.random() < 0.5 ? COLOR_DOWN : COLOR_WHITE,
      }
    })
  }

  /** Clear anything left over from the previous run. */
  onRunStart(): void {
    for (const p of this.crashParticles) p.life = 0
    for (const p of this.trailMotes) p.life = 0
    this.rings.length = 0
    this.lipFlash.clear()
    this.shake = 0
    this.flashLeft = 0
    this.scorePop = 0
    this.drawnScore = -1
  }

  private scaledCount(count: number): number {
    return this.reducedMotion ? Math.max(1, Math.round(count * REDUCED_MOTION_PARTICLE_FACTOR)) : count
  }

  private emit(
    pool: Particle[],
    count: number,
    spawn: () => Omit<Particle, 'life'>,
  ): void {
    let made = 0
    for (const p of pool) {
      if (made >= count) return
      if (p.life > 0) continue
      Object.assign(p, spawn(), { life: 0 })
      p.life = p.maxLife
      made += 1
    }
  }

  private tickEffects(dtMs: number): void {
    const dt = dtMs / 1000

    for (const pool of [this.crashParticles, this.trailMotes]) {
      for (const p of pool) {
        if (p.life <= 0) continue
        p.life -= dtMs
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vx *= 0.98
        p.vy *= 0.98
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i]
      if (ring === undefined) continue
      ring.life -= dtMs
      if (ring.life <= 0) this.rings.splice(i, 1)
    }

    for (const [id, left] of this.lipFlash) {
      const next = left - dtMs
      if (next <= 0) this.lipFlash.delete(id)
      else this.lipFlash.set(id, next)
    }

    this.shake = Math.max(0, this.shake - dtMs)
    this.flashLeft = Math.max(0, this.flashLeft - dtMs)
    this.scorePop = Math.max(0, this.scorePop - dtMs)
  }

  private applyShake(): void {
    if (this.shake <= 0) {
      this.root.setPosition(0, 0)
      return
    }
    const strength = (this.shake / CRASH_SHAKE_MS) * CRASH_SHAKE_U * this.layout.u
    const dx = (Math.random() * 2 - 1) * strength
    const dy = (Math.random() * 2 - 1) * strength
    this.root.setPosition(dx * this.dpr, dy * this.dpr)
  }

  // ── Drawing ─────────────────────────────────────────────────────────────────

  private drawBackground(): void {
    const { width, height } = this.layout
    const g = this.bgStatic
    // Overdrawn beyond the viewport so the crash shake cannot reveal an edge.
    const pad = 24
    const bandHeight = (height + pad * 2) / BG_BAND_COUNT

    g.clear()
    for (let i = 0; i < BG_BAND_COUNT; i += 1) {
      const t = BG_BAND_COUNT > 1 ? i / (BG_BAND_COUNT - 1) : 0
      g.fillStyle(mixColor(COLOR_BG, COLOR_BG_BAND, t), 1)
      g.fillRect(-pad, -pad + i * bandHeight, width + pad * 2, bandHeight + 1)
    }
  }

  private drawBgDots(distance: number): void {
    const { width, height } = this.layout
    const g = this.bgDotsGfx
    const span = width + 40
    const drift = (distance * BG_DOT_PARALLAX) % span

    g.clear()
    for (const dot of this.bgDots) {
      let x = dot.nx * span - drift
      if (x < -20) x += span
      g.fillStyle(COLOR_BG_DOT, dot.alpha)
      g.fillCircle(x - 20, dot.ny * height, dot.radius)
    }
  }

  private drawRails(distance: number): void {
    const { u, width, playTop, playBottom } = this.layout
    const g = this.rails
    const pad = 24
    const bar = RAIL_BAR_H_U * u
    const line = RAIL_LINE_H_U * u
    const dash = RAIL_DASH_LEN_U * u
    const period = dash + RAIL_DASH_GAP_U * u
    const offset = distance % period

    g.clear()

    // Solid bars sit outside the corridor; the bright inner line marks the
    // exact surface that kills you.
    g.fillStyle(COLOR_RAIL_BAR, 1)
    g.fillRect(-pad, playTop - bar, width + pad * 2, bar)
    g.fillRect(-pad, playBottom, width + pad * 2, bar)

    g.fillStyle(COLOR_UP, 1)
    g.fillRect(-pad, playTop - line, width + pad * 2, line)
    g.fillStyle(COLOR_DOWN, 1)
    g.fillRect(-pad, playBottom, width + pad * 2, line)

    // Dashes scroll with the world so speed is legible even in an empty field.
    const dashH = Math.max(1, 2 * u)
    const topDashY = playTop - bar + (bar - line - dashH) / 2
    const bottomDashY = playBottom + line + (bar - line - dashH) / 2

    for (let x = -offset - period; x < width + period; x += period) {
      g.fillStyle(COLOR_UP, 0.35)
      g.fillRect(x, topDashY, dash, dashH)
      g.fillStyle(COLOR_DOWN, 0.35)
      g.fillRect(x, bottomDashY, dash, dashH)
    }
  }

  private drawGates(run: Run | null, view: FrameView): void {
    const gates = run?.gates ?? []
    const { u, playTop, playBottom } = this.layout
    const halfVisual = gateHalfVisualWidth(u)
    const interpolate = view.state === 'PLAYING'

    for (let i = 0; i < this.gateGfx.length; i += 1) {
      const g = this.gateGfx[i]
      if (g === undefined) continue

      const gate = gates[i]
      if (gate === undefined || view.landscape) {
        g.setVisible(false)
        continue
      }

      g.setVisible(true)
      g.setPosition(interpolate ? lerp(gate.prevX, gate.x, view.alpha) : gate.x, 0)
      this.drawGate(g, gate, halfVisual, playTop, playBottom, u)
    }
  }

  private drawGate(
    g: Phaser.GameObjects.Graphics,
    gate: Gate,
    halfVisual: number,
    playTop: number,
    playBottom: number,
    u: number,
  ): void {
    const center = gateCenter(gate)
    const half = gate.gapHeight / 2
    const topEnd = center - half
    const bottomStart = center + half
    const outline = GATE_OUTLINE_W_U * u
    const lipH = GATE_LIP_H_U * u
    const width = halfVisual * 2
    const flash = this.lipFlash.get(gate.id) ?? 0
    const lipColor = flash > 0 ? COLOR_WHITE : COLOR_GATE_OUTLINE
    const lipAlpha = flash > 0 ? 1 : 0.85

    g.clear()

    const topH = Math.max(0, topEnd - playTop)
    const bottomH = Math.max(0, playBottom - bottomStart)

    g.fillStyle(COLOR_GATE, 1)
    g.fillRect(-halfVisual, playTop, width, topH)
    g.fillRect(-halfVisual, bottomStart, width, bottomH)

    g.lineStyle(outline, COLOR_GATE_OUTLINE, 0.9)
    if (topH > 0) g.strokeRect(-halfVisual, playTop - outline, width, topH + outline)
    if (bottomH > 0) g.strokeRect(-halfVisual, bottomStart, width, bottomH + outline)

    // Bright lips frame the opening. Collision is 5U more generous than this on
    // each side, so grazing a lip is survivable by design.
    g.fillStyle(lipColor, lipAlpha)
    if (topH > 0) g.fillRect(-halfVisual, topEnd - lipH, width, lipH)
    if (bottomH > 0) g.fillRect(-halfVisual, bottomStart, width, lipH)

    // Circuit nodes: three per visible column.
    g.fillStyle(COLOR_GATE_OUTLINE, 0.45)
    const nodeR = Math.max(1, 2 * u)
    for (let n = 1; n <= 3; n += 1) {
      const t = n / 4
      if (topH > lipH * 2) g.fillCircle(0, playTop + topH * t, nodeR)
      if (bottomH > lipH * 2) g.fillCircle(0, bottomStart + bottomH * t, nodeR)
    }
  }

  private drawSpark(direction: Direction, u: number): void {
    if (direction === this.sparkDirection && u === this.sparkDrawnU) return
    this.sparkDirection = direction
    this.sparkDrawnU = u

    const color = direction === -1 ? COLOR_UP : COLOR_DOWN
    const g = this.spark
    g.clear()
    g.fillStyle(color, SPARK_HALO_ALPHA)
    g.fillCircle(0, 0, SPARK_HALO_R_U * u)
    g.lineStyle(SPARK_RING_W_U * u, color, 0.8)
    g.strokeCircle(0, 0, SPARK_RING_R_U * u)
    g.fillStyle(color, 1)
    g.fillCircle(0, 0, SPARK_CORE_R_U * u)
    g.fillStyle(COLOR_WHITE, 1)
    g.fillCircle(0, 0, SPARK_CENTER_R_U * u)
  }

  private drawFx(): void {
    const g = this.fx
    const u = this.layout.u
    g.clear()

    for (const pool of [this.trailMotes, this.crashParticles]) {
      for (const p of pool) {
        if (p.life <= 0) continue
        const t = p.life / p.maxLife
        g.fillStyle(p.color, clamp(t, 0, 1) * 0.9)
        g.fillCircle(p.x, p.y, p.radius * clamp(t, 0.2, 1))
      }
    }

    for (const ring of this.rings) {
      const t = 1 - ring.life / FLIP_RING_MS
      const radius = lerp(FLIP_RING_FROM_U * u, FLIP_RING_TO_U * u, t)
      g.lineStyle(Math.max(1, 2 * u), ring.color, (1 - t) * 0.7)
      g.strokeCircle(this.layout.playerX, ring.y, radius)
    }
  }

  private drawFlash(): void {
    const g = this.flash
    g.clear()
    if (this.flashLeft <= 0) return

    const { width, height } = this.layout
    const alpha = (this.flashLeft / CRASH_FLASH_MS) * CRASH_FLASH_ALPHA
    g.fillStyle(COLOR_DOWN, alpha)
    g.fillRect(-24, -24, width + 48, height + 48)
  }

  private drawReadyArrow(up: boolean): void {
    if (this.arrowDrawn && up === this.arrowUp) return
    this.arrowUp = up
    this.arrowDrawn = true

    const u = this.layout.u
    const g = this.readyArrow
    const w = 15 * u
    const h = 13 * u
    const sign = up ? -1 : 1

    g.clear()
    g.fillStyle(up ? COLOR_UP : COLOR_DOWN, 0.95)
    g.beginPath()
    g.moveTo(0, sign * h)
    g.lineTo(-w, sign * -h * 0.4)
    g.lineTo(w, sign * -h * 0.4)
    g.closePath()
    g.fillPath()
  }

  // ── HUD & overlays ──────────────────────────────────────────────────────────

  private updateHud(view: FrameView): void {
    const { state, layout, landscape } = view
    const u = layout.u
    const playing = state === 'PLAYING' || state === 'DYING'

    if (landscape) {
      for (const t of this.allText) t.setVisible(false)
      this.readyArrow.setVisible(false)
      this.overlayText.setText(ROTATE_TEXT).setVisible(true)
      this.overlayText.setPosition(layout.width / 2, layout.height / 2)
      return
    }

    this.overlayText.setPosition(layout.width / 2, (layout.playTop + layout.playBottom) / 2)

    // Score text: rewritten only when the number actually changes.
    if (this.drawnScore !== view.score) {
      this.drawnScore = view.score
      this.scoreText.setText(String(view.score))
    }
    this.scoreText.setVisible(playing || state === 'PAUSED')
    this.setTextScale(this.scoreText, this.scorePopScale())

    const ready = state === 'READY'
    this.titleText.setVisible(ready)
    this.hintText.setVisible(ready)
    this.bestText.setVisible(ready)
    this.readyArrow.setVisible(ready)

    if (ready) {
      this.bestText.setText(view.best > 0 ? `BEST  ${view.best}` : 'BEST  —')
      const up = Math.floor(this.elapsedMs / READY_ARROW_PERIOD_MS) % 2 === 0
      this.drawReadyArrow(up)
      this.readyArrow.setPosition(layout.width / 2, (layout.playTop + layout.playBottom) / 2 - 12 * u)
    }

    this.overlayText.setVisible(state === 'PAUSED')
    if (state === 'PAUSED') this.overlayText.setText(PAUSED_TEXT)

    const results = state === 'RESULTS'
    this.resultLabel.setVisible(results)
    this.resultScore.setVisible(results)
    this.resultBest.setVisible(results)
    this.retryText.setVisible(results)
    this.newBestText.setVisible(results && view.newBest)

    if (results) {
      this.resultScore.setText(String(view.score))
      this.resultBest.setText(`BEST  ${view.best}`)
    }
  }

  private scorePopScale(): number {
    if (this.reducedMotion || this.scorePop <= 0) return 1
    const total = SCORE_POP_UP_MS + SCORE_POP_DOWN_MS
    const elapsed = total - this.scorePop
    return elapsed < SCORE_POP_UP_MS
      ? lerp(1, SCORE_POP_SCALE, elapsed / SCORE_POP_UP_MS)
      : lerp(SCORE_POP_SCALE, 1, (elapsed - SCORE_POP_UP_MS) / SCORE_POP_DOWN_MS)
  }

  // ── Text plumbing ───────────────────────────────────────────────────────────

  /**
   * Text is rasterised at device-pixel size and scaled back down by `1 / dpr`,
   * which cancels the container's `dpr` scale. Net result: one glyph pixel per
   * device pixel, positioned in logical CSS pixels like everything else.
   */
  private makeText(sizeU: number, color: string, weight = 'normal'): Phaser.GameObjects.Text {
    const text = this.scene.add.text(0, 0, '', {
      fontFamily: FONT_STACK,
      fontSize: `${Math.round(sizeU * this.dpr)}px`,
      fontStyle: weight,
      color,
    })
    text.setOrigin(0.5, 0.5)
    text.setScale(1 / this.dpr)
    text.setVisible(false)
    this.root.add(text)
    return text
  }

  private setTextSize(text: Phaser.GameObjects.Text, sizeU: number): void {
    text.setFontSize(Math.max(1, Math.round(sizeU * this.layout.u * this.dpr)))
    const shadow = TEXT_SHADOW_PX * this.layout.u * this.dpr
    text.setShadow(0, shadow, COLOR_SHADOW_CSS, 0, false, true)
    this.setTextScale(text, 1)
  }

  private setTextScale(text: Phaser.GameObjects.Text, scale: number): void {
    text.setScale(scale / this.dpr)
  }

  destroy(): void {
    this.root.destroy(true)
  }
}
