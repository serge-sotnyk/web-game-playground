import Phaser from 'phaser';
import { AudioService } from './audio';
import { FIXED_STEP, clamp } from './constants';
import {
  RENDER_DPR,
  measureLogicalViewport,
  sizeCanvasCss,
  sizeHighDpiHost,
} from './display';
import { calculateLayout, remapRun } from './layout';
import { Renderer } from './Renderer';
import {
  advanceGameSession,
  createGameSession,
  finishBoot,
  primaryAction,
  pauseGame,
  renderSnapshot,
  setLandscapeBlocked,
  speedForScore,
} from './simulation';
import { loadSettings, saveSettings } from './storage';
import type { GameSession, Layout, SafeInsets, SimulationEvent, StoredSettings } from './types';

const readPixelVariable = (styles: CSSStyleDeclaration, property: string): number => {
  const parsed = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(parsed) ? parsed : 0;
};

const readSafeInsets = (): SafeInsets => {
  const styles = getComputedStyle(document.documentElement);
  return {
    top: readPixelVariable(styles, '--safe-top'),
    right: readPixelVariable(styles, '--safe-right'),
    bottom: readPixelVariable(styles, '--safe-bottom'),
    left: readPixelVariable(styles, '--safe-left'),
  };
};

export class GameScene extends Phaser.Scene {
  private session: GameSession = createGameSession();
  private layout!: Layout;
  private presentation!: Renderer;
  private audio!: AudioService;
  private settings: StoredSettings = { best: 0, muted: false };
  private root!: HTMLElement;
  private host!: HTMLElement;
  private soundButton!: HTMLButtonElement;
  private statusText!: HTMLElement;
  private runCounter = 0;
  private cleanedUp = false;
  private previousPhase = this.session.phase;

  public constructor() {
    super({ key: 'GameScene' });
  }

  public create(): void {
    this.root = document.querySelector<HTMLElement>('#game-root')!;
    this.host = document.querySelector<HTMLElement>('#canvas-host')!;
    this.soundButton = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
    this.statusText = document.querySelector<HTMLElement>('#game-status')!;
    this.settings = loadSettings();
    this.audio = new AudioService(this.settings.muted);
    this.layout = this.calculateCurrentLayout();
    this.configureCamera();
    this.presentation = new Renderer(this, this.layout);
    finishBoot(this.session);
    this.previousPhase = this.session.phase;
    this.updateSoundButton();
    this.statusText.textContent = `Flux Flip ready. Best score ${this.settings.best}.`;

    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.on('keydown', this.handleKeyDown, this);
    this.input.keyboard?.addCapture('SPACE,ENTER,UP');
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('resize', this.handleWindowResize);
    this.soundButton.addEventListener('pointerdown', this.handleSoundPointer);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);
    this.applyOrientationRule();
  }

  private calculateCurrentLayout(): Layout {
    const logical = measureLogicalViewport(this.root);
    return calculateLayout(
      logical.width,
      logical.height,
      readSafeInsets(),
    );
  }

  private configureCamera(): void {
    const camera = this.cameras.main;
    camera.originX = 0;
    camera.originY = 0;
    camera.setSize(this.scale.gameSize.width, this.scale.gameSize.height);
    camera.setZoom(RENDER_DPR);
    camera.setScroll(0, 0);
  }

  private handleScaleResize(): void {
    const nextLayout = this.calculateCurrentLayout();
    if (this.session.run) this.session.run = remapRun(this.session.run, nextLayout);
    this.layout = nextLayout;
    this.session.accumulator = 0;
    this.configureCamera();
    this.presentation.setLayout(nextLayout);
    this.applyOrientationRule();
  }

  private readonly handleWindowResize = (): void => {
    const logical = sizeHighDpiHost({ root: this.root, host: this.host });
    sizeCanvasCss(this.game.canvas, logical);
    this.scale.refresh();
  };

  private applyOrientationRule(): void {
    setLandscapeBlocked(this.session, this.layout.width >= this.layout.height);
  }

  private nextSeed(): number {
    return (Date.now() ^ Math.imul(this.runCounter, 0x9e3779b9)) >>> 0;
  }

  private handlePrimaryAction(atMs: number): void {
    const previousRun = this.session.run;
    const events = primaryAction(this.session, this.layout, this.nextSeed(), atMs);
    if (this.session.run !== previousRun) {
      this.runCounter += 1;
      this.presentation.resetRunEffects();
      this.statusText.textContent = 'Run started. Tap to flip gravity.';
    }
    this.handleEvents(events);
  }

  private handlePointerDown(): void {
    void this.audio.unlock();
    this.handlePrimaryAction(performance.now());
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.repeat) return;
    if (event.code === 'KeyM') {
      event.preventDefault();
      this.toggleMuted();
      return;
    }
    if (event.code === 'Space' || event.code === 'Enter' || event.code === 'ArrowUp') {
      event.preventDefault();
      this.handlePrimaryAction(performance.now());
    }
  }

  private readonly handleSoundPointer = (event: PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    void this.audio.unlock();
    this.toggleMuted();
  };

  private toggleMuted(): void {
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    saveSettings(this.settings);
    this.updateSoundButton();
  }

  private updateSoundButton(): void {
    this.soundButton.textContent = this.settings.muted ? '×' : '♪';
    this.soundButton.setAttribute('aria-label', this.settings.muted ? 'Unmute sound' : 'Mute sound');
    this.soundButton.setAttribute('aria-pressed', String(this.settings.muted));
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden) this.pauseForLifecycle();
  };

  private readonly handleBlur = (): void => {
    this.pauseForLifecycle();
  };

  private pauseForLifecycle(): void {
    const wasPlaying = this.session.phase === 'PLAYING';
    pauseGame(this.session);
    if (wasPlaying) this.statusText.textContent = 'Game paused. Tap to continue.';
  }

  private handleEvents(events: SimulationEvent[]): void {
    const run = this.session.run;
    if (!run) return;
    for (const event of events) {
      switch (event.type) {
        case 'FLIPPED':
          this.audio.play('flip');
          this.presentation.notifyFlip(this.layout.playerX, run.player.y, event.direction);
          break;
        case 'SCORED':
          this.audio.play('score');
          this.presentation.notifyScore(event.gateId);
          this.statusText.textContent = `Score ${event.score}.`;
          break;
        case 'CRASHED': {
          if (event.score > this.settings.best) {
            this.settings.best = event.score;
            this.session.newBest = true;
            saveSettings(this.settings);
          }
          this.audio.play('hit');
          this.presentation.notifyCrash(
            this.layout.playerX,
            run.player.y,
            speedForScore(run.score, this.layout.U),
          );
          this.statusText.textContent = `Run ended. Score ${event.score}.`;
          break;
        }
        case 'GATE_SPAWNED':
          break;
      }
    }
  }

  public update(time: number, delta: number): void {
    const deltaSeconds = Math.max(0, delta) / 1000;
    const events = advanceGameSession(this.session, deltaSeconds);
    this.handleEvents(events);
    if (this.previousPhase !== this.session.phase) {
      if (this.session.phase === 'RESULTS') {
        this.statusText.textContent = `Results. Score ${this.session.run?.score ?? 0}. Best ${this.settings.best}. Tap to retry.`;
      } else if (this.session.phase === 'PAUSED') {
        this.statusText.textContent = this.session.landscapeBlocked
          ? 'Rotate your phone.'
          : 'Game paused. Tap to continue.';
      }
      this.previousPhase = this.session.phase;
    }
    const interpolation =
      this.session.phase === 'PLAYING'
        ? clamp(this.session.accumulator / FIXED_STEP, 0, 1)
        : 1;
    const snapshot = this.session.run
      ? renderSnapshot(this.session.run, interpolation)
      : null;
    this.presentation.render(this.session, snapshot, this.settings.best, deltaSeconds, time);
  }

  private cleanup(): void {
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    this.input.off('pointerdown', this.handlePointerDown, this);
    this.input.keyboard?.off('keydown', this.handleKeyDown, this);
    this.input.keyboard?.removeCapture('SPACE,ENTER,UP');
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('resize', this.handleWindowResize);
    this.soundButton.removeEventListener('pointerdown', this.handleSoundPointer);
    this.presentation.destroy();
    this.audio.destroy();
  }
}
