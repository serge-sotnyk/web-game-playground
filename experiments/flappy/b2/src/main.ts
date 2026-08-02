import Phaser from 'phaser';
import { registerSW } from 'virtual:pwa-register';
import './style.css';
import { COLORS } from './game/constants';
import { RENDER_DPR, sizeCanvasCss, sizeHighDpiHost } from './game/display';
import { GameScene } from './game/GameScene';

const root = document.querySelector<HTMLElement>('#game-root');
const host = document.querySelector<HTMLElement>('#canvas-host');

if (!root || !host) throw new Error('Flux Flip mount elements are missing.');

const logical = sizeHighDpiHost({ root, host });
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: host,
  width: Math.round(logical.width * RENDER_DPR),
  height: Math.round(logical.height * RENDER_DPR),
  backgroundColor: COLORS.background,
  transparent: false,
  antialias: true,
  antialiasGL: true,
  pixelArt: false,
  banner: false,
  autoFocus: true,
  disableContextMenu: true,
  audio: { noAudio: true },
  scale: {
    parent: host,
    mode: Phaser.Scale.ScaleModes.RESIZE,
    width: Math.round(logical.width * RENDER_DPR),
    height: Math.round(logical.height * RENDER_DPR),
    autoRound: true,
    resizeInterval: 100,
  },
  scene: [GameScene],
});

sizeCanvasCss(game.canvas, logical);

registerSW({ immediate: false });
