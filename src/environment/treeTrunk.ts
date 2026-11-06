// Procedural tree trunks, root flares, limbs and bare winter branches.

import * as THREE from 'three';
import type { TreeSpecies } from '../core/types';
import { limbMatrix, TriBuilder } from './treeBuilder';
import { SHAPES, range } from './treeSpecies';

/** Radius in metres of the root flare at the foot of a tree of the given scale. */
export function trunkFootRadius(species: TreeSpecies, scale: number): number {
  return SHAPES[species].trunkRadius * TRUNK_THICKNESS * 1.9 * scale;
}

const TRUNK = new THREE.CylinderGeometry(0.62, 1, 1, 6, 6, true);
/** Root flare: widens the trunk foot; its top ring sits a hair outside the trunk (no coplanar faces). */
const FLARE = new THREE.CylinderGeometry(1.1, 1.9, 1, 6, 1, true);
/** Trunks and limbs are thicker than the raw species radius so they read next to the crowns. */
export const TRUNK_THICKNESS = 1.35;
const LIMB = new THREE.CylinderGeometry(0.6, 1, 1, 5, 1, true);

function barkColorer(lightHex: string, darkHex: string, rng: () => number, birch: boolean) {
  const light = new THREE.Color(lightHex);
  const dark = new THREE.Color(darkHex);
  const c = new THREE.Color();
  return (face: number) => {
    // Faces come in quads (2 triangles); colour per quad for birch marks.
    const r = rng();
    if (birch) {
      if (face % 2 === 1) return c; // keep the quad's colour from its first triangle
      return c.copy(r < 0.2 ? dark : light).multiplyScalar(r < 0.2 ? 1 : 0.92 + 0.08 * rng());
    }
    return c.copy(light).lerp(dark, r * 0.6);
  };
}

/** Trunk with 2-3 main branches reaching into the crown. */
export function buildTrunk(species: TreeSpecies, rng: () => number): THREE.BufferGeometry {
  const s = SHAPES[species];
  const b = new TriBuilder();
  const color = barkColorer(s.bark, s.barkDark, rng, species === 'birch');
  const tr = s.trunkRadius * TRUNK_THICKNESS;
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(0, s.trunkHeight / 2, 0),
    new THREE.Quaternion(),
    new THREE.Vector3(tr, s.trunkHeight, tr),
  );
  b.add(TRUNK, m, color);
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + range(rng, -0.4, 0.4);
    const y0 = s.trunkHeight * range(rng, 0.6, 0.8);
    const tilt = s.branchTilt * range(rng, 0.85, 1.15);
    const len = s.branchLength * range(rng, 0.85, 1.1);
    const from = new THREE.Vector3(0, y0, 0);
    const dir = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    const to = from.clone().addScaledVector(dir, len);
    b.add(LIMB, limbMatrix(from, to, tr * 0.5), color);
  }
  // Root flare last, so the colour stream of the trunk and limbs is unchanged.
  const flareH = 0.55;
  b.add(
    FLARE,
    new THREE.Matrix4().compose(new THREE.Vector3(0, flareH / 2, 0), new THREE.Quaternion(), new THREE.Vector3(tr, flareH, tr)),
    species === 'birch' ? barkColorer(s.barkDark, s.barkDark, rng, false) : color,
  );
  return b.build();
}

/** Bare winter crown: a recursive structure of thin limbs filling the crown volume. */
export function buildBareBranches(species: TreeSpecies, rng: () => number): THREE.BufferGeometry {
  const s = SHAPES[species];
  const b = new TriBuilder();
  // Birch twigs are dark red-brown, not white.
  const bark =
    species === 'birch' ? barkColorer('#6a5446', '#4a3a30', rng, false) : barkColorer(s.bark, s.barkDark, rng, false);
  const snow = new THREE.Color('#e9eef2');
  const c = new THREE.Color();
  const color = (face: number, _centroid: THREE.Vector3, normal: THREE.Vector3) => {
    const base = bark(face);
    return normal.y > 0.45 ? c.copy(base).lerp(snow, 0.55) : c.copy(base);
  };
  const crownMid = (s.crownBottom + s.crownTop) / 2;
  const tr = s.trunkRadius * TRUNK_THICKNESS;
  const grow = (from: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, depth: number) => {
    const to = from.clone().addScaledVector(dir, len);
    // Keep twigs inside the crown envelope.
    const horiz = Math.hypot(to.x, to.z);
    if (horiz > s.crownRadius) {
      to.x *= s.crownRadius / horiz;
      to.z *= s.crownRadius / horiz;
    }
    if (to.y > s.crownTop) to.y = s.crownTop;
    b.add(LIMB, limbMatrix(from, to, radius), color);
    if (depth === 0) return;
    const kids = depth === 2 ? 3 : 2;
    for (let k = 0; k < kids; k++) {
      const at = from.clone().lerp(to, range(rng, 0.45, 0.95));
      const spread = range(rng, 0.35, 0.7);
      const az = rng() * Math.PI * 2;
      const nd = dir
        .clone()
        .add(new THREE.Vector3(Math.cos(az) * spread, range(rng, 0, 0.35), Math.sin(az) * spread))
        .normalize();
      grow(at, nd, len * range(rng, 0.5, 0.7), radius * 0.65, depth - 1);
    }
  };
  // Leader continues the trunk up into the crown.
  const top = new THREE.Vector3(0, s.trunkHeight, 0);
  const leaderEnd = Math.max(s.trunkHeight + 0.5, s.crownTop - 0.6);
  b.add(LIMB, limbMatrix(top.clone().setY(top.y - 0.2), new THREE.Vector3(0, leaderEnd, 0), tr * 0.55), color);
  const n = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + range(rng, -0.3, 0.3);
    const y0 = Math.min(s.trunkHeight, crownMid) * range(rng, 0.7, 1.0) + (i / n) * (leaderEnd - s.trunkHeight) * 0.6;
    const tilt = s.branchTilt * range(rng, 0.8, 1.2);
    const dir = new THREE.Vector3(Math.cos(az) * Math.sin(tilt), Math.cos(tilt), Math.sin(az) * Math.sin(tilt));
    grow(new THREE.Vector3(0, y0, 0), dir, s.branchLength * 1.3, tr * 0.6, 2);
  }
  return b.build();
}
