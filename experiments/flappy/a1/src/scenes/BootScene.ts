import Phaser from 'phaser';
import { ensureTextures } from '../render/textures';

/** Generates the procedural textures, then hands over. There are no assets. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    ensureTextures(this);
    this.scene.start('game');
    this.scene.launch('ui');
    this.scene.bringToTop('ui');
  }
}
