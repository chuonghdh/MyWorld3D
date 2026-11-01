// Pavement and kerb tops as axis-aligned boxes, for the leaves that rest on them (environment/leaves.ts SurfaceBox).
// Taken from the same buildSurfaces pass the city mesh uses, so the boxes match the built sidewalks exactly.
// Boxes are the flat sidewalk and curb strips at SIDEWALK_TOP. Rounded kerb corners (roundedKerbCorner) are not boxes
// and are not listed.
import type * as THREE from 'three';
import type { CityLayout } from '../city/layout';
import type { SurfaceBox } from '../environment/leaves';
import { MeshBuilder } from './builder';
import { buildSurfaces, SIDEWALK_TOP } from './surfaces';

/** Records the sidewalk and curb top boxes that buildSurfaces emits; other boxes and all geometry are dropped. */
class PavementRecorder extends MeshBuilder {
  readonly boxes: SurfaceBox[] = [];

  override box(
    minX: number,
    maxX: number,
    y0: number,
    y1: number,
    minZ: number,
    maxZ: number,
    color: THREE.ColorRepresentation,
  ): this {
    void y0;
    void color;
    if (Math.abs(y1 - SIDEWALK_TOP) < 1e-9 && maxX - minX > 1e-6 && maxZ - minZ > 1e-6) {
      this.boxes.push({ minX, maxX, minZ, maxZ, top: y1 });
    }
    return this;
  }
}

/** Pavement and kerb top boxes of the town (world x and z, top height in metres). */
export function pavementSurfaces(layout: CityLayout): SurfaceBox[] {
  const recorder = new PavementRecorder();
  buildSurfaces(layout, recorder, new MeshBuilder());
  return recorder.boxes;
}
