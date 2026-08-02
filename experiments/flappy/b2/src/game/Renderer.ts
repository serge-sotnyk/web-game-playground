import Phaser from 'phaser';
import {
  BACKGROUND_BANDS,
  BACKGROUND_DOTS,
  BURST_MS,
  CIRCUIT_NODES_PER_SEGMENT,
  COLORS,
  DYING_SLOWDOWN_MS,
  FLIP_RING_MS,
  GATE_LIP_HEIGHT,
  GATE_OUTLINE_WIDTH,
  GATE_RENDER_POOL,
  GATE_VISUAL_WIDTH,
  HIT_FLASH_MS,
  PARTICLE_POOL,
  PARALLAX_RATE,
  PLAYER_VISUAL_HEIGHT,
  PLAYER_VISUAL_WIDTH,
  PLAYER_MAX_ROTATION_DEG,
  PLAYER_MAX_SPEED,
  READY_ARROW_INTERVAL_MS,
  READY_BOB,
  RAIL_BAR_WIDTH,
  RAIL_INNER_LINE_WIDTH,
  SCORE_FLASH_MS,
  SCORE_GROW_MS,
  SCORE_SHRINK_MS,
  SHAKE_MS,
  SPARK_CENTER_RADIUS,
  SPARK_CORE_RADIUS,
  SPARK_RING_RADIUS,
  TRAIL_POOL,
  clamp,
  lerp,
} from './constants';
import { RENDER_DPR } from './display';
import type { GamePhase, GameSession, Layout, RenderSnapshot } from './types';

interface Mote {
  active: boolean;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  ageMs: number;
  lifeMs: number;
  size: number;
  color: number;
}

interface Dot {
  x: number;
  y: number;
  size: number;
  alpha: number;
}

const textColor = '#ffffff';
const fontFamily = 'system-ui, Roboto, sans-serif';

const interpolateColor = (from: number, to: number, amount: number): number => {
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;
  const r = Math.round(lerp(fromR, toR, amount));
  const g = Math.round(lerp(fromG, toG, amount));
  const b = Math.round(lerp(fromB, toB, amount));
  return (r << 16) | (g << 8) | b;
};

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

export class Renderer {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly stars: Phaser.GameObjects.Graphics;
  private readonly rails: Phaser.GameObjects.Graphics;
  private readonly gateGraphics: Phaser.GameObjects.Graphics[];
  private readonly trailsGraphic: Phaser.GameObjects.Graphics;
  private readonly spark: Phaser.GameObjects.Graphics;
  private readonly particlesGraphic: Phaser.GameObjects.Graphics;
  private readonly effects: Phaser.GameObjects.Graphics;
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly blocker: Phaser.GameObjects.Graphics;

  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly arrowText: Phaser.GameObjects.Text;
  private readonly bestText: Phaser.GameObjects.Text;
  private readonly resultLabel: Phaser.GameObjects.Text;
  private readonly resultScore: Phaser.GameObjects.Text;
  private readonly resultBest: Phaser.GameObjects.Text;
  private readonly newBestText: Phaser.GameObjects.Text;
  private readonly pausedText: Phaser.GameObjects.Text;
  private readonly rotateText: Phaser.GameObjects.Text;

  private readonly particles: Mote[];
  private readonly trails: Mote[];
  private readonly dots: Dot[];
  private readonly reducedMotion: boolean;
  private layout: Layout;
  private lastScore = -1;
  private scoreAnimationMs = Number.POSITIVE_INFINITY;
  private scoreFlashGate = -1;
  private scoreFlashMs = 0;
  private ringAgeMs = Number.POSITIVE_INFINITY;
  private ringX = 0;
  private ringY = 0;
  private crashAgeMs = Number.POSITIVE_INFINITY;
  private deathScroll = 0;
  private deathSpeed = 0;
  private visualSeed = 0x51f15e;
  private previousPhase: GamePhase = 'BOOT';

  public constructor(
    private readonly scene: Phaser.Scene,
    layout: Layout,
  ) {
    this.layout = layout;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.background = scene.add.graphics().setDepth(0);
    this.stars = scene.add.graphics().setDepth(1);
    this.rails = scene.add.graphics().setDepth(3);
    this.gateGraphics = Array.from({ length: GATE_RENDER_POOL }, () =>
      scene.add.graphics().setDepth(4),
    );
    this.trailsGraphic = scene.add.graphics().setDepth(5);
    this.spark = scene.add.graphics().setDepth(6);
    this.particlesGraphic = scene.add.graphics().setDepth(7);
    this.effects = scene.add.graphics().setDepth(8);
    this.flash = scene.add.graphics().setDepth(20);
    this.blocker = scene.add.graphics().setDepth(90);

    this.scoreText = this.makeText(42, true, 10);
    this.titleText = this.makeText(38, true, 11);
    this.bodyText = this.makeText(18, false, 11);
    this.arrowText = this.makeText(36, true, 11);
    this.bestText = this.makeText(16, false, 11);
    this.resultLabel = this.makeText(16, true, 11);
    this.resultScore = this.makeText(52, true, 11);
    this.resultBest = this.makeText(18, false, 11);
    this.newBestText = this.makeText(16, true, 11, '#4DEBFF');
    this.pausedText = this.makeText(18, true, 50);
    this.rotateText = this.makeText(24, true, 100);

    this.particles = Array.from({ length: PARTICLE_POOL }, () => this.emptyMote());
    this.trails = Array.from({ length: TRAIL_POOL }, () => this.emptyMote());
    this.dots = Array.from({ length: BACKGROUND_DOTS }, (_, index) => ({
      x: this.hash(index * 4 + 1),
      y: this.hash(index * 4 + 2),
      size: 0.7 + this.hash(index * 4 + 3) * 1.8,
      alpha: 0.08 + this.hash(index * 4 + 4) * 0.12,
    }));
    this.setLayout(layout);
  }

  private emptyMote(): Mote {
    return {
      active: false,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      ageMs: 0,
      lifeMs: 1,
      size: 1,
      color: COLORS.white,
    };
  }

  private makeText(
    size: number,
    bold: boolean,
    depth: number,
    color = textColor,
  ): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, '', {
        fontFamily,
        fontSize: `${Math.round(size * this.layout.U)}px`,
        fontStyle: bold ? 'bold' : 'normal',
        color,
        align: 'center',
        resolution: RENDER_DPR,
        shadow: {
          offsetX: 0,
          offsetY: Math.max(1, Math.round(2 * this.layout.U)),
          color: COLORS.shadow,
          blur: 0,
          stroke: true,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(depth);
  }

  private hash(value: number): number {
    let x = (value + 0x9e3779b9) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
    return ((x ^ (x >>> 15)) >>> 0) / 4_294_967_296;
  }

  private nextVisualRandom(): number {
    this.visualSeed = (Math.imul(this.visualSeed, 1_664_525) + 1_013_904_223) >>> 0;
    return this.visualSeed / 4_294_967_296;
  }

  public setLayout(layout: Layout): void {
    this.layout = layout;
    this.redrawBackground();
    const centerX = layout.width / 2;
    const corridorHeight = layout.playBottom - layout.playTop;
    this.scoreText
      .setPosition(centerX, Math.max(layout.safe.top + 24 * layout.U, 24 * layout.U))
      .setFontSize(Math.round(42 * layout.U));
    this.titleText
      .setPosition(centerX, layout.playTop + corridorHeight * 0.23)
      .setFontSize(Math.round(38 * layout.U));
    this.bestText
      .setPosition(centerX, layout.playTop + corridorHeight * 0.32)
      .setFontSize(Math.round(16 * layout.U));
    this.bodyText
      .setPosition(centerX, layout.playTop + corridorHeight * 0.64)
      .setFontSize(Math.round(18 * layout.U));
    this.arrowText
      .setPosition(centerX, layout.playTop + corridorHeight * 0.73)
      .setFontSize(Math.round(36 * layout.U));
    this.resultLabel
      .setPosition(centerX, layout.playTop + corridorHeight * 0.23)
      .setFontSize(Math.round(16 * layout.U));
    this.resultScore
      .setPosition(centerX, layout.playTop + corridorHeight * 0.34)
      .setFontSize(Math.round(52 * layout.U));
    this.resultBest
      .setPosition(centerX, layout.playTop + corridorHeight * 0.48)
      .setFontSize(Math.round(18 * layout.U));
    this.newBestText
      .setPosition(centerX, layout.playTop + corridorHeight * 0.55)
      .setFontSize(Math.round(16 * layout.U));
    this.pausedText
      .setPosition(centerX, layout.height / 2)
      .setFontSize(Math.round(18 * layout.U));
    this.rotateText
      .setPosition(centerX, layout.height / 2)
      .setFontSize(Math.round(24 * layout.U));
  }

  private redrawBackground(): void {
    const { width, height } = this.layout;
    this.background.clear();
    for (let band = 0; band < BACKGROUND_BANDS; band += 1) {
      const top = (band / BACKGROUND_BANDS) * height;
      const bottom = ((band + 1) / BACKGROUND_BANDS) * height + 1;
      this.background.fillStyle(
        interpolateColor(COLORS.background, COLORS.backgroundEnd, band / (BACKGROUND_BANDS - 1)),
        1,
      );
      this.background.fillRect(0, top, width, bottom - top);
    }
  }

  public notifyFlip(x: number, y: number, direction: 1 | -1): void {
    this.ringAgeMs = 0;
    this.ringX = x;
    this.ringY = y;
    const count = this.reducedMotion ? 2 : 6;
    for (let index = 0; index < count; index += 1) {
      const mote =
        this.trails.find((candidate) => !candidate.active) ??
        this.trails.reduce((oldest, candidate) =>
          candidate.ageMs / candidate.lifeMs > oldest.ageMs / oldest.lifeMs ? candidate : oldest,
        );
      mote.active = true;
      mote.x = x - (6 + this.nextVisualRandom() * 10) * this.layout.U;
      mote.y = y + (this.nextVisualRandom() - 0.5) * 12 * this.layout.U;
      mote.velocityX = -(45 + this.nextVisualRandom() * 55) * this.layout.U;
      mote.velocityY = -direction * (20 + this.nextVisualRandom() * 45) * this.layout.U;
      mote.ageMs = 0;
      mote.lifeMs = FLIP_RING_MS;
      mote.size = (1.3 + this.nextVisualRandom() * 1.7) * this.layout.U;
      mote.color = direction === -1 ? COLORS.cyan : COLORS.coral;
    }
  }

  public notifyScore(gateId: number): void {
    this.scoreAnimationMs = 0;
    this.scoreFlashGate = gateId;
    this.scoreFlashMs = SCORE_FLASH_MS;
  }

  public notifyCrash(x: number, y: number, speed: number): void {
    this.crashAgeMs = 0;
    this.deathScroll = 0;
    this.deathSpeed = speed;
    const count = this.reducedMotion ? 6 : 24;
    for (let index = 0; index < count; index += 1) {
      const mote = this.particles.find((candidate) => !candidate.active);
      if (!mote) break;
      const angle = (index / count) * Math.PI * 2 + this.nextVisualRandom() * 0.22;
      const speedValue = (80 + this.nextVisualRandom() * 170) * this.layout.U;
      mote.active = true;
      mote.x = x;
      mote.y = y;
      mote.velocityX = Math.cos(angle) * speedValue;
      mote.velocityY = Math.sin(angle) * speedValue;
      mote.ageMs = 0;
      mote.lifeMs = BURST_MS;
      mote.size = (1.6 + this.nextVisualRandom() * 3.2) * this.layout.U;
      mote.color = index % 2 === 0 ? COLORS.coral : COLORS.cyan;
    }
  }

  public resetRunEffects(): void {
    for (const mote of this.particles) mote.active = false;
    for (const mote of this.trails) mote.active = false;
    this.ringAgeMs = Number.POSITIVE_INFINITY;
    this.scoreAnimationMs = Number.POSITIVE_INFINITY;
    this.scoreFlashMs = 0;
    this.crashAgeMs = Number.POSITIVE_INFINITY;
    this.deathScroll = 0;
    this.scene.cameras.main.setScroll(0, 0);
  }

  private updateMotes(pool: Mote[], deltaSeconds: number): void {
    for (const mote of pool) {
      if (!mote.active) continue;
      mote.ageMs += deltaSeconds * 1000;
      if (mote.ageMs >= mote.lifeMs) {
        mote.active = false;
        continue;
      }
      mote.x += mote.velocityX * deltaSeconds;
      mote.y += mote.velocityY * deltaSeconds;
      mote.velocityX *= Math.pow(0.12, deltaSeconds);
      mote.velocityY *= Math.pow(0.12, deltaSeconds);
    }
  }

  private drawMotes(graphics: Phaser.GameObjects.Graphics, pool: Mote[]): void {
    graphics.clear();
    for (const mote of pool) {
      if (!mote.active) continue;
      graphics.fillStyle(mote.color, 1 - mote.ageMs / mote.lifeMs);
      graphics.fillCircle(mote.x, mote.y, mote.size);
    }
  }

  private drawStars(worldDistance: number): void {
    const { width, height } = this.layout;
    this.stars.clear();
    for (const dot of this.dots) {
      const x = wrap(dot.x * width - worldDistance * PARALLAX_RATE, width);
      this.stars.fillStyle(COLORS.pale, dot.alpha);
      this.stars.fillCircle(x, dot.y * height, dot.size * this.layout.U);
    }
  }

  private drawRails(worldDistance: number): void {
    const { width, playTop, playBottom, U } = this.layout;
    this.rails.clear();
    this.rails.fillStyle(COLORS.rail, 1);
    this.rails.fillRect(0, playTop - (RAIL_BAR_WIDTH * U) / 2, width, RAIL_BAR_WIDTH * U);
    this.rails.fillRect(0, playBottom - (RAIL_BAR_WIDTH * U) / 2, width, RAIL_BAR_WIDTH * U);
    this.rails.fillStyle(COLORS.cyan, 1);
    this.rails.fillRect(
      0,
      playTop + (RAIL_BAR_WIDTH / 2 - 1) * U,
      width,
      RAIL_INNER_LINE_WIDTH * U,
    );
    this.rails.fillStyle(COLORS.coral, 1);
    this.rails.fillRect(
      0,
      playBottom - (RAIL_BAR_WIDTH / 2 + 1) * U,
      width,
      RAIL_INNER_LINE_WIDTH * U,
    );

    const dashWidth = 18 * U;
    const dashGap = 14 * U;
    const period = dashWidth + dashGap;
    const offset = wrap(-worldDistance, period);
    for (let x = offset - period; x < width + period; x += period) {
      this.rails.fillStyle(COLORS.cyan, 0.5);
      this.rails.fillRect(x, playTop - 2 * U, dashWidth, 2 * U);
      this.rails.fillStyle(COLORS.coral, 0.5);
      this.rails.fillRect(width - x - dashWidth, playBottom, dashWidth, 2 * U);
    }
  }

  private drawGate(
    graphics: Phaser.GameObjects.Graphics,
    gate: RenderSnapshot['gates'][number],
    xOffset: number,
  ): void {
    const { U, playTop, playBottom } = this.layout;
    const x = gate.x - xOffset;
    const width = GATE_VISUAL_WIDTH * U;
    const left = x - width / 2;
    const gapTop = gate.center - gate.gapHeight / 2;
    const gapBottom = gate.center + gate.gapHeight / 2;
    const topHeight = Math.max(0, gapTop - playTop);
    const bottomHeight = Math.max(0, playBottom - gapBottom);
    const lipColor = this.scoreFlashGate === gate.id && this.scoreFlashMs > 0 ? COLORS.white : COLORS.pale;
    graphics.clear();
    graphics.fillStyle(COLORS.gate, 1);
    graphics.fillRect(left, playTop, width, topHeight);
    graphics.fillRect(left, gapBottom, width, bottomHeight);
    graphics.lineStyle(GATE_OUTLINE_WIDTH * U, COLORS.pale, 0.78);
    if (topHeight > 0) graphics.strokeRect(left, playTop, width, topHeight);
    if (bottomHeight > 0) graphics.strokeRect(left, gapBottom, width, bottomHeight);
    graphics.fillStyle(lipColor, 0.92);
    graphics.fillRect(left, gapTop - GATE_LIP_HEIGHT * U, width, GATE_LIP_HEIGHT * U);
    graphics.fillRect(left, gapBottom, width, GATE_LIP_HEIGHT * U);

    graphics.fillStyle(COLORS.cyan, 0.52);
    for (let node = 0; node < CIRCUIT_NODES_PER_SEGMENT; node += 1) {
      const fraction = (node + 1) / (CIRCUIT_NODES_PER_SEGMENT + 1);
      const nodeX = x + (node % 2 === 0 ? -10 : 10) * U;
      if (topHeight > 28 * U) graphics.fillCircle(nodeX, playTop + topHeight * fraction, 2.2 * U);
      if (bottomHeight > 28 * U) {
        graphics.fillCircle(nodeX, gapBottom + bottomHeight * fraction, 2.2 * U);
      }
    }
  }

  private drawSpark(y: number, velocityY: number, direction: 1 | -1, nowMs: number): void {
    const { U, playerX } = this.layout;
    const color = direction === -1 ? COLORS.cyan : COLORS.coral;
    this.spark.clear();
    this.spark.fillStyle(color, 0.12);
    this.spark.fillEllipse(0, 0, PLAYER_VISUAL_WIDTH * U, PLAYER_VISUAL_HEIGHT * U);
    this.spark.lineStyle(2 * U, color, 0.88);
    this.spark.strokeCircle(0, 0, SPARK_RING_RADIUS * U);
    this.spark.fillStyle(color, 1);
    this.spark.fillCircle(0, 0, SPARK_CORE_RADIUS * U);
    this.spark.fillStyle(COLORS.white, 1);
    this.spark.fillCircle(0, 0, SPARK_CENTER_RADIUS * U);
    this.spark.setPosition(playerX, y);
    const angle = clamp(
      (velocityY / (PLAYER_MAX_SPEED * U)) * PLAYER_MAX_ROTATION_DEG,
      -PLAYER_MAX_ROTATION_DEG,
      PLAYER_MAX_ROTATION_DEG,
    );
    this.spark.setAngle(angle);
    this.spark.setAlpha(1);
    if (this.previousPhase === 'READY') {
      this.spark.y = y + Math.sin(nowMs / 420) * READY_BOB * U;
    }
  }

  private drawEffects(): void {
    this.effects.clear();
    if (this.ringAgeMs < FLIP_RING_MS) {
      const progress = this.ringAgeMs / FLIP_RING_MS;
      this.effects.lineStyle(2 * this.layout.U, COLORS.white, 1 - progress);
      this.effects.strokeCircle(this.ringX, this.ringY, lerp(12, 34, progress) * this.layout.U);
    }
    this.flash.clear();
    if (this.crashAgeMs < HIT_FLASH_MS) {
      this.flash.fillStyle(COLORS.coral, 0.18);
      this.flash.fillRect(0, 0, this.layout.width, this.layout.height);
    }
  }

  private syncText(
    phase: GamePhase,
    score: number,
    best: number,
    newBest: boolean,
    nowMs: number,
  ): void {
    if (score !== this.lastScore) {
      this.scoreText.setText(String(score));
      this.lastScore = score;
    }
    const playingHud = phase === 'PLAYING' || phase === 'DYING';
    this.scoreText.setVisible(playingHud);
    this.titleText.setVisible(phase === 'READY').setText('FLUX FLIP');
    this.bodyText
      .setVisible(phase === 'READY' || phase === 'RESULTS')
      .setText(phase === 'RESULTS' ? 'Tap to retry' : 'Tap to flip gravity');
    this.arrowText
      .setVisible(phase === 'READY')
      .setText(Math.floor(nowMs / READY_ARROW_INTERVAL_MS) % 2 === 0 ? '↑' : '↓');
    this.bestText.setVisible(phase === 'READY').setText(`BEST  ${best}`);
    this.resultLabel.setVisible(phase === 'RESULTS').setText('SCORE');
    this.resultScore.setVisible(phase === 'RESULTS').setText(String(score));
    this.resultBest.setVisible(phase === 'RESULTS').setText(`BEST  ${best}`);
    this.newBestText.setVisible(phase === 'RESULTS' && newBest).setText('NEW BEST');
    this.pausedText.setVisible(phase === 'PAUSED').setText('Paused · tap to continue');

    let scoreScale = 1;
    if (!this.reducedMotion && this.scoreAnimationMs < SCORE_GROW_MS + SCORE_SHRINK_MS) {
      scoreScale =
        this.scoreAnimationMs <= SCORE_GROW_MS
          ? lerp(1, 1.18, this.scoreAnimationMs / SCORE_GROW_MS)
          : lerp(1.18, 1, (this.scoreAnimationMs - SCORE_GROW_MS) / SCORE_SHRINK_MS);
    }
    this.scoreText.setScale(scoreScale);
  }

  public render(
    session: GameSession,
    snapshot: RenderSnapshot | null,
    best: number,
    deltaSeconds: number,
    nowMs: number,
  ): void {
    const phase = session.phase;
    if (phase !== this.previousPhase && phase === 'PLAYING') {
      this.deathScroll = 0;
      this.crashAgeMs = Number.POSITIVE_INFINITY;
      this.spark.setAlpha(1);
    }
    this.previousPhase = phase;
    this.ringAgeMs += deltaSeconds * 1000;
    this.scoreAnimationMs += deltaSeconds * 1000;
    this.scoreFlashMs = Math.max(0, this.scoreFlashMs - deltaSeconds * 1000);
    this.crashAgeMs += deltaSeconds * 1000;
    this.updateMotes(this.particles, deltaSeconds);
    this.updateMotes(this.trails, deltaSeconds);

    if (phase === 'DYING' && session.phaseElapsedMs < DYING_SLOWDOWN_MS) {
      this.deathScroll +=
        this.deathSpeed * (1 - session.phaseElapsedMs / DYING_SLOWDOWN_MS) * deltaSeconds;
    }
    const distance = (snapshot?.worldDistance ?? 0) + this.deathScroll;
    this.drawStars(distance);
    this.drawRails(distance);

    for (let index = 0; index < this.gateGraphics.length; index += 1) {
      const gate = snapshot?.gates[index];
      const graphic = this.gateGraphics[index]!;
      graphic.setVisible(Boolean(gate));
      if (gate) this.drawGate(graphic, gate, this.deathScroll);
    }

    const readyY = (this.layout.playTop + this.layout.playBottom) / 2;
    this.drawSpark(
      snapshot?.playerY ?? readyY,
      snapshot?.playerVelocityY ?? 0,
      snapshot?.direction ?? 1,
      nowMs,
    );
    this.spark.setVisible(phase !== 'RESULTS');
    this.drawMotes(this.trailsGraphic, this.trails);
    this.drawMotes(this.particlesGraphic, this.particles);
    this.drawEffects();
    this.syncText(phase, snapshot?.score ?? 0, best, session.newBest, nowMs);

    const shakeActive = !this.reducedMotion && this.crashAgeMs < SHAKE_MS;
    if (shakeActive) {
      const amount = (1 - this.crashAgeMs / SHAKE_MS) * 5 * this.layout.U;
      const x = (this.nextVisualRandom() * 2 - 1) * amount;
      const y = (this.nextVisualRandom() * 2 - 1) * amount;
      this.scene.cameras.main.setScroll(x, y);
    } else {
      this.scene.cameras.main.setScroll(0, 0);
    }

    this.blocker.clear();
    this.blocker.setVisible(session.landscapeBlocked);
    this.rotateText.setVisible(session.landscapeBlocked).setText('Rotate your phone');
    if (session.landscapeBlocked) {
      this.blocker.fillStyle(COLORS.background, 0.94);
      this.blocker.fillRect(0, 0, this.layout.width, this.layout.height);
    }
  }

  public destroy(): void {
    this.background.destroy();
    this.stars.destroy();
    this.rails.destroy();
    for (const graphics of this.gateGraphics) graphics.destroy();
    this.trailsGraphic.destroy();
    this.spark.destroy();
    this.particlesGraphic.destroy();
    this.effects.destroy();
    this.flash.destroy();
    this.blocker.destroy();
    this.scoreText.destroy();
    this.titleText.destroy();
    this.bodyText.destroy();
    this.arrowText.destroy();
    this.bestText.destroy();
    this.resultLabel.destroy();
    this.resultScore.destroy();
    this.resultBest.destroy();
    this.newBestText.destroy();
    this.pausedText.destroy();
    this.rotateText.destroy();
  }
}
