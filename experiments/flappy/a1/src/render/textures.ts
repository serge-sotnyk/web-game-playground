import Phaser from 'phaser';
import { COL } from './theme';

export const TEX_MOTE = 'mote';
export const TEX_SPARK = 'spark';
export const TEX_STAR = 'star';

/**
 * Concentric circles rather than fillGradientStyle: the Phaser docs warn that
 * gradients may not survive generateTexture. Each ring is drawn outermost
 * first, so the alphas accumulate towards the centre into a soft glow.
 */
function radialGlow(
  scene: Phaser.Scene,
  key: string,
  size: number,
  coreR: number,
  outerR: number,
  core: number,
  halo: number,
): void {
  if (scene.textures.exists(key)) return;

  const g = scene.add.graphics();
  const c = size / 2;
  const rings = 14;

  for (let i = rings; i >= 1; i--) {
    const t = i / rings;
    const r = coreR + (outerR - coreR) * t;
    const a = 0.13 * (1 - t) * (1 - t) + 0.015;
    g.fillStyle(halo, a);
    g.fillCircle(c, c, r);
  }

  g.fillStyle(halo, 0.9);
  g.fillCircle(c, c, coreR * 1.12);
  g.fillStyle(core, 1);
  g.fillCircle(c, c, coreR);

  g.generateTexture(key, size, size);
  g.destroy();
}

/**
 * Authored well above their on-screen size so the camera zoom (up to ~2.7 on a
 * high-DPR flagship) never upscales them.
 */
export function ensureTextures(scene: Phaser.Scene): void {
  // 72 world units on screen, core radius 0.25 * 72 = R_VIS.
  radialGlow(scene, TEX_MOTE, 256, 64, 128, COL.moteCore, COL.moteHalo);
  // 24 world units on screen, shrinking.
  radialGlow(scene, TEX_SPARK, 64, 12, 32, COL.moteCore, COL.moteHalo);
  // Parallax starfield. Its own texture rather than a tint of `spark`, because
  // the v4 tint API is not the v3 one and this costs nothing.
  radialGlow(scene, TEX_STAR, 64, 9, 30, COL.star, COL.star);
}
