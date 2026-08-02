/** Not gated by mute — a vibration is not a sound. */
export function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported or blocked; nothing to do and nothing to log */
  }
}
