// Procedural tree crowns: season palettes, the merged blob crown geometry and its seasonal recolour.

import * as THREE from 'three';
import type { Season, TreeSpecies } from '../core/types';
import { autumnLeafColor } from './leafVariety';
import { blossomShare, type BlossomColor } from './seasons';
import { makeWarp, TriBuilder } from './treeBuilder';
import { SHAPES, range } from './treeSpecies';

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

export interface CrownGeometry {
  geometry: THREE.BufferGeometry;
  /** Per vertex: [blobRand, faceRand, shade, height 0..1]. */
  data: Float32Array;
}

const BLOB = new THREE.IcosahedronGeometry(1, 1);

export function buildCrown(species: TreeSpecies, rng: () => number, warpSeed: number): CrownGeometry {
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

export function recolorCrown(crown: CrownGeometry, species: TreeSpecies, season: Season): void {
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
