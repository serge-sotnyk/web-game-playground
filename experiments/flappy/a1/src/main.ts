import Phaser from 'phaser';
import './style.css';
import { attachGame, getViewport } from './platform/viewport';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UiScene } from './scenes/UiScene';

const vp = getViewport();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#03040C',
  transparent: false,
  antialias: true,
  pixelArt: false,
  // The camera zoom is non-integer; rounding causes jitter.
  roundPixels: false,
  powerPreference: 'high-performance',
  // Phaser's console banner would break the "silent console" requirement.
  banner: false,
  // Audio is hand-rolled in platform/audio.ts, so Phaser never needs its own
  // AudioContext (and never warns about the autoplay policy).
  audio: { noAudio: true },
  scale: {
    parent: 'game',
    mode: Phaser.Scale.ScaleModes.NONE,
    // Phaser sets the canvas CSS size to backing-store size * zoom, so the
    // backing store ends up at exactly one canvas pixel per device pixel.
    zoom: 1 / vp.dpr,
    width: vp.gameW,
    height: vp.gameH,
    autoCenter: Phaser.Scale.Center.CENTER_BOTH,
    autoRound: false,
    expandParent: false,
  },
  // No `physics` block: the kinematics are four lines of arithmetic and one
  // circle/rect test, and they live in core/ where they can be tested.
  scene: [BootScene, GameScene, UiScene],
});

attachGame(game);
