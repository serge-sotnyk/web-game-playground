/**
 * Generates the PWA icons.
 *
 * The artwork is the game's own spark — a cyan/coral split ring on the reactor
 * navy — rasterised here from arithmetic, so it is original by construction and
 * reproducible without any image tooling. Run with `npm run icons`.
 *
 * PNG is written by hand (zlib is the only thing Node does not already give us
 * for free), which keeps the build free of an image dependency.
 */

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const NAVY = [7, 18, 37]
const BAND = [17, 26, 56]
const CYAN = [77, 235, 255]
const CORAL = [255, 102, 135]
const WHITE = [255, 255, 255]

// ── PNG encoding ──────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  header[10] = 0
  header[11] = 0
  header[12] = 0

  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    const dst = y * (width * 4 + 1)
    raw[dst] = 0
    rgba.copy(raw, dst + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Artwork ───────────────────────────────────────────────────────────────────

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp01(t))

/** Antialiased "inside" test: 1 well inside `edge`, 0 well outside. */
const coverage = (distance, edge, feather) => clamp01((edge - distance) / feather + 0.5)

function renderIcon(size, artScale) {
  const rgba = Buffer.alloc(size * size * 4)
  const c = size / 2
  const feather = Math.max(1, size / 256)

  const ringR = 0.3 * size * artScale
  const ringW = 0.055 * size * artScale
  const coreR = 0.155 * size * artScale
  const whiteR = 0.07 * size * artScale
  const haloR = 0.46 * size * artScale

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      const d = Math.hypot(dx, dy)

      // Vertical background wash.
      let color = mix(NAVY, BAND, y / size)

      // Polarity colour: cyan above the midline, coral below, softly seamed.
      const polar = mix(CYAN, CORAL, clamp01(dy / (0.16 * size) + 0.5))

      // Soft halo.
      color = mix(color, polar, 0.16 * clamp01(1 - d / haloR) ** 2)

      // Ring.
      const ring = coverage(Math.abs(d - ringR), ringW / 2, feather)
      color = mix(color, polar, ring)

      // Core and white centre.
      color = mix(color, polar, coverage(d, coreR, feather))
      color = mix(color, WHITE, coverage(d, whiteR, feather))

      const i = (y * size + x) * 4
      rgba[i] = Math.round(color[0])
      rgba[i + 1] = Math.round(color[1])
      rgba[i + 2] = Math.round(color[2])
      rgba[i + 3] = 255
    }
  }

  return encodePng(size, size, rgba)
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#071225"/>
      <stop offset="1" stop-color="#111A38"/>
    </linearGradient>
    <linearGradient id="polarity" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.42" stop-color="#4DEBFF"/>
      <stop offset="0.58" stop-color="#FF6687"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#4DEBFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FF6687" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#field)"/>
  <circle cx="256" cy="256" r="236" fill="url(#halo)"/>
  <circle cx="256" cy="256" r="153.6" fill="none" stroke="url(#polarity)" stroke-width="28.2"/>
  <circle cx="256" cy="256" r="79.4" fill="url(#polarity)"/>
  <circle cx="256" cy="256" r="35.8" fill="#FFFFFF"/>
</svg>
`

mkdirSync(OUT_DIR, { recursive: true })

const outputs = [
  ['icon-192.png', renderIcon(192, 1)],
  ['icon-512.png', renderIcon(512, 1)],
  // Maskable art is shrunk to 80% so nothing critical is lost to a platform crop.
  ['icon-maskable-512.png', renderIcon(512, 0.8)],
  ['icon.svg', Buffer.from(SVG, 'utf8')],
]

for (const [name, data] of outputs) {
  writeFileSync(join(OUT_DIR, name), data)
  console.log(`wrote icons/${name} (${data.length} bytes)`)
}
