import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
mkdirSync(publicDir, { recursive: true });

const rgb = (hex) => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

function blend(data, offset, color, alpha) {
  const inv = 1 - alpha;
  data[offset] = Math.round(data[offset] * inv + color[0] * alpha);
  data[offset + 1] = Math.round(data[offset + 1] * inv + color[1] * alpha);
  data[offset + 2] = Math.round(data[offset + 2] * inv + color[2] * alpha);
  data[offset + 3] = 255;
}

function drawIcon(size, maskable = false) {
  const png = new PNG({ width: size, height: size });
  const bg = rgb('#070A18');
  const pink = rgb('#FF3D9A');
  const cyan = rgb('#7DF9FF');
  const white = rgb('#FFFFFF');
  const scale = maskable ? 0.6 : 1;
  const map = (value) => size * (0.5 + (value - 0.5) * scale);
  const scaled = (value) => size * value * scale;
  const drawingLeft = map(0);
  const drawingRight = map(1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      png.data[offset] = bg[0];
      png.data[offset + 1] = bg[1];
      png.data[offset + 2] = bg[2];
      png.data[offset + 3] = 255;

      const glowDistance = Math.hypot(x - size * 0.5, y - size * 0.5);
      const glowAlpha = Math.max(0, 1 - glowDistance / scaled(0.55)) * 0.28;
      blend(png.data, offset, pink, glowAlpha);

      const inTop = Math.abs(y - map(0.26)) <= scaled(0.045);
      const inBottom = Math.abs(y - map(0.72)) <= scaled(0.045);
      const topGap = x >= map(0.2) && x <= map(0.44);
      const bottomGap = x >= map(0.58) && x <= map(0.82);
      const withinDrawing = x >= drawingLeft && x <= drawingRight;
      if (withinDrawing && ((inTop && !topGap) || (inBottom && !bottomGap))) {
        blend(png.data, offset, pink, 1);
      }

      const moteDistance = Math.hypot(x - map(0.52), y - map(0.49));
      const haloRadius = scaled(0.12);
      const coreRadius = scaled(0.06);
      if (moteDistance <= haloRadius) {
        blend(png.data, offset, cyan, (1 - moteDistance / haloRadius) * 0.7);
      }
      if (moteDistance <= coreRadius) {
        blend(png.data, offset, white, 1);
      }
    }
  }
  return PNG.sync.write(png);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon-180.png', 180, false],
]) {
  writeFileSync(join(publicDir, name), drawIcon(size, maskable));
}
