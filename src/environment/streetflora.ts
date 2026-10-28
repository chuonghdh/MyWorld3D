// Street-level flora: flower rings in the tree pits of avenues and plazas, clipped hedges and
// corner flower beds around monument plazas. Everything is merged into ONE vertex-coloured mesh
// (one draw call), recoloured per season by seasonalPaint (blooms close and wither in autumn,
// hedges yellow, winter dusts them with snow).
//
// Mount the group at the same height as the tree field (the sidewalk level).

import * as THREE from 'three';
import type { Rect } from '../city/layout';
import { createRng } from '../core/rng';
import type { Season, TreeSpecies } from '../core/types';
import { TriBuilder, trunkFootRadius } from './forest';
import { addFlowerBed, addHedge } from './greenery';
import { TAG_BLOOM, TAG_FIXED, TAG_FOLIAGE, applySeasonPaint, createPaintState } from './seasonalPaint';
import { attachCloudShade } from './cloudShade';

export interface FloraTree {
  position: { x: number; z: number };
  species: TreeSpecies;
  scale: number;
  setting: 'street' | 'courtyard' | 'plaza';
}

export interface StreetFlora {
  group: THREE.Group;
  setSeason(season: Season): void;
  /** Counts of what was built, for tests and debugging. */
  stats: { pits: number; hedgeRuns: number; beds: number };
  dispose(): void;
}

/** Plaza margin around a monument, as computed by the city generator. */
export function plazaMarginOf(bounds: Rect): number {
  return Math.min(5, 0.15 * Math.min(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ));
}

const SOIL = new THREE.Color('#5a3f2c');
const TUFT = new THREE.Color('#3f7a32');
const PIT_PALETTES = [
  ['#e0413a', '#f2c94c', '#f7f2ea'],
  ['#e86a9a', '#b07ad8', '#f7f2ea'],
  ['#f28c38', '#f2c94c', '#e0413a'],
  ['#5a7fd8', '#f7f2ea', '#e86a9a'],
  ['#f2c94c', '#f28c38', '#f7f2ea'],
].map((p) => p.map((h) => new THREE.Color(h)));

const SOIL_DISC = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false);
const BLOOM = new THREE.OctahedronGeometry(1, 0);
const TUFTS = new THREE.OctahedronGeometry(1, 0);

const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

/** Number of blooms in a tree pit ring: a ring of 6-8 blooms between 6 tufts. */
export function pitBloomCount(rng: () => number): number {
  return 6 + Math.floor(rng() * 3);
}

function addTreePit(b: TriBuilder, rng: () => number, tree: FloraTree): void {
  const c = new THREE.Color();
  const foot = trunkFootRadius(tree.species, tree.scale);
  const soilR = foot + 0.42;
  const soilH = 0.06;
  b.tag = TAG_FIXED;
  b.add(
    SOIL_DISC,
    new THREE.Matrix4().compose(
      new THREE.Vector3(tree.position.x, soilH / 2, tree.position.z),
      new THREE.Quaternion(),
      new THREE.Vector3(soilR, soilH, soilR),
    ),
    () => c.copy(SOIL).multiplyScalar(range(rng, 0.85, 1.1)),
  );
  const palette = PIT_PALETTES[Math.floor(rng() * PIT_PALETTES.length)];
  const n = pitBloomCount(rng);
  const phase = rng() * Math.PI * 2;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + range(rng, -0.12, 0.12);
    const r = foot + range(rng, 0.2, 0.34);
    const x = tree.position.x + Math.cos(a) * r;
    const z = tree.position.z + Math.sin(a) * r;
    q.setFromEuler(e.set(0, rng() * Math.PI, 0));
    // Leaf tuft below, bloom on top: both rise from the soil, not from the sidewalk.
    const tr = range(rng, 0.1, 0.14);
    b.tag = TAG_FOLIAGE;
    b.add(
      TUFTS,
      new THREE.Matrix4().compose(new THREE.Vector3(x, soilH + tr * 0.55, z), q, new THREE.Vector3(tr, tr * 0.8, tr)),
      (_f, _c, normal) => c.copy(TUFT).multiplyScalar((0.85 + 0.25 * normal.y) * range(rng, 0.92, 1.08)),
    );
    const br = range(rng, 0.065, 0.095);
    const tone = rng() < 0.7 ? palette[i % palette.length] : palette[Math.floor(rng() * palette.length)];
    b.tag = TAG_BLOOM;
    b.add(
      BLOOM,
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, soilH + tr * 1.15 + br * 0.6, z),
        q,
        new THREE.Vector3(br, br * 0.8, br),
      ),
      (_f, _c, normal) => c.copy(tone).multiplyScalar((0.9 + 0.2 * normal.y) * range(rng, 0.93, 1.07)),
    );
  }
}

/**
 * Hedge runs along the four sides of a plaza, inside the tree ring and outside the monument lot,
 * each side broken by a gate gap in the middle. Returns the number of runs.
 */
function addPlazaHedges(b: TriBuilder, rng: () => number, bounds: Rect, margin: number, seed: number): number {
  const inset = margin * 0.8;
  const x0 = bounds.minX + inset;
  const x1 = bounds.maxX - inset;
  const z0 = bounds.minZ + inset;
  const z1 = bounds.maxZ - inset;
  if (x1 - x0 < 6 || z1 - z0 < 6) return 0;
  const sides: [number, number, number, number][] = [
    [x0, z0, x1, z0],
    [x0, z1, x1, z1],
    [x0, z0, x0, z1],
    [x1, z0, x1, z1],
  ];
  let runs = 0;
  sides.forEach(([ax, az, bx, bz], si) => {
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const gate = Math.min(3, len * 0.25);
    const half = (len - gate) / 2;
    // Two runs per side, leaving the corners shortened a little so the ring does not close.
    for (const [from, to] of [
      [0.4, half],
      [half + gate, len - 0.4],
    ] as const) {
      if (to - from < 1.5) continue;
      addHedge(b, rng, ax + ux * from, az + uz * from, ax + ux * to, az + uz * to, seed + si * 53 + runs);
      runs++;
    }
  });
  return runs;
}

export function createStreetFlora(
  trees: readonly FloraTree[],
  plazas: readonly Rect[],
  opts: { season: Season; seed?: number },
): StreetFlora {
  const seed = opts.seed ?? 1;
  const b = new TriBuilder();
  const stats = { pits: 0, hedgeRuns: 0, beds: 0 };

  const rngPits = createRng((seed * 6151 + 11) >>> 0);
  for (const t of trees) {
    if (t.setting === 'courtyard') continue;
    addTreePit(b, rngPits, t);
    stats.pits++;
  }

  plazas.forEach((bounds, pi) => {
    const margin = plazaMarginOf(bounds);
    if (margin < 3) return;
    const rng = createRng((seed * 7919 + pi * 104729 + 5) >>> 0);
    b.tag = TAG_FOLIAGE;
    stats.hedgeRuns += addPlazaHedges(b, rng, bounds, margin, seed + pi * 389);
    // Corner flower beds on the tree ring, away from trees.
    const ring = margin * 0.5;
    const corners = [
      { x: bounds.minX + ring, z: bounds.minZ + ring },
      { x: bounds.maxX - ring, z: bounds.minZ + ring },
      { x: bounds.maxX - ring, z: bounds.maxZ - ring },
      { x: bounds.minX + ring, z: bounds.maxZ - ring },
    ];
    for (const p of corners) {
      if (trees.some((t) => Math.hypot(t.position.x - p.x, t.position.z - p.z) < 2.4)) continue;
      addFlowerBed(b, rng, p.x, p.z, 1.6, 1.6);
      stats.beds++;
    }
  });

  const group = new THREE.Group();
  group.name = 'street-flora';
  let mesh: THREE.Mesh | null = null;
  let material: THREE.MeshStandardMaterial | null = null;
  let applyPaint: (season: Season) => void = () => {};
  if (b.triangleCount > 0) {
    const geometry = b.build();
    material = attachCloudShade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'street-flora-mesh';
    mesh.castShadow = false; // tiny low plants: skipping the shadow pass keeps the cost at one draw call
    mesh.receiveShadow = true;
    group.add(mesh);
    const state = createPaintState(geometry, new Float32Array(b.tags));
    applyPaint = (season) => applySeasonPaint(geometry, state, season);
  }
  applyPaint(opts.season);

  return {
    group,
    stats,
    setSeason: applyPaint,
    dispose() {
      mesh?.geometry.dispose();
      material?.dispose();
      group.clear();
    },
  };
}
