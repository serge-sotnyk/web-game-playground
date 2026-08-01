import Phaser from 'phaser';
import {
  BAND_H,
  DT,
  MAX_FRAME_DT,
  R_VIS,
  WORLD_W,
} from '../core/constants';
import { bus } from '../core/events';
import { GameState } from '../core/gameState';
import type { Barrier, GameEvent, Phase } from '../core/types';
import * as audio from '../platform/audio';
import { vibrate } from '../platform/haptics';
import { loadBest, saveBest } from '../platform/storage';
import {
  getViewport,
  onViewportChange,
  type ViewportState,
} from '../platform/viewport';
import { COL } from '../render/theme';
import { TEX_MOTE, TEX_SPARK, TEX_STAR } from '../render/textures';
import { uiClaims } from '../render/uiClaim';

const STAR_COUNT = 60;
const BARRIER_SLOTS = 8;
const SPARK_COUNT = 48;
const MAX_STEPS_PER_FRAME = 12;

const TRAIL_INTERVAL = 0.03;
const RING_TIME = 0.18;
const BOUNCE_MARK_TIME = 0.2;
const EDGE_FLASH_TIME = 0.15;
const SQUASH_TIME = 0.12;

const DEPTH = {
  bg: 0,
  stars: 1,
  barriers: 2,
  sparks: 3,
  mote: 4,
  effects: 5,
} as const;

interface Spark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
  img: Phaser.GameObjects.Image;
}

interface Star {
  fx: number;
  fb: number;
  img: Phaser.GameObjects.Image;
}

interface Ring {
  x: number;
  y: number;
  t: number;
}

interface BounceMark {
  side: 'left' | 'right';
  y: number;
  t: number;
}

interface EdgeFlash {
  y: number;
  gapL: number;
  gapR: number;
  t: number;
}

function posMod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * Background, stars, barriers, mote, particles and the frame loop. Owns the
 * GameState but contains no game rules: it reads state and reacts to events.
 */
export class GameScene extends Phaser.Scene {
  private vp: ViewportState = getViewport();
  private sim!: GameState;
  private acc = 0;
  private announced = false;
  private lastPhase: Phase = 'ready';
  private lastNewBest = false;

  private bg!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private mote!: Phaser.GameObjects.Image;
  private moteBaseScale = 1;

  private stars: Star[] = [];
  private slots: Phaser.GameObjects.Graphics[] = [];
  private slotIndex: number[] = [];
  private sparks: Spark[] = [];
  private sparkCursor = 0;

  private rings: Ring[] = [];
  private bounceMarks: BounceMark[] = [];
  private edgeFlashes: EdgeFlash[] = [];
  private trailT = 0;
  private squashT = 0;

  private unsubscribe: (() => void) | null = null;

  constructor() {
    super('game');
  }

  create(): void {
    // Class fields survive a scene restart; the display objects do not.
    this.stars.length = 0;
    this.slots.length = 0;
    this.slotIndex.length = 0;
    this.sparks.length = 0;
    this.sparkCursor = 0;
    this.announced = false;
    this.clearEffects();

    this.vp = getViewport();
    this.sim = new GameState({
      seed: Date.now() | 0,
      viewH: this.vp.viewH,
      best: loadBest(),
    });
    this.lastPhase = this.sim.phase;

    this.bg = this.add.graphics().setDepth(DEPTH.bg);

    for (let i = 0; i < STAR_COUNT; i++) {
      const img = this.add
        .image(0, 0, TEX_STAR)
        .setDepth(DEPTH.stars)
        .setScale(0.1 + Math.random() * 0.25)
        .setAlpha(0.25 + Math.random() * 0.45);
      this.stars.push({ fx: Math.random(), fb: Math.random(), img });
    }

    for (let i = 0; i < BARRIER_SLOTS; i++) {
      this.slots.push(this.add.graphics().setDepth(DEPTH.barriers).setVisible(false));
      this.slotIndex.push(-1);
    }

    for (let i = 0; i < SPARK_COUNT; i++) {
      const img = this.add
        .image(0, 0, TEX_SPARK)
        .setDepth(DEPTH.sparks)
        .setVisible(false);
      this.sparks.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        s0: 24,
        s1: 6,
        a0: 0.9,
        a1: 0,
        img,
      });
    }

    this.mote = this.add.image(0, 0, TEX_MOTE).setDepth(DEPTH.mote);
    this.mote.setDisplaySize(R_VIS * 4, R_VIS * 4);
    this.moteBaseScale = this.mote.scaleX;

    this.fx = this.add.graphics().setDepth(DEPTH.effects);

    this.applyViewport(this.vp);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.keyboard?.on('keydown-SPACE', this.onTapInput, this);
    this.input.keyboard?.on('keydown-LEFT', this.onArrowLeft, this);
    this.input.keyboard?.on('keydown-RIGHT', this.onArrowRight, this);

    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.unsubscribe = onViewportChange(this.onViewportChange);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  /**
   * Fixed 120 Hz simulation with a real-time render pass. A 60 Hz phone runs
   * exactly two steps per frame and a 120 Hz phone one, so no interpolation is
   * needed; the effect timers advance on the real (capped) frame delta.
   */
  override update(_time: number, delta: number): void {
    if (!this.announced) {
      this.announced = true;
      this.emitPhase();
    }

    const frameDt = Math.min(delta / 1000, MAX_FRAME_DT);
    this.acc += frameDt;

    let steps = 0;
    while (this.acc >= DT && steps < MAX_STEPS_PER_FRAME) {
      const events = this.sim.step(DT);
      for (const ev of events) this.handleEvent(ev);
      this.acc -= DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.acc = 0;

    if (this.sim.phase !== this.lastPhase) {
      this.lastPhase = this.sim.phase;
      this.emitPhase();
    }

    this.cameras.main.centerOn(
      WORLD_W / 2,
      this.sim.cameraTopY + this.vp.viewH / 2,
    );

    this.advanceEffects(frameDt);
    this.syncSprites();
  }

  // ------------------------------------------------------------------- events

  private handleEvent(ev: GameEvent): void {
    switch (ev.type) {
      case 'start':
        this.trailT = 0;
        break;

      case 'flip':
        this.rings.push({ x: ev.x, y: ev.y, t: 0 });
        audio.blip();
        break;

      case 'bounce':
        this.bounceMarks.push({ side: ev.side, y: ev.y, t: 0 });
        this.squashT = SQUASH_TIME;
        audio.tick();
        break;

      case 'pass': {
        if (ev.nearMiss) {
          const b = this.sim.barriers.find((x) => x.index === ev.index);
          if (b) {
            this.edgeFlashes.push({ y: b.y, gapL: b.gapL, gapR: b.gapR, t: 0 });
          }
          audio.nearMiss(ev.score);
        } else {
          audio.ping(ev.score);
        }
        bus.emit('pass', { score: ev.score, nearMiss: ev.nearMiss });
        break;
      }

      case 'death':
        this.lastNewBest = ev.newBest;
        if (ev.newBest) saveBest(ev.best);
        this.mote.setVisible(false);
        this.burst(ev.x, ev.y);
        this.cameras.main.shake(300, 0.01);
        audio.boom();
        vibrate(18);
        break;

      case 'reset':
        this.lastNewBest = false;
        this.acc = 0;
        this.mote.setVisible(true);
        this.clearEffects();
        break;

      case 'resume':
        this.acc = 0;
        break;

      case 'dead':
      case 'pause':
        break;
    }
  }

  private emitPhase(): void {
    bus.emit('phase', {
      phase: this.sim.phase,
      score: this.sim.score,
      best: this.sim.best,
      newBest: this.lastNewBest,
    });
  }

  // -------------------------------------------------------------------- input

  private onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    // Landscape is a hard stop: no resume, no flip, no restart.
    if (this.vp.isLandscape) return;
    if (this.sim.phase === 'paused') {
      this.sim.requestResume();
      return;
    }
    if (this.sim.phase === 'dying') return;
    if (uiClaims(pointer.x, pointer.y)) return;

    audio.unlock();
    this.sim.tap();
  };

  private onTapInput = (): void => {
    if (this.vp.isLandscape) return;
    if (this.sim.phase === 'paused') {
      this.sim.requestResume();
      return;
    }
    if (this.sim.phase === 'dying') return;
    audio.unlock();
    this.sim.tap();
  };

  private onArrowLeft = (): void => this.onArrow(-1);
  private onArrowRight = (): void => this.onArrow(1);

  /** Desktop convenience: an arrow only costs a tap when it changes direction. */
  private onArrow(dir: -1 | 1): void {
    if (this.sim.phase === 'playing' && this.sim.orb.dir === dir) return;
    this.onTapInput();
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.sim.requestPause();
    else this.acc = 0;
  };

  private onBlur = (): void => {
    this.sim.requestPause();
  };

  private onViewportChange = (vp: ViewportState): void => {
    this.vp = vp;
    this.sim.setViewHeight(vp.viewH);
    if (vp.isLandscape) this.sim.requestPause();
    this.applyViewport(vp);
  };

  private onShutdown(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // ------------------------------------------------------------------- layout

  private applyViewport(vp: ViewportState): void {
    const cam = this.cameras.main;
    cam.setSize(vp.gameW, vp.gameH);
    cam.setZoom(vp.k);
    cam.centerOn(WORLD_W / 2, this.sim.cameraTopY + vp.viewH / 2);

    this.drawBackground(vp);

    const spread = vp.viewW + 40;
    const left = WORLD_W / 2 - spread / 2;
    for (const star of this.stars) {
      star.img.x = left + star.fx * spread;
    }

    // Force every slot to redraw: gap geometry is unchanged, but a slot that
    // was hidden must come back with the right band.
    for (let i = 0; i < this.slotIndex.length; i++) this.slotIndex[i] = -1;
  }

  private drawBackground(vp: ViewportState): void {
    const g = this.bg;
    g.clear();

    const top = -80;
    const height = vp.viewH + 200;
    const left = WORLD_W / 2 - vp.viewW / 2;

    g.fillStyle(COL.letterbox, 1);
    g.fillRect(left, top, vp.viewW, height);

    g.fillStyle(COL.shaft, 1);
    g.fillRect(0, top, WORLD_W, height);

    g.fillStyle(COL.wall, 1);
    g.fillRect(-2, top, 4, height);
    g.fillRect(WORLD_W - 2, top, 4, height);
  }

  // ----------------------------------------------------------------- graphics

  private syncSprites(): void {
    const { cameraTopY, orb, barriers } = this.sim;
    const viewH = this.vp.viewH;

    this.bg.setPosition(0, cameraTopY);

    const wrap = viewH + 80;
    for (const star of this.stars) {
      const base = star.fb * wrap;
      star.img.y = cameraTopY + posMod(base - 0.25 * cameraTopY, wrap);
    }

    for (let i = 0; i < BARRIER_SLOTS; i++) {
      const slot = this.slots[i];
      const barrier: Barrier | undefined = barriers[i];
      if (!barrier) {
        if (this.slotIndex[i] !== -1) {
          this.slotIndex[i] = -1;
          slot.setVisible(false);
        }
        continue;
      }
      if (this.slotIndex[i] !== barrier.index) {
        this.slotIndex[i] = barrier.index;
        this.drawBarrier(slot, barrier);
        slot.setVisible(true);
      }
      slot.setPosition(0, barrier.y);
    }

    this.mote.setPosition(orb.x, orb.y);

    if (this.squashT > 0) {
      const u = 1 - this.squashT / SQUASH_TIME;
      // Out and back within the window.
      const bend = Math.sin(u * Math.PI);
      this.mote.setScale(
        this.moteBaseScale * (1 - 0.25 * bend),
        this.moteBaseScale * (1 + 0.25 * bend),
      );
    } else {
      this.mote.setScale(this.moteBaseScale);
    }

    this.drawEffects();
  }

  private drawBarrier(g: Phaser.GameObjects.Graphics, b: Barrier): void {
    g.clear();

    const overhang = 8;
    const leftX = -overhang;
    const leftW = b.gapL + overhang;
    const rightX = b.gapR;
    const rightW = WORLD_W - b.gapR + overhang;

    g.fillStyle(COL.barrier, 0.35);
    g.fillRect(leftX - 10, -10, leftW + 20, BAND_H + 20);
    g.fillRect(rightX - 10, -10, rightW + 20, BAND_H + 20);

    g.fillStyle(COL.barrier, 1);
    g.fillRoundedRect(leftX, 0, leftW, BAND_H, { tl: 0, bl: 0, tr: 8, br: 8 });
    g.fillRoundedRect(rightX, 0, rightW, BAND_H, { tl: 8, bl: 8, tr: 0, br: 0 });

    g.fillStyle(COL.barrierEdge, 1);
    g.fillRect(leftX, 0, leftW - 8, 3);
    g.fillRect(rightX + 8, 0, rightW - 8, 3);
    g.fillRect(b.gapL - 3, 0, 3, BAND_H);
    g.fillRect(b.gapR, 0, 3, BAND_H);
  }

  private drawEffects(): void {
    const g = this.fx;
    g.clear();

    for (const r of this.rings) {
      const u = r.t / RING_TIME;
      const radius = R_VIS + (R_VIS * 2.6 - R_VIS) * u;
      g.lineStyle(3, COL.moteHalo, 0.8 * (1 - u));
      g.strokeCircle(r.x, r.y, radius);
    }

    for (const m of this.bounceMarks) {
      const u = m.t / BOUNCE_MARK_TIME;
      const x = m.side === 'left' ? -5 : WORLD_W - 5;
      g.fillStyle(COL.wallFlash, 0.9 * (1 - u));
      g.fillRect(x, m.y - 60, 10, 120);
    }

    for (const f of this.edgeFlashes) {
      const u = f.t / EDGE_FLASH_TIME;
      g.fillStyle(0xffffff, 0.9 * (1 - u));
      g.fillRect(f.gapL - 4, f.y - 2, 4, BAND_H + 4);
      g.fillRect(f.gapR, f.y - 2, 4, BAND_H + 4);
    }
  }

  // ---------------------------------------------------------------- particles

  private advanceEffects(dt: number): void {
    if (this.sim.phase === 'playing') {
      this.trailT += dt;
      while (this.trailT >= TRAIL_INTERVAL) {
        this.trailT -= TRAIL_INTERVAL;
        this.spawnSpark(this.sim.orb.x, this.sim.orb.y, 0, 0, 0.35, 24, 6, 0.9, 0);
      }
    } else {
      this.trailT = 0;
    }

    if (this.squashT > 0) this.squashT = Math.max(0, this.squashT - dt);

    for (const s of this.sparks) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.img.setVisible(false);
        continue;
      }
      const u = 1 - s.life / s.maxLife;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const size = s.s0 + (s.s1 - s.s0) * u;
      s.img.setPosition(s.x, s.y);
      s.img.setDisplaySize(size, size);
      s.img.setAlpha(s.a0 + (s.a1 - s.a0) * u);
    }

    this.rings = advanceTimers(this.rings, dt, RING_TIME);
    this.bounceMarks = advanceTimers(this.bounceMarks, dt, BOUNCE_MARK_TIME);
    this.edgeFlashes = advanceTimers(this.edgeFlashes, dt, EDGE_FLASH_TIME);
  }

  private spawnSpark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    s0: number,
    s1: number,
    a0: number,
    a1: number,
  ): void {
    let slot: Spark | undefined;
    for (let i = 0; i < SPARK_COUNT; i++) {
      const candidate = this.sparks[(this.sparkCursor + i) % SPARK_COUNT];
      if (!candidate.active) {
        slot = candidate;
        this.sparkCursor = (this.sparkCursor + i + 1) % SPARK_COUNT;
        break;
      }
    }
    // Pool exhausted: recycle whatever the cursor is pointing at.
    if (!slot) {
      slot = this.sparks[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % SPARK_COUNT;
    }

    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.life = life;
    slot.maxLife = life;
    slot.s0 = s0;
    slot.s1 = s1;
    slot.a0 = a0;
    slot.a1 = a1;
    slot.img.setPosition(x, y);
    slot.img.setDisplaySize(s0, s0);
    slot.img.setAlpha(a0);
    slot.img.setVisible(true);
  }

  private burst(x: number, y: number): void {
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
      const speed = 220 + Math.random() * 200;
      this.spawnSpark(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        0.8,
        26,
        4,
        1,
        0,
      );
    }
  }

  private clearEffects(): void {
    for (const s of this.sparks) {
      s.active = false;
      s.img.setVisible(false);
    }
    this.rings.length = 0;
    this.bounceMarks.length = 0;
    this.edgeFlashes.length = 0;
    this.trailT = 0;
    this.squashT = 0;
  }
}

function advanceTimers<T extends { t: number }>(
  list: T[],
  dt: number,
  limit: number,
): T[] {
  if (list.length === 0) return list;
  const kept: T[] = [];
  for (const item of list) {
    item.t += dt;
    if (item.t < limit) kept.push(item);
  }
  return kept;
}
