// Block monuments: detailed low-poly European landmarks that fill a monument block.
// Each fits inside width x depth (default 34 x 34 m), centred on the origin, base at y = 0,
// main entrance facing +z. Built with ColorBatch: at most three meshes (body, glass, glassLit)
// using the shared building materials, so night lighting works through setNightLights.

import * as THREE from 'three';
import type { MonumentKind } from '../core/types';
import { buildings } from '../config/tuning';
import { Kit, type Site } from './monuments/kit';
import { fireStation, hospital, supermarket } from './monuments/civic';
import { circus, funfair, stadium, swimmingPool } from './monuments/leisure';
import { dinosaurPark, gothicCathedral, openAirTheatre } from './monuments/culture';
import { cityHall } from './monuments/municipal';
import { school } from './monuments/education';

export const MONUMENT_KINDS: readonly MonumentKind[] = buildings.monumentKinds;

export interface MonumentOptions {
  /** Block width along x in metres. Default 34. */
  width?: number;
  /** Block depth along z in metres. Default 34. */
  depth?: number;
  /** Detail variation seed (colours, props, lit windows). Default 1. */
  seed?: number;
}

export const DEFAULT_MONUMENT_SIZE = 34;

type Builder = (k: Kit, s: Site) => void;

const BUILDERS: Record<MonumentKind, Builder> = {
  hospital,
  stadium,
  funfair,
  'swimming-pool': swimmingPool,
  'dinosaur-park': dinosaurPark,
  supermarket,
  'open-air-theatre': openAirTheatre,
  circus,
  'fire-station': fireStation,
  'gothic-cathedral': gothicCathedral,
  'city-hall': cityHall,
  school,
};

function hashKind(kind: string): number {
  let h = 2166136261;
  for (let i = 0; i < kind.length; i++) {
    h ^= kind.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Builds a monument centred on the origin with its base at y = 0 and its entrance facing +z.
 * Layouts are designed for a block of about 34 x 34 m; on a smaller block the whole monument
 * is scaled down uniformly so it always fits inside width x depth.
 */
export function buildMonument(kind: MonumentKind, opts: MonumentOptions = {}): THREE.Group {
  const W = Math.max(8, opts.width ?? DEFAULT_MONUMENT_SIZE);
  const D = Math.max(8, opts.depth ?? DEFAULT_MONUMENT_SIZE);
  const seed = opts.seed ?? 1;
  // Lay out on at least the design size, then scale down to the real block if needed.
  const LW = Math.max(W, 30);
  const LD = Math.max(D, 30);
  const k = new Kit((hashKind(kind) ^ Math.imul(seed | 0, 0x9e3779b1)) >>> 0);
  BUILDERS[kind](k, { W: LW, D: LD, hw: LW / 2, hd: LD / 2 });
  // Fake ground occlusion: darken the lowest half metre a little.
  k.batch.shade((y) => (y < 0.5 ? 0.9 + 0.2 * Math.max(0, y) : 1));
  const group = k.batch.build();

  // Fit: uniform scale about the origin so the footprint stays inside W x D, and lift to y >= 0.
  const box = new THREE.Box3();
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) box.union(mesh.geometry.boundingBox);
  }
  const ex = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), 1e-6);
  const ez = Math.max(Math.abs(box.min.z), Math.abs(box.max.z), 1e-6);
  const s = Math.min(1, W / 2 / ex, D / 2 / ez);
  const lift = box.min.y < 0 ? -box.min.y : 0;
  let height = box.max.y + lift;
  if (s < 1 || lift > 0) {
    for (const child of group.children) {
      const g = (child as THREE.Mesh).geometry;
      if (lift > 0) g.translate(0, lift, 0);
      if (s < 1) g.scale(s, s, s);
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
    height *= s;
  }
  group.name = `monument-${kind}`;
  group.userData = { kind, width: W, depth: D, height, seed };
  return group;
}
