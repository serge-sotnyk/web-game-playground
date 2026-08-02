/** Scalar helpers shared by the simulation, the layout and the renderer. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Where `value` sits in `[a, b]`, as 0..1. Returns 0.5 for a degenerate span. */
export function normalize(value: number, a: number, b: number): number {
  const span = b - a
  return span === 0 ? 0.5 : (value - a) / span
}

/** Blend two 0xRRGGBB colours. */
export function mixColor(from: number, to: number, t: number): number {
  const k = clamp(t, 0, 1)
  const r = Math.round(lerp((from >> 16) & 0xff, (to >> 16) & 0xff, k))
  const g = Math.round(lerp((from >> 8) & 0xff, (to >> 8) & 0xff, k))
  const b = Math.round(lerp(from & 0xff, to & 0xff, k))
  return (r << 16) | (g << 8) | b
}
