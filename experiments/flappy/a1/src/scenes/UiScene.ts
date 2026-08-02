import Phaser from 'phaser';
import { WORLD_W } from '../core/constants';
import { bus, type BusEvents } from '../core/events';
import type { Phase } from '../core/types';
import * as audio from '../platform/audio';
import { loadBest } from '../platform/storage';
import {
  getViewport,
  onViewportChange,
  type ViewportState,
} from '../platform/viewport';
import {
  fitText,
  makeText,
  muteButtonRect,
  rectContains,
  screenToUi,
} from '../render/layout';
import { COL, CSS } from '../render/theme';
import { setUiClaim } from '../render/uiClaim';

const POP_TIME = 0.18;
const POP_SCALE = 0.25;
const FLASH_TIME = 0.25;
const CARD_W = 420;
const CARD_H = 340;

/**
 * HUD only. Its camera uses the same k but never scrolls, so every coordinate
 * here is a world unit inside a fixed viewW x viewH box, and cam.shake() on the
 * game camera never touches it.
 */
export class UiScene extends Phaser.Scene {
  private vp: ViewportState = getViewport();
  private phase: Phase = 'ready';
  private score = 0;
  private best = 0;
  private newBest = false;

  private clock = 0;
  private popT = 0;
  private flashT = 0;
  private muted = false;
  /** Resting scale of the score text, which the pop animation multiplies. */
  private scoreScale = 1;

  private scoreText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private promptSubText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;

  private card!: Phaser.GameObjects.Graphics;
  private cardLabel!: Phaser.GameObjects.Text;
  private cardScore!: Phaser.GameObjects.Text;
  private cardBest!: Phaser.GameObjects.Text;
  private cardNewBest!: Phaser.GameObjects.Text;
  private retryText!: Phaser.GameObjects.Text;

  private overlay!: Phaser.GameObjects.Graphics;
  private overlayText!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Graphics;
  private muteIcon!: Phaser.GameObjects.Graphics;

  private unsubscribe: (() => void) | null = null;

  constructor() {
    super('ui');
  }

  create(): void {
    this.vp = getViewport();
    this.best = loadBest();
    this.muted = audio.isMuted();

    this.scoreText = makeText(this, '0').setAlpha(0.9);
    this.titleText = makeText(this, 'NEONFALL');
    this.promptText = makeText(this, 'TAP TO DROP');
    this.promptSubText = makeText(this, 'TAP AGAIN TO TURN').setAlpha(0.7);
    this.bestText = makeText(this, 'BEST 0').setAlpha(0.7);

    this.card = this.add.graphics();
    this.cardLabel = makeText(this, 'SCORE').setAlpha(0.7);
    this.cardScore = makeText(this, '0');
    this.cardBest = makeText(this, 'BEST 0');
    this.cardNewBest = makeText(this, 'NEW BEST!', CSS.hot);
    this.retryText = makeText(this, 'TAP TO RETRY');

    this.overlay = this.add.graphics();
    this.overlayText = makeText(this, 'PAUSED');
    this.flash = this.add.graphics();
    this.muteIcon = this.add.graphics();

    this.layout(this.vp);
    this.applyPhase(this.phase);

    bus.on('phase', this.onPhase);
    bus.on('pass', this.onPass);
    this.unsubscribe = onViewportChange(this.onViewportChange);
    setUiClaim(this.claimPointer);

    this.scene.bringToTop();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    this.clock += dt;

    if (this.popT > 0) {
      this.popT = Math.max(0, this.popT - dt);
      const u = 1 - this.popT / POP_TIME;
      const pop = 1 + POP_SCALE * Math.sin(u * Math.PI);
      this.scoreText.setScale(pop * this.scoreScale);
    }

    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt);
      this.drawFlash();
    }

    if (this.phase === 'ready') {
      const a = 0.75 + 0.25 * Math.sin((this.clock / 1.2) * Math.PI * 2);
      this.promptText.setAlpha(a);
    }
  }

  // ------------------------------------------------------------------- events

  private onPhase = (p: BusEvents['phase']): void => {
    const wasPhase = this.phase;
    this.phase = p.phase;
    this.score = p.score;
    this.best = p.best;
    this.newBest = p.newBest;

    if (p.phase === 'dying' && wasPhase !== 'dying') {
      this.flashT = FLASH_TIME;
    }
    this.applyPhase(p.phase);
  };

  private onPass = (p: BusEvents['pass']): void => {
    this.score = p.score;
    this.scoreText.setText(String(p.score));
    this.refitDynamicText();
    this.popT = POP_TIME;
  };

  private onViewportChange = (vp: ViewportState): void => {
    this.vp = vp;
    this.layout(vp);
    this.applyPhase(this.phase);
  };

  private onShutdown(): void {
    bus.off('phase', this.onPhase);
    bus.off('pass', this.onPass);
    setUiClaim(null);
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** The mute button is the only HUD element that swallows a pointer. */
  private claimPointer = (px: number, py: number): boolean => {
    if (this.phase !== 'ready' && this.phase !== 'dead') return false;
    const p = screenToUi(px, py, this.vp);
    if (!rectContains(muteButtonRect(this.vp), p.x, p.y)) return false;

    this.muted = !this.muted;
    audio.setMuted(this.muted);
    audio.unlock();
    this.drawMuteIcon();
    return true;
  };

  // ------------------------------------------------------------------- layout

  private layout(vp: ViewportState): void {
    const cam = this.cameras.main;
    cam.setSize(vp.gameW, vp.gameH);
    cam.setZoom(vp.k);
    cam.centerOn(WORLD_W / 2, vp.viewH / 2);

    const cx = WORLD_W / 2;
    const k = vp.k;
    // The shaft is the narrowest thing on screen, so lay the HUD out to it and
    // it fits every aspect ratio.
    const wide = WORLD_W - 40;
    const inCard = CARD_W - 48;

    this.scoreText.setPosition(cx, vp.safeTopUnits + 96);
    this.scoreScale = fitText(this.scoreText, 96, k, 4, wide);

    this.titleText.setPosition(cx, 0.16 * vp.viewH);
    fitText(this.titleText, 84, k, 3, wide, CSS.accent);

    this.promptText.setPosition(cx, 0.6 * vp.viewH);
    fitText(this.promptText, 44, k, 0, wide);

    this.promptSubText.setPosition(cx, 0.6 * vp.viewH + 58);
    fitText(this.promptSubText, 32, k, 0, wide);

    this.bestText.setPosition(cx, vp.viewH - vp.safeBottomUnits - 70);
    fitText(this.bestText, 36, k, 0, wide);

    const cardY = 0.42 * vp.viewH;
    this.cardLabel.setPosition(cx, cardY - 120);
    fitText(this.cardLabel, 32, k, 0, inCard);
    this.cardScore.setPosition(cx, cardY - 50);
    fitText(this.cardScore, 110, k, 4, inCard);
    this.cardBest.setPosition(cx, cardY + 58);
    fitText(this.cardBest, 36, k, 0, inCard);
    this.cardNewBest.setPosition(cx, cardY + 118);
    fitText(this.cardNewBest, 40, k, 0, inCard);
    this.retryText.setPosition(cx, cardY + 220);
    fitText(this.retryText, 36, k, 0, wide);

    this.overlayText.setPosition(cx, vp.viewH / 2);
    fitText(this.overlayText, 44, k, 0, wide);

    this.card.clear();
    this.card.fillStyle(COL.card, 0.92);
    this.card.fillRoundedRect(cx - CARD_W / 2, cardY - CARD_H / 2, CARD_W, CARD_H, 22);
    this.card.lineStyle(2, COL.moteHalo, 1);
    this.card.strokeRoundedRect(cx - CARD_W / 2, cardY - CARD_H / 2, CARD_W, CARD_H, 22);

    this.drawMuteIcon();
    this.drawOverlay();
    this.drawFlash();
  }

  /**
   * Re-fits the texts whose content changes during a run. Must run *after* the
   * setText calls, since the width guard measures the rendered string.
   */
  private refitDynamicText(): void {
    const k = this.vp.k;
    this.scoreScale = fitText(this.scoreText, 96, k, 4, WORLD_W - 40);
    fitText(this.bestText, 36, k, 0, WORLD_W - 40);
    fitText(this.cardScore, 110, k, 4, CARD_W - 48);
    fitText(this.cardBest, 36, k, 0, CARD_W - 48);
    fitText(this.overlayText, 44, k, 0, WORLD_W - 40);
  }

  private fullScreenRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: WORLD_W / 2 - this.vp.viewW / 2 - 20,
      y: -20,
      w: this.vp.viewW + 40,
      h: this.vp.viewH + 40,
    };
  }

  private drawOverlay(): void {
    const r = this.fullScreenRect();
    this.overlay.clear();
    this.overlay.fillStyle(COL.letterbox, 0.65);
    this.overlay.fillRect(r.x, r.y, r.w, r.h);
  }

  private drawFlash(): void {
    const r = this.fullScreenRect();
    this.flash.clear();
    if (this.flashT <= 0) {
      this.flash.setVisible(false);
      return;
    }
    this.flash.setVisible(true);
    this.flash.fillStyle(COL.deathFlash, 0.25 * (this.flashT / FLASH_TIME));
    this.flash.fillRect(r.x, r.y, r.w, r.h);
  }

  /** Speaker glyph, drawn rather than loaded — there are no asset files. */
  private drawMuteIcon(): void {
    const r = muteButtonRect(this.vp);
    const g = this.muteIcon;
    g.clear();
    g.setPosition(r.cx, r.cy);

    const col = this.muted ? COL.wall : COL.moteHalo;
    g.fillStyle(col, this.muted ? 0.85 : 1);
    g.fillRect(-16, -7, 9, 14);
    g.fillTriangle(-7, -7, 4, -17, 4, 17);
    g.fillTriangle(-7, -7, 4, 17, -7, 7);

    g.lineStyle(3, col, this.muted ? 0.85 : 1);
    if (this.muted) {
      g.lineBetween(-18, -18, 18, 18);
    } else {
      g.lineBetween(10, -8, 14, -11);
      g.lineBetween(10, 8, 14, 11);
      g.lineBetween(14, -3, 18, -5);
      g.lineBetween(14, 3, 18, 5);
    }
  }

  // -------------------------------------------------------------------- phase

  private applyPhase(phase: Phase): void {
    const ready = phase === 'ready';
    const dead = phase === 'dead';
    const paused = phase === 'paused';
    const running = phase === 'playing' || phase === 'dying' || dead;

    this.scoreText.setText(String(this.score));
    this.scoreText.setVisible(running && !paused);

    this.titleText.setVisible(ready);
    this.promptText.setVisible(ready);
    this.promptSubText.setVisible(ready);
    this.bestText.setVisible(ready);
    this.bestText.setText(`BEST ${this.best}`);

    this.card.setVisible(dead);
    this.cardLabel.setVisible(dead);
    this.cardScore.setVisible(dead);
    this.cardScore.setText(String(this.score));
    this.cardBest.setVisible(dead);
    this.cardBest.setText(`BEST ${this.best}`);
    this.cardNewBest.setVisible(dead && this.newBest);
    this.retryText.setVisible(dead);

    // The card carries the score while dead; no need for the HUD copy too.
    if (dead) this.scoreText.setVisible(false);

    this.overlay.setVisible(paused);
    this.overlayText.setVisible(paused);
    this.overlayText.setText(
      this.vp.isLandscape ? 'ROTATE YOUR DEVICE' : 'PAUSED — TAP TO RESUME',
    );

    this.muteIcon.setVisible((ready || dead) && !paused);

    if (ready) this.promptText.setAlpha(1);
    this.refitDynamicText();
  }
}
