import Phaser from 'phaser';
import { WORLD_W } from '../core/constants';
import { bus } from '../core/events';
import type { GameEvent, Phase } from '../core/types';
import { audio } from '../platform/audio';
import { getViewport, type ViewportState } from '../platform/viewport';
import { muteCenter, setCrispText } from '../render/layout';
import { COLORS, FONT_FAMILY } from '../render/theme';

type PassEvent = Extract<GameEvent, { type: 'pass' }>;

export class UiScene extends Phaser.Scene {
  private viewport!: ViewportState;
  private scoreText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private promptDetailText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.Graphics;
  private cardLabel!: Phaser.GameObjects.Text;
  private cardScore!: Phaser.GameObjects.Text;
  private cardBest!: Phaser.GameObjects.Text;
  private newBestText!: Phaser.GameObjects.Text;
  private retryText!: Phaser.GameObjects.Text;
  private muteButton!: Phaser.GameObjects.Graphics;
  private pauseOverlay!: Phaser.GameObjects.Graphics;
  private pauseText!: Phaser.GameObjects.Text;
  private scorePopT = 0;
  private lastMuted: boolean | null = null;

  private readonly passHandler = (_event: PassEvent): void => {
    this.scorePopT = 0.18;
  };

  constructor() {
    super('ui');
  }

  create(): void {
    this.viewport = getViewport();
    const centeredStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: FONT_FAMILY,
      color: COLORS.text,
      align: 'center',
    };
    this.scoreText = this.add.text(0, 0, '0', {
      ...centeredStyle,
      stroke: COLORS.panelText,
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.titleText = this.add.text(0, 0, 'NEONFALL', {
      ...centeredStyle,
      stroke: COLORS.cyanText,
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.promptText = this.add.text(0, 0, 'TAP TO DROP', centeredStyle).setOrigin(0.5);
    this.promptDetailText = this.add
      .text(0, 0, 'TAP AGAIN TO TURN', centeredStyle)
      .setOrigin(0.5)
      .setAlpha(0.7);
    this.bestText = this.add.text(0, 0, 'BEST 0', centeredStyle).setOrigin(0.5).setAlpha(0.7);

    this.card = this.add.graphics();
    this.cardLabel = this.add.text(0, 0, 'SCORE', centeredStyle).setOrigin(0.5).setAlpha(0.7);
    this.cardScore = this.add.text(0, 0, '0', centeredStyle).setOrigin(0.5);
    this.cardBest = this.add.text(0, 0, 'BEST 0', centeredStyle).setOrigin(0.5);
    this.newBestText = this.add
      .text(0, 0, 'NEW BEST!', { ...centeredStyle, color: COLORS.pinkText })
      .setOrigin(0.5);
    this.retryText = this.add.text(0, 0, 'TAP TO RETRY', centeredStyle).setOrigin(0.5);
    this.muteButton = this.add.graphics();
    this.pauseOverlay = this.add.graphics();
    this.pauseText = this.add.text(0, 0, '', centeredStyle).setOrigin(0.5);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    bus.on('pass', this.passHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    this.layout();
  }

  update(_time: number, delta: number): void {
    const phase = (this.registry.get('phase') as Phase | undefined) ?? 'ready';
    const score = (this.registry.get('score') as number | undefined) ?? 0;
    const best = (this.registry.get('best') as number | undefined) ?? 0;
    const isLandscape = Boolean(this.registry.get('isLandscape'));
    const isNewBest = Boolean(this.registry.get('newBest'));
    const isPaused = phase === 'paused' || isLandscape;
    const isReady = phase === 'ready' && !isPaused;
    const isDead = phase === 'dead' && !isPaused;

    this.scoreText.setText(String(score)).setVisible(
      !isPaused && (phase === 'playing' || phase === 'dying' || isDead),
    );
    this.titleText.setVisible(isReady);
    this.promptText.setVisible(isReady);
    this.promptDetailText.setVisible(isReady);
    this.bestText.setText(`BEST ${best}`).setVisible(isReady);
    this.card.setVisible(isDead);
    this.cardLabel.setVisible(isDead);
    this.cardScore.setText(String(score)).setVisible(isDead);
    this.cardBest.setText(`BEST ${best}`).setVisible(isDead);
    this.newBestText.setVisible(isDead && isNewBest);
    this.retryText.setVisible(isDead);
    this.muteButton.setVisible(isReady || isDead);
    this.pauseOverlay.setVisible(isPaused);
    this.pauseText
      .setText(isLandscape ? 'ROTATE YOUR DEVICE' : 'PAUSED — TAP TO RESUME')
      .setVisible(isPaused);

    if (isReady) {
      this.promptText.setAlpha(0.75 + Math.sin(performance.now() * (Math.PI * 2 / 1200)) * 0.25);
    }

    this.scorePopT = Math.max(0, this.scorePopT - delta / 1000);
    const pop = this.scorePopT > 0
      ? 1 + 0.25 * Math.sin(Math.PI * (this.scorePopT / 0.18))
      : 1;
    this.scoreText.setScale(pop / this.viewport.k);

    if (this.lastMuted !== audio.isMuted()) this.drawMuteButton();
  }

  private handleResize(): void {
    this.viewport = getViewport();
    this.layout();
  }

  private layout(): void {
    const view = this.viewport;
    this.cameras.main.setZoom(view.k);
    this.cameras.main.centerOn(WORLD_W / 2, view.viewH / 2);

    setCrispText(this.scoreText, 96, view.k);
    this.scoreText.setStroke(COLORS.panelText, Math.max(1, Math.round(4 * view.k)));
    this.scoreText.setPosition(WORLD_W / 2, view.safeTopUnits + 96);
    setCrispText(this.titleText, 84, view.k);
    this.titleText.setStroke(COLORS.cyanText, Math.max(1, Math.round(3 * view.k)));
    this.titleText.setPosition(WORLD_W / 2, view.viewH * 0.16);
    setCrispText(this.promptText, 44, view.k);
    this.promptText.setPosition(WORLD_W / 2, view.viewH * 0.6);
    setCrispText(this.promptDetailText, 32, view.k);
    this.promptDetailText.setPosition(WORLD_W / 2, view.viewH * 0.6 + 58);
    setCrispText(this.bestText, 36, view.k);
    this.bestText.setPosition(WORLD_W / 2, view.viewH - view.safeBottomUnits - 70);

    const cardY = view.viewH * 0.42;
    this.card.clear();
    this.card.fillStyle(COLORS.panel, 0.92);
    this.card.fillRoundedRect(WORLD_W / 2 - 210, cardY - 170, 420, 340, 22);
    this.card.lineStyle(2, COLORS.cyan, 1);
    this.card.strokeRoundedRect(WORLD_W / 2 - 210, cardY - 170, 420, 340, 22);
    setCrispText(this.cardLabel, 32, view.k);
    this.cardLabel.setPosition(WORLD_W / 2, cardY - 118);
    setCrispText(this.cardScore, 110, view.k);
    this.cardScore.setPosition(WORLD_W / 2, cardY - 38);
    setCrispText(this.cardBest, 36, view.k);
    this.cardBest.setPosition(WORLD_W / 2, cardY + 56);
    setCrispText(this.newBestText, 40, view.k);
    this.newBestText.setPosition(WORLD_W / 2, cardY + 116);
    setCrispText(this.retryText, 36, view.k);
    this.retryText.setPosition(WORLD_W / 2, cardY + 220);

    setCrispText(this.pauseText, 44, view.k);
    this.pauseText.setPosition(WORLD_W / 2, view.viewH / 2);
    const left = WORLD_W / 2 - view.viewW / 2;
    this.pauseOverlay.clear();
    this.pauseOverlay.fillStyle(COLORS.outside, 0.65);
    this.pauseOverlay.fillRect(left, 0, view.viewW, view.viewH);
    this.drawMuteButton();
  }

  private drawMuteButton(): void {
    const center = muteCenter(this.viewport);
    const muted = audio.isMuted();
    this.lastMuted = muted;
    this.muteButton.clear().setPosition(center.x, center.y);
    this.muteButton.lineStyle(2, COLORS.cyan, 0.55);
    this.muteButton.strokeCircle(0, 0, 30);
    this.muteButton.fillStyle(COLORS.white, 0.9);
    this.muteButton.fillRect(-15, -7, 8, 14);
    this.muteButton.fillTriangle(-7, -11, 4, -19, 4, 19);
    this.muteButton.lineStyle(3, COLORS.white, 0.9);
    if (muted) {
      this.muteButton.lineBetween(10, -15, 23, 15);
      this.muteButton.lineBetween(23, -15, 10, 15);
    } else {
      this.muteButton.beginPath();
      this.muteButton.arc(3, 0, 12, -0.8, 0.8);
      this.muteButton.strokePath();
      this.muteButton.beginPath();
      this.muteButton.arc(3, 0, 20, -0.7, 0.7);
      this.muteButton.strokePath();
    }
  }

  private shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    bus.off('pass', this.passHandler);
  }
}
