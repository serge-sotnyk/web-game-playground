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
import { mulberry32 } from '../core/rng';
import type { Barrier, GameEvent } from '../core/types';
import { audio } from '../platform/audio';
import { vibrate } from '../platform/haptics';
import { loadBest, saveBest } from '../platform/storage';
import { getViewport, type ViewportState } from '../platform/viewport';
import { pointHitsMute } from '../render/layout';
import { COLORS } from '../render/theme';

interface Star {
  image: Phaser.GameObjects.Image;
  x: number;
  base01: number;
}

interface BarrierSlot {
  graphics: Phaser.GameObjects.Graphics;
  index: number;
}

interface Particle {
  image: Phaser.GameObjects.Image;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
}

interface WallFlash {
  side: 'left' | 'right';
  y: number;
  life: number;
}

interface GapFlash {
  gapL: number;
  gapR: number;
  y: number;
  life: number;
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private viewport!: ViewportState;
  private accumulator = 0;
  private background!: Phaser.GameObjects.Graphics;
  private mote!: Phaser.GameObjects.Image;
  private stars: Star[] = [];
  private barrierSlots: BarrierSlot[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private wallFlashes: WallFlash[] = [];
  private gapFlashes: GapFlash[] = [];
  private effects!: Phaser.GameObjects.Graphics;
  private deathFlash!: Phaser.GameObjects.Graphics;
  private deathFlashT = 0;
  private trailT = 0;
  private squashT = 0;
  private readonly visualRng = mulberry32(0x4e454f4e);

  private readonly visibilityHandler = (): void => {
    if (document.hidden && this.state.phase === 'playing') {
      this.state.requestPause();
    } else if (!document.hidden) {
      this.accumulator = 0;
    }
  };

  private readonly blurHandler = (): void => {
    if (this.state.phase === 'playing') this.state.requestPause();
  };

  constructor() {
    super('game');
  }

  create(): void {
    this.viewport = getViewport();
    this.state = new GameState({
      seed: Date.now() | 0,
      viewH: this.viewport.viewH,
      best: loadBest(),
    });

    this.background = this.add.graphics().setDepth(-30);
    this.createStars();
    this.createBarrierPool();
    this.effects = this.add.graphics().setDepth(8);
    this.deathFlash = this.add.graphics().setDepth(20);
    this.mote = this.add.image(this.state.orb.x, this.state.orb.y, 'mote');
    this.mote.setDisplaySize(72, 72).setDepth(6);
    this.createParticlePool();

    this.applyViewport();
    if (this.viewport.isLandscape) this.state.requestPause();

    this.input.on('pointerdown', this.handlePointer, this);
    this.input.keyboard?.addCapture(['SPACE', 'LEFT', 'RIGHT']);
    this.input.keyboard?.on('keydown-SPACE', this.handleKeyboard, this);
    this.input.keyboard?.on('keydown-LEFT', this.handleKeyboard, this);
    this.input.keyboard?.on('keydown-RIGHT', this.handleKeyboard, this);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    window.addEventListener('blur', this.blurHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.syncRegistry();
  }

  update(_time: number, delta: number): void {
    const frameDt = Math.min(delta / 1000, MAX_FRAME_DT);
    this.accumulator += frameDt;
    let iterations = 0;
    while (this.accumulator >= DT && iterations < 12) {
      const events = this.state.step(DT);
      events.forEach((event) => this.dispatch(event));
      this.accumulator -= DT;
      iterations += 1;
    }
    if (iterations === 12 && this.accumulator >= DT) this.accumulator %= DT;

    this.cameras.main.centerOn(
      WORLD_W / 2,
      this.state.cameraTopY + this.viewport.viewH / 2,
    );
    this.syncWorld(frameDt);
    this.syncRegistry();
  }

  private createStars(): void {
    const rng = mulberry32(0x53544152);
    for (let index = 0; index < 60; index += 1) {
      const scale = 0.1 + rng() * 0.25;
      const image = this.add.image(0, 0, 'spark');
      image.setScale(scale).setAlpha(0.25 + rng() * 0.45).setDepth(-15);
      this.stars.push({ image, x: -60 + rng() * 660, base01: rng() });
    }
  }

  private createBarrierPool(): void {
    for (let index = 0; index < 8; index += 1) {
      this.barrierSlots.push({
        graphics: this.add.graphics().setDepth(0).setVisible(false),
        index: -1,
      });
    }
  }

  private createParticlePool(): void {
    for (let index = 0; index < 48; index += 1) {
      this.particles.push({
        image: this.add.image(0, 0, 'spark').setDepth(4).setVisible(false),
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size0: 0,
        size1: 0,
      });
    }
  }

  private handlePointer(pointer: Phaser.Input.Pointer): void {
    audio.unlock();
    this.handleAction(pointer);
  }

  private handleKeyboard(): void {
    audio.unlock();
    this.handleAction();
  }

  private handleAction(pointer?: Phaser.Input.Pointer): void {
    if (this.viewport.isLandscape && this.state.phase !== 'paused') return;
    if (this.state.phase === 'paused') {
      if (!this.viewport.isLandscape) {
        this.state.requestResume();
        this.accumulator = 0;
      }
      return;
    }
    if (this.state.phase === 'dying') return;

    if (
      pointer &&
      (this.state.phase === 'ready' || this.state.phase === 'dead') &&
      pointHitsMute(
        WORLD_W / 2 + (pointer.x - this.viewport.gameW / 2) / this.viewport.k,
        pointer.y / this.viewport.k,
        this.viewport,
      )
    ) {
      audio.toggleMuted();
      return;
    }

    if (this.state.phase === 'dead') {
      this.state.reset(Date.now() | 0);
      return;
    }
    this.state.tap();
  }

  private handleResize(): void {
    this.viewport = getViewport();
    this.state.setViewHeight(this.viewport.viewH);
    this.applyViewport();
    if (this.viewport.isLandscape) this.state.requestPause();
    this.accumulator = 0;
  }

  private applyViewport(): void {
    this.cameras.main.setZoom(this.viewport.k);
    this.cameras.main.centerOn(
      WORLD_W / 2,
      this.state.cameraTopY + this.viewport.viewH / 2,
    );
    this.redrawBackground();
  }

  private redrawBackground(): void {
    const left = WORLD_W / 2 - this.viewport.viewW / 2;
    this.background.clear();
    this.background.fillStyle(COLORS.outside, 1);
    this.background.fillRect(left, 0, this.viewport.viewW, this.viewport.viewH);
    this.background.fillStyle(COLORS.shaft, 1);
    this.background.fillRect(0, 0, WORLD_W, this.viewport.viewH);
    this.background.fillStyle(COLORS.wall, 1);
    this.background.fillRect(-2, 0, 4, this.viewport.viewH);
    this.background.fillRect(WORLD_W - 2, 0, 4, this.viewport.viewH);
  }

  private syncWorld(frameDt: number): void {
    const cameraTop = this.state.cameraTopY;
    this.background.setPosition(0, cameraTop);
    const starSpan = this.viewport.viewH + 80;
    for (const star of this.stars) {
      star.image.setPosition(
        star.x,
        cameraTop + positiveModulo(star.base01 * starSpan - 0.25 * cameraTop, starSpan),
      );
    }

    this.syncBarriers();
    this.updateParticles(frameDt);
    this.updateEffects(frameDt);

    if (this.state.phase === 'playing') {
      this.trailT += frameDt;
      while (this.trailT >= 0.03) {
        this.trailT -= 0.03;
        this.spawnParticle(this.state.orb.x, this.state.orb.y, 0, 0, 0.35, 24, 6);
      }
    } else {
      this.trailT = 0;
    }

    this.squashT = Math.max(0, this.squashT - frameDt);
    const squashProgress = this.squashT / 0.12;
    const amount = Math.sin(Math.PI * squashProgress);
    this.mote
      .setPosition(this.state.orb.x, this.state.orb.y)
      .setDisplaySize(72 * (1 - 0.25 * amount), 72 * (1 + 0.25 * amount));
  }

  private syncBarriers(): void {
    const visible = this.state.barriers
      .filter(
        (barrier) =>
          barrier.y + BAND_H >= this.state.cameraTopY - 30 &&
          barrier.y <= this.state.cameraTopY + this.viewport.viewH + 30,
      )
      .slice(0, 8);

    for (let slotIndex = 0; slotIndex < this.barrierSlots.length; slotIndex += 1) {
      const slot = this.barrierSlots[slotIndex];
      const barrier = visible[slotIndex];
      if (!barrier) {
        slot.graphics.setVisible(false);
        slot.index = -1;
        continue;
      }
      if (slot.index !== barrier.index) {
        this.drawBarrier(slot.graphics, barrier);
        slot.index = barrier.index;
      }
      slot.graphics.setPosition(0, barrier.y).setVisible(true);
    }
  }

  private drawBarrier(graphics: Phaser.GameObjects.Graphics, barrier: Barrier): void {
    const leftWidth = barrier.gapL;
    const rightWidth = WORLD_W - barrier.gapR;
    graphics.clear();
    graphics.fillStyle(COLORS.barrier, 0.35);
    graphics.fillRect(-10, -10, leftWidth + 20, BAND_H + 20);
    graphics.fillRect(barrier.gapR - 10, -10, rightWidth + 20, BAND_H + 20);
    graphics.fillStyle(COLORS.barrier, 1);
    graphics.fillRoundedRect(0, 0, leftWidth, BAND_H, { tr: 8, br: 8 });
    graphics.fillRoundedRect(barrier.gapR, 0, rightWidth, BAND_H, { tl: 8, bl: 8 });
    graphics.fillStyle(COLORS.barrierEdge, 1);
    graphics.fillRect(0, 0, leftWidth, 3);
    graphics.fillRect(barrier.gapR, 0, rightWidth, 3);
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        particle.image.setVisible(false);
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      const t = 1 - particle.life / particle.maxLife;
      const size = particle.size0 + (particle.size1 - particle.size0) * t;
      particle.image
        .setPosition(particle.x, particle.y)
        .setDisplaySize(size, size)
        .setAlpha(0.9 * (1 - t));
    }
  }

  private spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size0: number,
    size1: number,
  ): void {
    const particle = this.particles.find((candidate) => !candidate.active);
    if (!particle) return;
    Object.assign(particle, { active: true, x, y, vx, vy, life, maxLife: life, size0, size1 });
    particle.image.setPosition(x, y).setDisplaySize(size0, size0).setAlpha(0.9).setVisible(true);
  }

  private updateEffects(dt: number): void {
    this.effects.clear();
    this.rings = this.rings.filter((ring) => {
      ring.life -= dt;
      if (ring.life <= 0) return false;
      const t = 1 - ring.life / ring.maxLife;
      this.effects.lineStyle(3, COLORS.cyan, 0.8 * (1 - t));
      this.effects.strokeCircle(ring.x, ring.y, R_VIS + (R_VIS * 2.6 - R_VIS) * t);
      return true;
    });

    this.wallFlashes = this.wallFlashes.filter((flash) => {
      flash.life -= dt;
      if (flash.life <= 0) return false;
      this.effects.fillStyle(COLORS.wallFlash, flash.life / 0.2);
      const x = flash.side === 'left' ? -5 : WORLD_W - 5;
      this.effects.fillRect(x, flash.y - 48, 10, 96);
      return true;
    });

    this.gapFlashes = this.gapFlashes.filter((flash) => {
      flash.life -= dt;
      if (flash.life <= 0) return false;
      this.effects.fillStyle(COLORS.white, flash.life / 0.15);
      this.effects.fillRect(flash.gapL - 3, flash.y - 3, 6, BAND_H + 6);
      this.effects.fillRect(flash.gapR - 3, flash.y - 3, 6, BAND_H + 6);
      return true;
    });

    this.deathFlashT = Math.max(0, this.deathFlashT - dt);
    this.deathFlash.clear();
    if (this.deathFlashT > 0) {
      const left = WORLD_W / 2 - this.viewport.viewW / 2;
      this.deathFlash.setPosition(0, this.state.cameraTopY);
      this.deathFlash.fillStyle(COLORS.barrier, this.deathFlashT / 0.25 / 4);
      this.deathFlash.fillRect(left, 0, this.viewport.viewW, this.viewport.viewH);
    }
  }

  private dispatch(event: GameEvent): void {
    bus.emit(event);
    switch (event.type) {
      case 'flip':
        this.rings.push({ x: event.x, y: event.y, life: 0.18, maxLife: 0.18 });
        audio.blip();
        break;
      case 'bounce':
        this.wallFlashes.push({ side: event.side, y: event.y, life: 0.2 });
        this.squashT = 0.12;
        audio.tick();
        break;
      case 'pass': {
        audio.ping(event.score, event.nearMiss);
        if (event.nearMiss) {
          const barrier = this.state.barriers.find((item) => item.index === event.index);
          if (barrier) {
            this.gapFlashes.push({
              gapL: barrier.gapL,
              gapR: barrier.gapR,
              y: barrier.y,
              life: 0.15,
            });
          }
        }
        break;
      }
      case 'death':
        this.cameras.main.shake(300, 0.01);
        this.deathFlashT = 0.25;
        this.mote.setVisible(false);
        for (let index = 0; index < 18; index += 1) {
          const angle = (index / 18) * Math.PI * 2 + this.visualRng() * 0.18;
          const speed = 220 + this.visualRng() * 200;
          this.spawnParticle(
            event.x,
            event.y,
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            0.8,
            28,
            4,
          );
        }
        audio.boom();
        vibrate(18);
        if (event.newBest) saveBest(event.best);
        this.registry.set('newBest', event.newBest);
        break;
      case 'reset':
        this.mote.setVisible(true);
        this.registry.set('newBest', false);
        break;
      case 'resume':
        this.accumulator = 0;
        break;
      default:
        break;
    }
  }

  private syncRegistry(): void {
    this.registry.set('phase', this.state.phase);
    this.registry.set('score', this.state.score);
    this.registry.set('best', this.state.best);
    this.registry.set('isLandscape', this.viewport.isLandscape);
  }

  private shutdown(): void {
    this.input.off('pointerdown', this.handlePointer, this);
    this.input.keyboard?.off('keydown-SPACE', this.handleKeyboard, this);
    this.input.keyboard?.off('keydown-LEFT', this.handleKeyboard, this);
    this.input.keyboard?.off('keydown-RIGHT', this.handleKeyboard, this);
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    window.removeEventListener('blur', this.blurHandler);
  }
}
