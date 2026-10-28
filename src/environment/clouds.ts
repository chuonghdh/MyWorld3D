// Drifting low-poly clouds. Each cloud is a cluster of flat-shaded icospheres.
// Clouds move with the wind (scaled down) plus a slow constant drift, and wrap
// around the town area so the sky never empties.

import * as THREE from 'three';
import { createRng } from '../core/rng';

/** Fraction of the wind velocity that clouds follow (they drift slower than the air at ground level). */
export const CLOUD_WIND_FACTOR = 0.25;
/** Slow constant drift in m/s (east), so clouds move even in calm air. */
export const CLOUD_BASE_DRIFT = 0.3;

export interface CloudArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CloudOptions {
  area: CloudArea;
  /** Number of cloud clusters. */
  count?: number;
  /** Height above the ground in metres, range [min, max]. */
  height?: [number, number];
  seed?: number;
}

export interface CloudField {
  readonly group: THREE.Group;
  update(dt: number, windVector: { x: number; z: number }): void;
  dispose(): void;
}

/** Wrap value v into [min, max). */
function wrap(v: number, min: number, max: number): number {
  const span = max - min;
  return ((((v - min) % span) + span) % span) + min;
}

export function createClouds(opts: CloudOptions): CloudField {
  const count = opts.count ?? 14;
  const [hMin, hMax] = opts.height ?? [60, 90];
  const area = opts.area;
  // Clouds wrap across a margin wider than the area, so they fade in/out of view off-screen.
  const margin = 30;
  const minX = area.minX - margin;
  const maxX = area.maxX + margin;
  const minZ = area.minZ - margin;
  const maxZ = area.maxZ + margin;
  const rng = createRng(opts.seed ?? 7);

  const group = new THREE.Group();
  group.name = 'clouds';

  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    flatShading: true,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });

  const clusters: THREE.Object3D[] = [];
  for (let c = 0; c < count; c++) {
    const cluster = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 4);
    for (let p = 0; p < puffs; p++) {
      const mesh = new THREE.Mesh(geometry, material);
      const r = 4 + rng() * 5;
      mesh.scale.set(r, r * (0.6 + rng() * 0.2), r);
      mesh.position.set((rng() - 0.5) * 14, (rng() - 0.5) * 2, (rng() - 0.5) * 8);
      mesh.castShadow = true;
      cluster.add(mesh);
    }
    cluster.position.set(
      minX + rng() * (maxX - minX),
      hMin + rng() * (hMax - hMin),
      minZ + rng() * (maxZ - minZ),
    );
    cluster.userData.speedScale = 0.8 + rng() * 0.4;
    clusters.push(cluster);
    group.add(cluster);
  }

  return {
    group,
    update(dt: number, wind: { x: number; z: number }): void {
      const step = Math.min(Math.max(dt, 0), 0.1);
      for (const cluster of clusters) {
        const k = cluster.userData.speedScale as number;
        cluster.position.x += (wind.x * CLOUD_WIND_FACTOR + CLOUD_BASE_DRIFT) * k * step;
        cluster.position.z += wind.z * CLOUD_WIND_FACTOR * k * step;
        cluster.position.x = wrap(cluster.position.x, minX, maxX);
        cluster.position.z = wrap(cluster.position.z, minZ, maxZ);
      }
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
