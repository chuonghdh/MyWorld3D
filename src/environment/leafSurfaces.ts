// Landing surfaces for falling leaves: the pavement, kerb and car-roof boxes a leaf can rest on (top heights only).

import { GROUND_Y } from './leafState';

/** A solid a leaf can rest on: world-space footprint and the height of its top surface (metres). */
export interface SurfaceBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

/** The surfaces leaves land on. Ground outside every box is the road at GROUND_Y. */
export class LandingSurfaces {
  private boxes: SurfaceBox[] = [];
  /** Highest surface top in `boxes`, so falling leaves skip the scan until they are that low. */
  maxTop = GROUND_Y;

  set(boxes: readonly SurfaceBox[]): void {
    this.boxes = boxes.slice();
    this.maxTop = this.boxes.reduce((m, b) => Math.max(m, b.top), GROUND_Y);
  }

  /** Top of the highest surface under (x, z) that a leaf falling from `fromY` has not yet passed through; GROUND_Y otherwise. */
  top(x: number, z: number, fromY: number): number {
    let top = GROUND_Y;
    for (const b of this.boxes) {
      if (b.top > top && b.top <= fromY + 0.05 && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) top = b.top;
    }
    return top;
  }
}
