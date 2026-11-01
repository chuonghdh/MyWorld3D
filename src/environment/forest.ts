// Instanced street, courtyard and plaza trees.
//
// One InstancedMesh per species and part:
//   trunk (with 2-3 main branches)      x 1 per species
//   crown variant                        x CROWN_VARIANTS per species
//   bare winter branches                 x 1 per species (only visible in winter)
// so 4 species give at most 12 visible draw calls in any season.
//
// Crowns are 5-9 merged, jittered low-poly blobs with vertex colours: 2-3 tones per crown,
// lighter on top, darker underneath. The season is a recolour of the vertex colours, no new
// geometry. Tree units: metres, base at y = 0, crown radius 2-3.5 m, total height 6-9 m at scale 1.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { Season, TreeSpecies, Vec2 } from '../core/types';
import { attachWeather } from '../shaders/wetSurface';
import { attachCloudShade } from './cloudShade';
import { autumnLeafColor } from './leafVariety';
import { TREE_SPECIES, applyWindSway, createFoliageMaterial, type WindUniforms } from './trees';
import {
  blossomShare,
  chooseVariant,
  treeTint,
  treeVariation,
  type BlossomColor,
  type TreeVariation,
} from './seasons';

export interface TreeFieldItem {
  id: string;
  position: Vec2;
  species: TreeSpecies;
  scale: number;
}

export interface TreeFieldOptions {
  season: Season;
  uniforms: WindUniforms;
  seed?: number;
}

export interface TreeField {
  group: THREE.Group;
  setSeason(season: Season): void;
  /** Tree id for a raycast hit on one of the field's InstancedMeshes, else null. */
  treeIdAt(object: THREE.Object3D, instanceId: number): string | null;
  dispose(): void;
}

/** Number of different crown shapes per species. */
export const CROWN_VARIANTS = 2;

// ---------------------------------------------------------------------------
// Geometry builder (non-indexed triangles with vertex colours)
// ---------------------------------------------------------------------------

export class TriBuilder {
  readonly positions: number[] = [];
  readonly colors: number[] = [];
  /** Per-vertex tag (see seasonalPaint); set `tag` before calling add(). */
  readonly tags: number[] = [];
  tag = 0;

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /**
   * Appends `geo` transformed by `matrix`. `colorOf(faceIndex, centroid, normal)` returns the
   * flat colour of each triangle (centroid and normal are after the transform).
   * `warp` may move each transformed vertex (it must be a pure function of the position so that
   * shared corners stay welded).
   */
  add(
    geo: THREE.BufferGeometry,
    matrix: THREE.Matrix4,
    colorOf: (face: number, centroid: THREE.Vector3, normal: THREE.Vector3) => THREE.Color,
    warp?: (v: THREE.Vector3) => void,
  ): void {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.getAttribute('position');
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const centroid = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const ab = new THREE.Vector3();
    for (let i = 0, f = 0; i < pos.count; i += 3, f++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(matrix);
      c.fromBufferAttribute(pos, i + 2).applyMatrix4(matrix);
      if (warp) {
        warp(a);
        warp(b);
        warp(c);
      }
      centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      normal.subVectors(c, b).cross(ab.subVectors(a, b)).normalize();
      const col = colorOf(f, centroid, normal);
      for (const v of [a, b, c]) {
        this.positions.push(v.x, v.y, v.z);
        this.colors.push(col.r, col.g, col.b);
        this.tags.push(this.tag);
      }
    }
    if (src !== geo) src.dispose();
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Deterministic jitter field: the same input position always gets the same offset. */
export function makeWarp(seed: number, amount: number): (v: THREE.Vector3) => void {
  return (v) => {
    const k = (x: number) => Math.round(x * 1000);
    const h = hash3(k(v.x), k(v.y), k(v.z), seed);
    v.x += (((h & 0x3ff) / 1023) * 2 - 1) * amount;
    v.y += ((((h >>> 10) & 0x3ff) / 1023) * 2 - 1) * amount;
    v.z += ((((h >>> 20) & 0x3ff) / 1023) * 2 - 1) * amount;
  };
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ y, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16) ^ z, 0x27d4eb2f);
  h ^= h >>> 15;
  return h >>> 0;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Matrix placing a unit cylinder (height 1, centred) between two points. */
function limbMatrix(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(radius, len, radius));
}

// ---------------------------------------------------------------------------
// Species shapes
// ---------------------------------------------------------------------------

interface Blob {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

interface SpeciesShape {
  trunkHeight: number;
  trunkRadius: number;
  /** Main branch direction: angle from vertical in radians. */
  branchTilt: number;
  branchLength: number;
  /** Where the crown starts and ends (for bare winter branches). */
  crownBottom: number;
  crownTop: number;
  crownRadius: number;
  bark: string;
  barkDark: string;
  crown(rng: () => number): Blob[];
}

const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

const SHAPES: Record<TreeSpecies, SpeciesShape> = {
  // Rounded crown, centre ~5 m, radius ~2.7 m, top ~7.6 m.
  maple: {
    trunkHeight: 3.6,
    trunkRadius: 0.2,
    branchTilt: 0.65,
    branchLength: 2.0,
    crownBottom: 3.0,
    crownTop: 7.4,
    crownRadius: 2.4,
    bark: '#5e4a3a',
    barkDark: '#45352a',
    crown(rng) {
      const blobs: Blob[] = [];
      const cy = 5.0;
      const core = range(rng, 1.55, 1.75);
      blobs.push({ x: 0, y: cy, z: 0, rx: core, ry: core * 0.92, rz: core });
      const n = 6 + Math.floor(rng() * 3); // 6-8 around the core
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + range(rng, -0.35, 0.35);
        const el = range(rng, -0.45, 0.95);
        const d = range(rng, 1.15, 1.45);
        const r = range(rng, 0.95, 1.3);
        blobs.push({
          x: Math.cos(az) * Math.cos(el) * d,
          y: cy + Math.sin(el) * d * 0.9,
          z: Math.sin(az) * Math.cos(el) * d,
          rx: r,
          ry: r * range(rng, 0.85, 1.0),
          rz: r,
        });
      }
      return blobs;
    },
  },
  // Wide, irregular, low crown: centre ~4.4 m, radius ~3.3 m, top ~6.7 m.
  oak: {
    trunkHeight: 3.0,
    trunkRadius: 0.27,
    branchTilt: 0.95,
    branchLength: 2.4,
    crownBottom: 2.7,
    crownTop: 6.4,
    crownRadius: 2.9,
    bark: '#4f4033',
    barkDark: '#3a2f26',
    crown(rng) {
      const blobs: Blob[] = [];
      const cy = 4.4;
      const n = 7 + Math.floor(rng() * 3); // 7-9
      const stretch = range(rng, 0.8, 1.15);
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + range(rng, -0.5, 0.5);
        const d = i === 0 ? 0 : range(rng, 0.9, 2.0);
        const r = range(rng, 1.1, 1.55);
        blobs.push({
          x: Math.cos(az) * d * stretch,
          y: cy + range(rng, -0.55, 0.75) - d * 0.12,
          z: (Math.sin(az) * d) / stretch,
          rx: r,
          ry: r * range(rng, 0.68, 0.85),
          rz: r * range(rng, 0.9, 1.1),
        });
      }
      return blobs;
    },
  },
  // Narrow oval crown on a tall white trunk: radius ~1.7 m, top ~8.5 m.
  birch: {
    trunkHeight: 6.4,
    trunkRadius: 0.15,
    branchTilt: 0.45,
    branchLength: 1.5,
    crownBottom: 3.6,
    crownTop: 8.3,
    crownRadius: 1.5,
    bark: '#ece8df',
    barkDark: '#2a2624',
    crown(rng) {
      const blobs: Blob[] = [];
      const n = 5 + Math.floor(rng() * 3); // 5-7
      const lo = 4.4;
      const hi = 7.6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const bulge = Math.sin(Math.PI * (0.15 + 0.75 * t)); // widest a little below the middle
        const r = (0.75 + 0.4 * bulge) * range(rng, 0.9, 1.1);
        const az = rng() * Math.PI * 2;
        const off = range(rng, 0.15, 0.55) * bulge;
        blobs.push({
          x: Math.cos(az) * off,
          y: lo + (hi - lo) * t + range(rng, -0.2, 0.2),
          z: Math.sin(az) * off,
          rx: r,
          ry: r * range(rng, 1.15, 1.35),
          rz: r,
        });
      }
      return blobs;
    },
  },
  // Conical, upright crown: base radius ~2.3 m at 3.6 m, tip ~8.6 m.
  ginkgo: {
    trunkHeight: 6.8,
    trunkRadius: 0.19,
    branchTilt: 0.5,
    branchLength: 1.8,
    crownBottom: 3.0,
    crownTop: 8.4,
    crownRadius: 2.0,
    bark: '#5a4b3e',
    barkDark: '#423629',
    crown(rng) {
      const blobs: Blob[] = [];
      const n = 6 + Math.floor(rng() * 3); // 6-8
      const lo = 3.9;
      const hi = 7.9;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = (1.35 * (1 - 0.68 * t) + 0.3) * range(rng, 0.9, 1.1);
        const az = rng() * Math.PI * 2;
        const off = range(rng, 0.2, 0.75) * (1 - t) * 1.2;
        blobs.push({
          x: Math.cos(az) * off,
          y: lo + (hi - lo) * Math.pow(t, 0.9),
          z: Math.sin(az) * off,
          rx: r,
          ry: r * range(rng, 0.8, 1.0),
          rz: r,
        });
      }
      return blobs;
    },
  },
};

// ---------------------------------------------------------------------------
// Season palettes (2-3 tones per crown)
// ---------------------------------------------------------------------------

// Green tones per species. Autumn is not per species: every crown takes the shared red/orange/yellow mix.
const TONES: Record<TreeSpecies, Record<'spring' | 'summer', string[]>> = {
  maple: {
    spring: ['#9ccc5a', '#b6da72', '#86bd4a'],
    summer: ['#37722c', '#468a36', '#2d6126'],
  },
  oak: {
    spring: ['#a6c86b', '#93b85a', '#bcd67f'],
    summer: ['#3a7438', '#44823f', '#2f6a35'],
  },
  birch: {
    spring: ['#c4e886', '#b0d872', '#d4f09a'],
    summer: ['#82bc50', '#6fa842', '#94cc62'],
  },
  ginkgo: {
    spring: ['#8fd16a', '#7cc058', '#a6de82'],
    summer: ['#3f9a52', '#4cab5e', '#348646'],
  },
};
const BLOSSOM: Record<BlossomColor, THREE.Color[]> = {
  pink: [new THREE.Color('#f4a8c0'), new THREE.Color('#fbeef2')],
  white: [new THREE.Color('#fbfaf4'), new THREE.Color('#eef4e6')],
  cream: [new THREE.Color('#f3ecc0'), new THREE.Color('#fbf6dc')],
};

const toneCache = new Map<string, THREE.Color[]>();
function tonesFor(species: TreeSpecies, season: 'spring' | 'summer'): THREE.Color[] {
  const key = species + season;
  let c = toneCache.get(key);
  if (!c) {
    c = TONES[species][season].map((h) => new THREE.Color(h));
    toneCache.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Crown, trunk and bare-branch geometry
// ---------------------------------------------------------------------------

interface CrownGeometry {
  geometry: THREE.BufferGeometry;
  /** Per vertex: [blobRand, faceRand, shade, height 0..1]. */
  data: Float32Array;
}

const BLOB = new THREE.IcosahedronGeometry(1, 1);

function buildCrown(species: TreeSpecies, rng: () => number, warpSeed: number): CrownGeometry {
  const shape = SHAPES[species];
  const blobs = shape.crown(rng);
  const b = new TriBuilder();
  const data: number[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const bl of blobs) {
    minY = Math.min(minY, bl.y - bl.ry);
    maxY = Math.max(maxY, bl.y + bl.ry);
  }
  const white = new THREE.Color(1, 1, 1);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < blobs.length; i++) {
    const bl = blobs[i];
    const blobRand = rng();
    q.setFromEuler(new THREE.Euler(range(rng, -0.3, 0.3), rng() * Math.PI * 2, range(rng, -0.3, 0.3)));
    m.compose(new THREE.Vector3(bl.x, bl.y, bl.z), q, new THREE.Vector3(bl.rx, bl.ry, bl.rz));
    const warp = makeWarp(warpSeed + i * 7919, Math.min(bl.rx, bl.ry) * 0.16);
    b.add(
      BLOB,
      m,
      (_f, centroid, normal) => {
        const t = (centroid.y - minY) / Math.max(0.01, maxY - minY);
        const shade = (0.58 + 0.52 * t + 0.1 * normal.y) * range(rng, 0.9, 1.1);
        const faceRand = rng();
        data.push(
          blobRand, faceRand, shade, t,
          blobRand, faceRand, shade, t,
          blobRand, faceRand, shade, t,
        );
        return white;
      },
      warp,
    );
  }
  return { geometry: b.build(), data: new Float32Array(data) };
}

const _hsl = { h: 0, s: 0, l: 0 };

function recolorCrown(crown: CrownGeometry, species: TreeSpecies, season: Season): void {
  if (season === 'winter') return; // crowns are hidden
  const autumn = season === 'autumn';
  const tones = autumn ? null : tonesFor(species, season);
  const blossoms = blossomShare(species, season);
  const attr = crown.geometry.getAttribute('color') as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const d = crown.data;
  const c = new THREE.Color();
  for (let v = 0; v < attr.count; v++) {
    const blobRand = d[v * 4];
    const faceRand = d[v * 4 + 1];
    const shade = d[v * 4 + 2];
    const height = d[v * 4 + 3];
    if (blossoms && (blobRand * 7.31) % 1 < blossoms.blobShare && faceRand > blossoms.faceMin) {
      c.copy(BLOSSOM[blossoms.color][faceRand > 0.8 ? 1 : 0]);
      arr[v * 3] = c.r * Math.min(1.15, shade + 0.15);
      arr[v * 3 + 1] = c.g * Math.min(1.15, shade + 0.15);
      arr[v * 3 + 2] = c.b * Math.min(1.15, shade + 0.15);
      continue;
    }
    if (tones) {
      // Each blob has a dominant tone; ~35% of its faces take one of the other tones.
      let idx = Math.floor(blobRand * tones.length) % tones.length;
      if (faceRand > 0.65) idx = Math.floor(((faceRand - 0.65) / 0.35) * tones.length) % tones.length;
      c.copy(tones[idx]);
      // Seeded per-island spread: hue, saturation and lightness, kept inside the green range.
      c.getHSL(_hsl);
      c.setHSL(
        _hsl.h + (faceRand - 0.5) * 0.03,
        Math.min(1, Math.max(0, _hsl.s + (blobRand - 0.5) * 0.12)),
        Math.min(1, Math.max(0, _hsl.l + (blobRand - 0.5) * 0.08)),
      );
    } else {
      // Autumn: red, orange and yellow mixed on one crown, yellow up top.
      autumnLeafColor(height, (faceRand + blobRand * 0.37) % 1, c);
    }
    // Autumn leaves are lifted so the shadowed side stays red or gold, not brown.
    const sh = autumn ? 0.8 + 0.25 * shade : shade;
    arr[v * 3] = c.r * sh;
    arr[v * 3 + 1] = c.g * sh;
    arr[v * 3 + 2] = c.b * sh;
  }
  attr.needsUpdate = true;
}

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
function buildTrunk(species: TreeSpecies, rng: () => number): THREE.BufferGeometry {
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
function buildBareBranches(species: TreeSpecies, rng: () => number): THREE.BufferGeometry {
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

// ---------------------------------------------------------------------------
// Tree field
// ---------------------------------------------------------------------------

interface CrownMesh {
  mesh: THREE.InstancedMesh;
  crown: CrownGeometry;
  species: TreeSpecies;
  /** Per-instance variation, in instance order, for the seasonal colour tint. */
  variations: TreeVariation[];
}

/**
 * Builds every tree as instances: one InstancedMesh per species and part.
 * The group's meshes carry `userData.treeIds` (instance index to tree id).
 */
export function createTreeField(
  trees: readonly TreeFieldItem[],
  opts: TreeFieldOptions,
): TreeField {
  const seed = opts.seed ?? 1;
  const group = new THREE.Group();
  group.name = 'tree-field';

  const foliage = createFoliageMaterial({
    species: 'maple',
    season: opts.season,
    uniforms: opts.uniforms,
    vertexColors: true,
    flatShading: true,
  });
  const bark = attachCloudShade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  // Bare twigs take the shared snow cover (up-facing faces) like buildings and streets.
  const twigs = attachWeather(
    applyWindSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), opts.uniforms),
  );

  const geometries: THREE.BufferGeometry[] = [];
  const crowns: CrownMesh[] = [];
  const bareMeshes: THREE.InstancedMesh[] = [];
  const ours = new Set<THREE.Object3D>();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], ids: string[], name: string) => {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.treeIds = ids;
    group.add(mesh);
    ours.add(mesh);
    return mesh;
  };

  TREE_SPECIES.forEach((species, si) => {
    const list = trees.filter((t) => t.species === species);
    if (list.length === 0) return;
    const allMatrices: THREE.Matrix4[] = [];
    const allIds: string[] = [];
    const byVariant: { matrices: THREE.Matrix4[]; ids: string[]; variations: TreeVariation[] }[] = Array.from(
      { length: CROWN_VARIANTS },
      () => ({ matrices: [], ids: [], variations: [] }),
    );
    for (const t of list) {
      const rng = createRng((hashString(t.id) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
      const v = treeVariation(rng);
      const variant = chooseVariant(v.variantRoll, CROWN_VARIANTS);
      const sxz = t.scale * v.width;
      const sy = t.scale * v.height;
      // Yaw first, then a slight lean about the base, so no two trees stand exactly upright alike.
      const q = new THREE.Quaternion()
        .setFromAxisAngle(UP, v.yaw)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v.leanX, 0, v.leanZ)));
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(t.position.x, 0, t.position.z),
        q,
        new THREE.Vector3(sxz * range(rng, 0.94, 1.06), sy, sxz),
      );
      allMatrices.push(m);
      allIds.push(t.id);
      byVariant[variant].matrices.push(m);
      byVariant[variant].ids.push(t.id);
      byVariant[variant].variations.push(v);
    }

    const speciesSeed = (seed * 1013 + si * 101) >>> 0;
    const trunkGeo = buildTrunk(species, createRng(speciesSeed + 1));
    const bareGeo = buildBareBranches(species, createRng(speciesSeed + 2));
    geometries.push(trunkGeo, bareGeo);
    add(trunkGeo, bark, allMatrices, allIds, `tree-trunk-${species}`);
    bareMeshes.push(add(bareGeo, twigs, allMatrices, allIds, `tree-bare-${species}`));

    byVariant.forEach((v, vi) => {
      if (v.matrices.length === 0) return;
      const crown = buildCrown(species, createRng(speciesSeed + 17 * (vi + 1)), speciesSeed + vi * 31);
      geometries.push(crown.geometry);
      const mesh = add(crown.geometry, foliage, v.matrices, v.ids, `tree-crown-${species}-${vi}`);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // allocates the instance colour buffer
      crowns.push({ mesh, crown, species, variations: v.variations });
    });
  });

  const tint = new THREE.Color();
  const applyTints = (c: CrownMesh, season: Season) => {
    for (let i = 0; i < c.variations.length; i++) {
      const [r, g, b] = treeTint(c.variations[i], season);
      c.mesh.setColorAt(i, tint.setRGB(r, g, b));
    }
    if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
  };

  const setSeason = (season: Season) => {
    const winter = season === 'winter';
    for (const c of crowns) {
      c.mesh.visible = !winter;
      recolorCrown(c.crown, c.species, season);
      applyTints(c, season);
    }
    for (const m of bareMeshes) m.visible = winter;
  };
  setSeason(opts.season);

  return {
    group,
    setSeason,
    treeIdAt(object, instanceId) {
      if (!ours.has(object)) return null;
      const ids = object.userData.treeIds as string[];
      return ids[instanceId] ?? null;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const o of ours) (o as THREE.InstancedMesh).dispose();
      foliage.dispose();
      bark.dispose();
      twigs.dispose();
      group.clear();
      ours.clear();
    },
  };
}
