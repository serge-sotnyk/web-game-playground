type Claim = (px: number, py: number) => boolean;

let claim: Claim | null = null;

/**
 * UiScene registers a hit test here so GameScene can let a HUD button swallow a
 * pointer without the two scenes importing each other.
 */
export function setUiClaim(fn: Claim | null): void {
  claim = fn;
}

export function uiClaims(px: number, py: number): boolean {
  return claim ? claim(px, py) : false;
}
