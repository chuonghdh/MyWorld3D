// Courtyard greenery: hedges along the edges (with gaps), flower beds with mixed blooms,
// and round bushes. Everything is low-poly with vertex colours, merged into three meshes
// (hedges, flower beds, bushes) sharing one material, whatever the number of courtyards.

import * as THREE from 'three';
import type { CourtyardRect } from '../city/layout';
import { createRng } from '../core/rng';
import type { Season } from '../core/types';
import { TriBuilder, makeWarp } from './forest';
import { TAG_BLOOM, TAG_FIXED, TAG_FOLIAGE, applySeasonPaint, createPaintState, type PaintState } from './seasonalPaint';
import { attachCloudShade } from './cloudShade';
import { buildParkYard, isParkYard, planParkYard, type ParkObstacle } from './parkYard';

const HEDGE_WIDTH = 0.7;
const HEDGE_INSET = 0.5;

const HEDGE_TONES = ['#355f2a', '#3f6d30', '#2e5524'].map((h) => new THREE.Color(h));
const BUSH_TONES = ['#4a7a34', '#3b6a2c', '#5a8a3c', '#2f5a26'].map((h) => new THREE.Color(h));
const LEAF = new THREE.Color('#3f7a32');
const SOIL = new THREE.Color('#5a3f2c');
const STONE = new THREE.Color('#cbbfa8');
const BLOOM_PALETTES = [
  ['#e0413a', '#f2c94c', '#f7f2ea'],
  ['#e86a9a', '#b07ad8', '#f7f2ea'],
  ['#f28c38', '#f2c94c', '#e0413a'],
  ['#5a7fd8', '#f7f2ea', '#e86a9a'],
].map((p) => p.map((h) => new THREE.Color(h)));

const BOX = new THREE.BoxGeometry(1, 1, 1);
const BLOB = new THREE.IcosahedronGeometry(1, 1);
const BLOOM = new THREE.IcosahedronGeometry(1, 0);
const LEAVES = new THREE.OctahedronGeometry(1, 0);

const range = (rng: () => number, lo: number, hi: number) => lo + (hi - lo) * rng();

function boxMatrix(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(cx, cy, cz),
    new THREE.Quaternion(),
    new THREE.Vector3(sx, sy, sz),
  );
}

/** Shaded colour: lighter on top faces, darker on the underside, small random variation. */
function shaded(base: THREE.Color, normal: THREE.Vector3, rng: () => number, out: THREE.Color): THREE.Color {
  const k = (0.85 + 0.25 * normal.y) * range(rng, 0.92, 1.08);
  return out.copy(base).multiplyScalar(k);
}

export function addHedge(
  b: TriBuilder,
  rng: () => number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  seed: number,
): void {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const h = range(rng, 0.9, 1.15);
  const segs = Math.max(1, Math.round(len / 0.8));
  const geo = new THREE.BoxGeometry(1, 1, 1, alongX ? segs : 1, 2, alongX ? 1 : segs);
  const m = boxMatrix(
    (x0 + x1) / 2,
    h / 2,
    (z0 + z1) / 2,
    alongX ? len : HEDGE_WIDTH,
    h,
    alongX ? HEDGE_WIDTH : len,
  );
  const tone = HEDGE_TONES[Math.floor(rng() * HEDGE_TONES.length)];
  const c = new THREE.Color();
  const warp = makeWarp(seed, 0.09);
  b.tag = TAG_FOLIAGE;
  b.add(
    geo,
    m,
    (_f, centroid, normal) => {
      // Darker towards the ground (fake AO), light on the clipped top.
      const ao = 0.75 + 0.35 * Math.min(1, centroid.y / h);
      return shaded(tone, normal, rng, c).multiplyScalar(ao);
    },
    (v) => {
      if (v.y > 0.05) warp(v); // keep the base on the ground
    },
  );
  geo.dispose();
}

export function addFlowerBed(
  b: TriBuilder,
  rng: () => number,
  cx: number,
  cz: number,
  w: number,
  d: number,
): void {
  const c = new THREE.Color();
  b.tag = TAG_FIXED;
  // Stone border, then the soil slightly raised inside it.
  b.add(BOX, boxMatrix(cx, 0.07, cz, w + 0.3, 0.14, d + 0.3), (_f, _c, n) => shaded(STONE, n, rng, c));
  b.add(BOX, boxMatrix(cx, 0.1, cz, w, 0.2, d), (_f, _c, n) => shaded(SOIL, n, rng, c));
  const palette = BLOOM_PALETTES[Math.floor(rng() * BLOOM_PALETTES.length)];
  const step = 0.34;
  const nx = Math.max(1, Math.floor(w / step));
  const nz = Math.max(1, Math.floor(d / step));
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = cx - w / 2 + (i + 0.5) * (w / nx) + range(rng, -0.08, 0.08);
      const z = cz - d / 2 + (j + 0.5) * (d / nz) + range(rng, -0.08, 0.08);
      const lr = range(rng, 0.14, 0.2);
      q.setFromEuler(e.set(0, rng() * Math.PI, 0));
      b.tag = TAG_FOLIAGE;
      const lm = new THREE.Matrix4().compose(new THREE.Vector3(x, 0.27, z), q, new THREE.Vector3(lr, lr * 0.8, lr));
      b.add(LEAVES, lm, (_f, _c, n) => shaded(LEAF, n, rng, c));
      // Bands of colour across the bed with some mixing, like a planted bed.
      const band = Math.floor((i / nx) * palette.length);
      const tone = rng() < 0.75 ? palette[band] : palette[Math.floor(rng() * palette.length)];
      const br = range(rng, 0.08, 0.12);
      b.tag = TAG_BLOOM;
      const bm = new THREE.Matrix4().compose(
        new THREE.Vector3(x + range(rng, -0.04, 0.04), 0.4 + range(rng, -0.04, 0.05), z),
        q,
        new THREE.Vector3(br, br * 0.75, br),
      );
      b.add(BLOOM, bm, (_f, _c, n) => shaded(tone, n, rng, c));
    }
  }
}

const BUSH_HIGHLIGHT = new THREE.Color('#8fbf5a');

/**
 * Courtyard and park bush: 2 or 3 leaf-mass blobs (same count and detail as before, so the triangle cost is
 * unchanged). The shared rng is drawn exactly as before, so the courtyard layout does not move. The extra variation
 * (blob size, lean, lift, tone, mottling) comes from a private stream seeded by the bush seed.
 * Shape: the lower blobs sit low, so the mass touches the ground. Colour: height light, dark ground contact, leaf
 * mottling with a few dark pockets, and a yellow-green highlight on sun-facing tops.
 */
function addBush(b: TriBuilder, rng: () => number, x: number, z: number, seed: number, fixedSize?: number): void {
  const n = 2 + Math.floor(rng() * 2);
  const baseTone = BUSH_TONES[Math.floor(rng() * BUSH_TONES.length)];
  const size = fixedSize ?? range(rng, 0.55, 0.85);
  const local = createRng((Math.imul(seed, 2654435761) + 97) >>> 0);
  const c = new THREE.Color();
  const tone = new THREE.Color();
  b.tag = TAG_FOLIAGE;
  for (let i = 0; i < n; i++) {
    // Shared-stream draws, in the old order: radius, offset x and z (blobs after the first), then the yaw.
    const r0 = i === 0 ? 1 : range(rng, 0.6, 0.8);
    const ox0 = i === 0 ? 0 : range(rng, -0.5, 0.5);
    const oz0 = i === 0 ? 0 : range(rng, -0.5, 0.5);
    const yaw = rng() * Math.PI;
    // Private stream: each blob's own variation.
    const r = size * r0 * (i === 0 ? range(local, 0.9, 1.1) : 1);
    const ox = ox0 * size + (i === 0 ? range(local, -0.12, 0.12) * size : 0);
    const oz = oz0 * size + (i === 0 ? range(local, -0.12, 0.12) * size : 0);
    const lift = i === 0 ? r * 0.7 : r * (0.55 + 0.25 * local());
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x + ox, lift, z + oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(range(local, -0.18, 0.18), yaw, range(local, -0.18, 0.18))),
      new THREE.Vector3(r, r * 0.8, r),
    );
    tone.copy(baseTone).offsetHSL(range(local, -0.02, 0.02), 0, range(local, -0.05, 0.05));
    const top = r * 1.6;
    b.add(
      BLOB,
      m,
      (_f, centroid, normal) => {
        const shade = (0.85 + 0.25 * normal.y) * range(rng, 0.92, 1.08);
        const height = 0.7 + 0.4 * Math.min(1, Math.max(0, centroid.y) / top);
        const contact = 0.55 + 0.45 * Math.min(1, Math.max(0, centroid.y) / (r * 0.6));
        const mottle = local() < 0.18 ? 0.62 : 1;
        c.copy(tone).multiplyScalar(shade * height * contact * mottle);
        const up = Math.max(0, normal.y);
        if (up > 0.6) c.lerp(BUSH_HIGHLIGHT, 0.12 * up);
        return c;
      },
      makeWarp(seed + i * 131, r * 0.22),
    );
  }
}

interface Placed {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const overlaps = (a: Placed, b: Placed, pad: number) =>
  a.minX - pad < b.maxX && a.maxX + pad > b.minX && a.minZ - pad < b.maxZ && a.maxZ + pad > b.minZ;

/**
 * Hedges, flower beds and bushes for each courtyard. Returns a group of three merged meshes
 * ('greenery-hedges', 'greenery-beds', 'greenery-bushes') sharing one vertex-colour material.
 * Ground level is y = 0.
 *
 * Courtyards flagged `merged` (the shared yard of a merged block, see parkYard.ts `isParkYard`) are laid out as one park:
 * groves of small trees, bushes, beds along the paths, a sitting spot and hedges along the rear lots. Smaller
 * courtyards keep the original recipe unchanged. `obstacles` (optional) are circles to keep clear in parks, e.g. the
 * city's own courtyard trees.
 */
export function createCourtyardGreenery(
  courtyards: readonly CourtyardRect[],
  seed: number,
  obstacles: readonly ParkObstacle[] = [],
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'courtyard-greenery';
  const hedges = new TriBuilder();
  const beds = new TriBuilder();
  const bushes = new TriBuilder();

  courtyards.forEach((r, ci) => {
    const rng = createRng((seed * 7919 + ci * 104729 + 17) >>> 0);
    const w = r.maxX - r.minX;
    const d = r.maxZ - r.minZ;
    if (w < 3 || d < 3) return;
    if (isParkYard(r)) {
      // Own stream keyed by the yard's position, so the park does not depend on the courtyard order.
      const parkSeed = ((seed * 7919) ^ Math.imul(Math.round(r.minX * 10), 73856093) ^ Math.imul(Math.round(r.minZ * 10), 19349663) ^ 0x5bd1e995) >>> 0;
      const prng = createRng(parkSeed);
      const inside = obstacles.filter((o) => o.x > r.minX && o.x < r.maxX && o.z > r.minZ && o.z < r.maxZ);
      const plan = planParkYard(r, prng, inside);
      buildParkYard(
        plan,
        { hedges, beds, bushes },
        {
          hedge: (b, x0, z0, x1, z1, s) => addHedge(b, prng, x0, z0, x1, z1, s),
          bed: (b, cx, cz, bw, bd) => addFlowerBed(b, prng, cx, cz, bw, bd),
          bush: (b, x, z, size, s) => addBush(b, prng, x, z, s, size),
        },
        prng,
        parkSeed,
      );
      return;
    }
    const placed: Placed[] = [];

    // Hedges along the four edges, each run broken by 1.2-2.2 m gaps.
    if (w >= 6 && d >= 6) {
      const x0 = r.minX + HEDGE_INSET + HEDGE_WIDTH / 2;
      const x1 = r.maxX - HEDGE_INSET - HEDGE_WIDTH / 2;
      const z0 = r.minZ + HEDGE_INSET + HEDGE_WIDTH / 2;
      const z1 = r.maxZ - HEDGE_INSET - HEDGE_WIDTH / 2;
      const runs: [number, number, number, number][] = [
        [x0 - HEDGE_WIDTH / 2, z0, x1 + HEDGE_WIDTH / 2, z0],
        [x0 - HEDGE_WIDTH / 2, z1, x1 + HEDGE_WIDTH / 2, z1],
        [x0, z0 + HEDGE_WIDTH / 2, x0, z1 - HEDGE_WIDTH / 2],
        [x1, z0 + HEDGE_WIDTH / 2, x1, z1 - HEDGE_WIDTH / 2],
      ];
      runs.forEach(([ax, az, bx, bz], ri) => {
        const len = Math.hypot(bx - ax, bz - az);
        const ux = (bx - ax) / len;
        const uz = (bz - az) / len;
        let s = range(rng, 0, 0.8);
        let k = 0;
        while (s < len - 0.8) {
          const seg = Math.min(range(rng, 3, 6), len - s);
          if (seg >= 1) {
            addHedge(hedges, rng, ax + ux * s, az + uz * s, ax + ux * (s + seg), az + uz * (s + seg), seed + ci * 977 + ri * 97 + k++);
          }
          s += seg + range(rng, 1.2, 2.2);
        }
      });
    }

    // Interior area kept clear of the hedges.
    const inner = { minX: r.minX + 2, maxX: r.maxX - 2, minZ: r.minZ + 2, maxZ: r.maxZ - 2 };
    const iw = inner.maxX - inner.minX;
    const id = inner.maxZ - inner.minZ;

    // 2-4 flower beds.
    if (iw >= 3 && id >= 2) {
      const want = 2 + Math.floor(rng() * 3);
      for (let tries = 0, made = 0; made < want && tries < 30; tries++) {
        const bw = Math.min(iw, range(rng, 2, 3.6));
        const bd = Math.min(id, range(rng, 1.1, 1.9));
        const rot = rng() < 0.5;
        const ew = rot ? bd : bw;
        const ed = rot ? bw : bd;
        if (ew > iw || ed > id) continue;
        const cx = range(rng, inner.minX + ew / 2, inner.maxX - ew / 2);
        const cz = range(rng, inner.minZ + ed / 2, inner.maxZ - ed / 2);
        const box = { minX: cx - ew / 2, maxX: cx + ew / 2, minZ: cz - ed / 2, maxZ: cz + ed / 2 };
        if (placed.some((p) => overlaps(p, box, 1.2))) continue;
        placed.push(box);
        addFlowerBed(beds, rng, cx, cz, ew, ed);
        made++;
      }
    }

    // A few round bushes, preferably near the corners of the courtyard.
    const nb = 3 + Math.floor(rng() * 3);
    for (let tries = 0, made = 0; made < nb && tries < 30; tries++) {
      const nearCorner = rng() < 0.6;
      const span = (lo: number, hi: number) =>
        nearCorner
          ? rng() < 0.5
            ? range(rng, lo, lo + 1.2)
            : range(rng, hi - 1.2, hi)
          : range(rng, lo, hi);
      const x = span(r.minX + 1.8, r.maxX - 1.8);
      const z = span(r.minZ + 1.8, r.maxZ - 1.8);
      const box = { minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.9, maxZ: z + 0.9 };
      if (placed.some((p) => overlaps(p, box, 0.3))) continue;
      placed.push(box);
      addBush(bushes, rng, x, z, seed + ci * 31 + made * 7);
      made++;
    }
  });

  const material = attachCloudShade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
  const states = new Map<THREE.Mesh, PaintState>();
  const parts: [TriBuilder, string][] = [
    [hedges, 'greenery-hedges'],
    [beds, 'greenery-beds'],
    [bushes, 'greenery-bushes'],
  ];
  for (const [builder, name] of parts) {
    if (builder.triangleCount === 0) continue;
    const mesh = new THREE.Mesh(builder.build(), material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    states.set(mesh, createPaintState(mesh.geometry, new Float32Array(builder.tags)));
  }
  /** Recolours hedges, bush leaves and blooms for a season (summer is the built-in look). */
  group.userData.setSeason = (season: Season) => {
    for (const [mesh, state] of states) applySeasonPaint(mesh.geometry, state, season);
  };
  return group;
}

/** Seasonal recolour of a group made by createCourtyardGreenery. */
export function setGreenerySeason(group: THREE.Group, season: Season): void {
  (group.userData.setSeason as ((s: Season) => void) | undefined)?.(season);
}
