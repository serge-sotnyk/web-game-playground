/** Neon-on-black palette. Numbers for Graphics, strings for Text. */
export const COL = {
  letterbox: 0x03040c,
  shaft: 0x070a18,
  wall: 0x1b2a6b,
  wallFlash: 0x5b7bff,
  barrier: 0xff3d9a,
  barrierEdge: 0xff9ad1,
  moteCore: 0xffffff,
  moteHalo: 0x7df9ff,
  star: 0x5b7bff,
  card: 0x0b1030,
  deathFlash: 0xff3d9a,
} as const;

export const CSS = {
  text: '#EAF6FF',
  textStroke: '#0B1030',
  accent: '#7DF9FF',
  hot: '#FF9AD1',
  dim: '#5B7BFF',
} as const;

/** System stack only — no webfont, so nothing hits the network at runtime. */
export const FONT_FAMILY =
  "'Trebuchet MS', 'Segoe UI', system-ui, -apple-system, sans-serif";
