import Phaser from 'phaser';
import './style.css';
import { bindViewport, getViewport } from './platform/viewport';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UiScene } from './scenes/UiScene';

const viewport = getViewport();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: viewport.gameW,
  height: viewport.gameH,
  backgroundColor: '#03040C',
  transparent: false,
  antialias: true,
  pixelArt: false,
  roundPixels: false,
  powerPreference: 'high-performance',
  scale: {
    parent: 'game',
    mode: Phaser.Scale.ScaleModes.NONE,
    zoom: 1 / viewport.dpr,
    width: viewport.gameW,
    height: viewport.gameH,
    autoCenter: Phaser.Scale.Center.CENTER_BOTH,
    autoRound: false,
    expandParent: false,
  },
  scene: [BootScene, GameScene, UiScene],
};

const game = new Phaser.Game(config);
bindViewport(game);
