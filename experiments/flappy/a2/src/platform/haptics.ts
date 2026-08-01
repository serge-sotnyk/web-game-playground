export function vibrate(milliseconds: number): void {
  try {
    navigator.vibrate?.(milliseconds);
  } catch {
    // Haptics are best-effort and unsupported on some browsers.
  }
}
