/**
 * Draws the PWA icons procedurally and writes them with pngjs, so no binary
 * asset is ever copied from anywhere. Run once with `npm run icons`; the output
 * is committed, so `npm ci && npm run build` never needs this script.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [0x07, 0x0a, 0x18];
const MAGENTA = [0xff, 0x3d, 0x9a];
const CYAN = [0x7d, 0xf9, 0xff];
const WHITE = [0xff, 0xff, 0xff];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(dst, src, a) {
  if (a <= 0) return dst;
  const k = clamp01(a);
  return [
    dst[0] + (src[0] - dst[0]) * k,
    dst[1] + (src[1] - dst[1]) * k,
    dst[2] + (src[2] - dst[2]) * k,
  ];
}

/** One horizontal bar with a gap, in content-box units. */
function bar(u, v, cy, gapL, gapR, feather) {
  const halfH = 0.045;
  const inRow = 1 - smoothstep(halfH - feather, halfH + feather, Math.abs(v - cy));
  if (inRow <= 0) return 0;
  const inGap =
    smoothstep(gapL - feather, gapL + feather, u) *
    (1 - smoothstep(gapR - feather, gapR + feather, u));
  return inRow * (1 - inGap);
}

/**
 * @param size    pixel size of the square icon
 * @param content fraction of the icon the drawing occupies (1 = full bleed,
 *                0.6 keeps everything inside Android's maskable safe zone)
 */
function render(size, content) {
  const png = new PNG({ width: size, height: size });
  const s = size * content;
  const o = (size - s) / 2;
  const feather = 1.5 / s;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = BG;
      const u = (x + 0.5 - o) / s;
      const v = (y + 0.5 - o) / s;

      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        // Radial magenta glow, gone by 55% of the width.
        const gd = Math.hypot(u - 0.5, v - 0.5);
        const glow = clamp01(1 - gd / 0.55);
        c = mix(c, MAGENTA, 0.42 * glow * glow);

        c = mix(c, MAGENTA, bar(u, v, 0.26, 0.2, 0.44, feather));
        c = mix(c, MAGENTA, bar(u, v, 0.72, 0.58, 0.82, feather));

        // The mote: white core, cyan halo.
        const md = Math.hypot(u - 0.52, v - 0.49);
        c = mix(c, CYAN, 0.9 * (1 - smoothstep(0.05, 0.12, md)));
        c = mix(c, WHITE, 1 - smoothstep(0.045, 0.062, md));
      }

      const i = (y * size + x) * 4;
      png.data[i] = Math.round(c[0]);
      png.data[i + 1] = Math.round(c[1]);
      png.data[i + 2] = Math.round(c[2]);
      png.data[i + 3] = 255;
    }
  }
  return png;
}

function write(name, size, content) {
  const file = join(OUT, name);
  writeFileSync(file, PNG.sync.write(render(size, content)));
  process.stdout.write(`wrote ${name} (${size}px)\n`);
}

write('icon-192.png', 192, 1);
write('icon-512.png', 512, 1);
write('apple-touch-icon-180.png', 180, 1);
write('icon-maskable-512.png', 512, 0.6);

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#FF3D9A" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#FF3D9A" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="38%" stop-color="#FFFFFF" stop-opacity="1"/>
      <stop offset="52%" stop-color="#7DF9FF" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#7DF9FF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" fill="#070A18"/>
  <rect width="64" height="64" fill="url(#glow)"/>
  <rect x="0" y="13.8" width="12.8" height="5.8" fill="#FF3D9A"/>
  <rect x="28.2" y="13.8" width="35.8" height="5.8" fill="#FF3D9A"/>
  <rect x="0" y="43.3" width="37.1" height="5.8" fill="#FF3D9A"/>
  <rect x="52.5" y="43.3" width="11.5" height="5.8" fill="#FF3D9A"/>
  <circle cx="33.3" cy="31.4" r="7.7" fill="url(#halo)"/>
</svg>
`;
writeFileSync(join(OUT, 'favicon.svg'), favicon);
process.stdout.write('wrote favicon.svg\n');
