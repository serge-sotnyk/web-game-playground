import Phaser from 'phaser';
import { COLORS } from './theme';

function drawHalo(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  outerRadius: number,
  innerRadius: number,
  color: number,
  peakAlpha: number,
  steps = 10,
): void {
  for (let i = steps; i >= 1; i -= 1) {
    const t = i / steps;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    const alpha = peakAlpha * (1 - t) ** 1.6 + 0.015;
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(x, y, radius);
  }
}

export function generateTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists('mote')) {
    const graphics = scene.add.graphics();
    drawHalo(graphics, 64, 64, 64, 32, COLORS.cyan, 0.24);
    graphics.fillStyle(COLORS.cyan, 0.55);
    graphics.fillCircle(64, 64, 36);
    graphics.fillStyle(COLORS.white, 1);
    graphics.fillCircle(64, 64, 32);
    graphics.generateTexture('mote', 128, 128);
    graphics.destroy();
  }

  if (!scene.textures.exists('spark')) {
    const graphics = scene.add.graphics();
    drawHalo(graphics, 32, 32, 32, 12, COLORS.cyan, 0.28, 8);
    graphics.fillStyle(COLORS.cyan, 0.7);
    graphics.fillCircle(32, 32, 14);
    graphics.fillStyle(COLORS.white, 1);
    graphics.fillCircle(32, 32, 12);
    graphics.generateTexture('spark', 64, 64);
    graphics.destroy();
  }

  if (!scene.textures.exists('glow')) {
    const graphics = scene.add.graphics();
    drawHalo(graphics, 32, 32, 32, 0, COLORS.barrier, 0.5, 12);
    graphics.generateTexture('glow', 64, 64);
    graphics.destroy();
  }
}
