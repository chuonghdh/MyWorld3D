// Tyre tracks in the snow: bare strips where cars have driven. Each traffic path leaves two strips, one under
// each wheel track. Near junctions the strips wander, break up and spread into scattered patches, as on real roads.
// The result is a single-channel mask over the town (0 = snow stays, 255 = bare asphalt), read by the snow patch in
// src/shaders/wetSurface.ts. Deterministic: seeded from the layout seed.

import * as THREE from 'three';
import type { CityLayout } from '../city/layout';
import { createRng } from '../core/rng';

/** Texel size in metres. */
const CELL = 0.5;
/** Lateral offset of each wheel track from the lane centre line, metres. */
const WHEEL_OFFSET = 0.75;
/** Distance between stamps along a path, metres. */
const STEP = 0.25;
/** Radius around an intersection centre where tracks get messy, metres. */
const JUNCTION_RADIUS = 9;

export interface TyreTrackMap {
  texture: THREE.DataTexture;
  /** (minX, minZ, width, depth) of the town in metres: maps world xz to uv. */
  rect: THREE.Vector4;
}

export function buildTyreTrackMap(layout: CityLayout): TyreTrackMap {
  const b = layout.townBounds;
  const w = Math.max(1, Math.ceil((b.maxX - b.minX) / CELL));
  const h = Math.max(1, Math.ceil((b.maxZ - b.minZ) / CELL));
  const data = new Uint8Array(w * h * 4);
  const rng = createRng((layout.seed ^ 0x7c3a9e11) >>> 0);

  const stamp = (x: number, z: number, v: number) => {
    const ix = Math.floor((x - b.minX) / CELL);
    const iz = Math.floor((z - b.minZ) / CELL);
    if (ix < 0 || iz < 0 || ix >= w || iz >= h) return;
    const o = (iz * w + ix) * 4;
    data[o] = Math.max(data[o], v);
  };

  const junctions = layout.intersections;
  const junctionDistance = (x: number, z: number): number => {
    let best = Infinity;
    for (const j of junctions) best = Math.min(best, Math.hypot(x - j.center.x, z - j.center.z));
    return best;
  };

  for (const path of layout.trafficPaths) {
    const wp = path.waypoints;
    for (let i = 0; i + 1 < wp.length; i++) {
      const a = wp[i];
      const c = wp[i + 1];
      const dx = c.x - a.x;
      const dz = c.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-3) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const n = Math.max(1, Math.ceil(len / STEP));
      for (let s = 0; s <= n; s++) {
        const px = a.x + (dx * s) / n;
        const pz = a.z + (dz * s) / n;
        const near = junctionDistance(px, pz) < JUNCTION_RADIUS;
        for (const side of [-1, 1]) {
          if (!near) {
            stamp(px + nx * WHEEL_OFFSET * side, pz + nz * WHEEL_OFFSET * side, 255);
            continue;
          }
          // Junction: the track wanders sideways, skips some stretches and leaves a fainter trace.
          const off = WHEEL_OFFSET * side + (rng() - 0.5) * 1.4;
          const r = rng();
          if (r < 0.35) continue;
          stamp(px + nx * off, pz + nz * off, r < 0.7 ? 255 : 130);
        }
      }
    }
  }

  // Scattered churn across each junction: braking, turning and cross traffic.
  for (const j of junctions) {
    const count = Math.round((j.sizeX * j.sizeZ) / 6);
    for (let k = 0; k < count; k++) {
      const x = j.center.x + (rng() - 0.5) * j.sizeX;
      const z = j.center.z + (rng() - 0.5) * j.sizeZ;
      if (rng() < 0.5) stamp(x, z, 110 + Math.floor(rng() * 110));
    }
  }

  const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, rect: new THREE.Vector4(b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ) };
}
