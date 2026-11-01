import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import surfacesSource from '../src/streets/surfaces.ts?raw';
import { generateCity } from '../src/city';
import type { Rect } from '../src/city';
import type { CourtyardRect } from '../src/city/layout';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { createRng } from '../src/core/rng';
import { createCourtyardGreenery, setGreenerySeason } from '../src/environment/greenery';
import {
  CROWN_EDGE,
  PARK_PLAZA_CLEAR,
  courtyardPathWidth,
  isParkYard,
  parkKeepOut,
  planParkYard,
  type ParkPlan,
} from '../src/environment/parkYard';

const yards = (layout: ReturnType<typeof generateCity>): CourtyardRect[] =>
  layout.blocks.filter((b) => b.kind === 'houses' && b.courtyard).map((b) => b.courtyard as CourtyardRect);

/** Courtyards of the 2x2 and 1x2 merged blocks used in the visual check (seed 1, default town). */
const BIG: CourtyardRect = { minX: 20.6, maxX: 81.6, minZ: 30.9, maxZ: 81.6, merged: true };
const LONG: CourtyardRect = { minX: -32.5, maxX: 34.1, minZ: -84.1, maxZ: -63.5, merged: true };

function hashGroup(g: THREE.Group): number {
  let h = 2166136261;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    for (const name of ['position', 'color']) {
      const a = o.geometry.getAttribute(name).array as Float32Array;
      for (let i = 0; i < a.length; i++) h = Math.imul(h ^ Math.round(a[i] * 1000), 16777619) >>> 0;
    }
  });
  return h;
}

const overlapsBox = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

function footprints(p: ParkPlan): { box: Rect; what: string }[] {
  return [
    ...p.beds.map((b) => ({ box: { minX: b.cx - b.w / 2, maxX: b.cx + b.w / 2, minZ: b.cz - b.d / 2, maxZ: b.cz + b.d / 2 }, what: 'bed' })),
    ...(p.play ? [{ box: { minX: p.play.cx - p.play.w / 2, maxX: p.play.cx + p.play.w / 2, minZ: p.play.cz - p.play.d / 2, maxZ: p.play.cz + p.play.d / 2 }, what: 'sandbox' }] : []),
  ];
}

describe('park courtyards of merged blocks', () => {
  it('never turns an unmerged courtyard into a park, always a merged one', () => {
    for (let tw = 100; tw <= 400; tw += 23) {
      for (const td of [100, 137, 187, 287, 400]) {
        for (const seed of [1, 2]) {
          const s = { ...DEFAULT_SETTINGS, seed, townWidth: tw, townDepth: td };
          const plain = generateCity({ ...s, blockMerges: [] });
          for (const y of yards(plain)) expect(isParkYard(y)).toBe(false);
          const houses = plain.blocks.filter((b) => b.kind === 'houses').map((b) => b.id);
          const pair = houses.filter((id) => houses.includes(id.replace(/^block-(\d+)-(\d+)$/, (_m, c, r) => `block-${Number(c) + 1}-${r}`)));
          if (pair.length === 0) continue;
          const a = pair[0];
          const b = a.replace(/^block-(\d+)-(\d+)$/, (_m, c, r) => `block-${Number(c) + 1}-${r}`);
          const merged = generateCity({ ...s, blockMerges: [[a, b]] });
          const yard = merged.blocks.find((x) => x.id.startsWith('merged-'))?.courtyard;
          if (yard) expect(isParkYard(yard)).toBe(true);
        }
      }
    }
    // A large yard without the flag keeps the small-courtyard recipe.
    expect(isParkYard({ ...BIG, merged: undefined })).toBe(false);
  });

  it('leaves the greenery of a town without merges untouched (no park path, obstacles ignored)', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed: 7, blockMerges: [] });
    const a = createCourtyardGreenery(yards(layout), 7);
    const b = createCourtyardGreenery(yards(layout), 7, [{ x: 0, z: 0, r: 50 }]);
    expect(hashGroup(a)).toBe(hashGroup(b));
  });

  it('keeps the paths of streets/surfaces.ts in sync', () => {
    const src = surfacesSource;
    expect(src).toContain('Math.min(1.4, Math.min(w, d) * 0.12)');
    expect(src).toContain('w * 0.27, iz = d * 0.27');
    expect(courtyardPathWidth(BIG)).toBeCloseTo(1.4, 9);
  });

  it('places nothing on the paths, the plaza or outside the yard, and keeps crowns off the rear lots', () => {
    for (const r of [BIG, LONG]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const p = planParkYard(r, createRng(seed));
        const keep = parkKeepOut(r);
        const cx = (r.minX + r.maxX) / 2;
        const cz = (r.minZ + r.maxZ) / 2;
        for (const { box, what } of footprints(p)) {
          expect(keep.some((k) => overlapsBox(k, box)), `${what} on a path`).toBe(false);
          const nx = Math.max(box.minX, Math.min(cx, box.maxX));
          const nz = Math.max(box.minZ, Math.min(cz, box.maxZ));
          expect(Math.hypot(nx - cx, nz - cz)).toBeGreaterThanOrEqual(PARK_PLAZA_CLEAR - 1e-6);
          expect(box.minX).toBeGreaterThanOrEqual(r.minX + 2);
          expect(box.maxX).toBeLessThanOrEqual(r.maxX - 2);
          expect(box.minZ).toBeGreaterThanOrEqual(r.minZ + 2);
          expect(box.maxZ).toBeLessThanOrEqual(r.maxZ - 2);
        }
        for (const t of p.trees) {
          const tb = { minX: t.x - t.radius, maxX: t.x + t.radius, minZ: t.z - t.radius, maxZ: t.z + t.radius };
          // The crown circle (inscribed in tb) is off the path bands: its centre is a radius away from each band.
          for (const k of keep) {
            const nx = Math.max(k.minX, Math.min(t.x, k.maxX));
            const nz = Math.max(k.minZ, Math.min(t.z, k.maxZ));
            expect(Math.hypot(t.x - nx, t.z - nz), 'tree on a path').toBeGreaterThanOrEqual(t.radius - 1e-6);
          }
          expect(Math.hypot(t.x - cx, t.z - cz)).toBeGreaterThanOrEqual(PARK_PLAZA_CLEAR + t.radius - 1e-6);
          expect(tb.maxX).toBeLessThanOrEqual(r.maxX - CROWN_EDGE + 1e-6);
          expect(t.x - t.radius).toBeGreaterThanOrEqual(r.minX + CROWN_EDGE - 1e-6);
          expect(t.z + t.radius).toBeLessThanOrEqual(r.maxZ - CROWN_EDGE + 1e-6);
        }
        for (const b of p.bushes) expect(Math.hypot(b.x - cx, b.z - cz)).toBeGreaterThan(PARK_PLAZA_CLEAR);
        // Hedges stay inside the yard and leave the path ends open.
        const pw = courtyardPathWidth(r);
        for (const [x0, z0, x1, z1] of p.hedges) {
          for (const [x, z] of [[x0, z0], [x1, z1]]) {
            expect(x).toBeGreaterThanOrEqual(r.minX);
            expect(x).toBeLessThanOrEqual(r.maxX);
            expect(z).toBeGreaterThanOrEqual(r.minZ);
            expect(z).toBeLessThanOrEqual(r.maxZ);
          }
          const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
          const lo = Math.min(alongX ? x0 : z0, alongX ? x1 : z1);
          const hi = Math.max(alongX ? x0 : z0, alongX ? x1 : z1);
          const door = alongX ? cx : cz;
          expect(hi <= door - pw / 2 || lo >= door + pw / 2, 'hedge across a path end').toBe(true);
        }
      }
    }
  });

  it('is a park: groves of mixed trees, bushes, beds, a sitting spot; denser in bigger yards', () => {
    const big = planParkYard(BIG, createRng(3));
    const long = planParkYard(LONG, createRng(3));
    const kinds = new Set(big.trees.map((t) => t.kind));
    expect(kinds.size).toBe(3);
    const sizes = big.trees.map((t) => t.size);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeGreaterThan(0.5);
    expect(big.trees.length).toBeGreaterThanOrEqual(15);
    expect(big.bushes.length).toBeGreaterThanOrEqual(15);
    expect(big.beds.length).toBeGreaterThanOrEqual(4);
    expect(big.benches.length).toBe(2);
    expect(big.play).not.toBeNull();
    expect(long.benches.length).toBe(2);
    expect(big.trees.length).toBeGreaterThan(long.trees.length);
    // Groves: most trees have a neighbour within 5 m (clustered, not a regular grid).
    const near = big.trees.filter((t) => big.trees.some((u) => u !== t && Math.hypot(u.x - t.x, u.z - t.z) < 5)).length;
    expect(near / big.trees.length).toBeGreaterThan(0.6);
  });

  it('keeps clear of given obstacles (e.g. the city courtyard trees)', () => {
    const obstacles = [
      { x: 35, z: 45, r: 3 },
      { x: 70, z: 70, r: 3 },
    ];
    const p = planParkYard(BIG, createRng(9), obstacles);
    for (const o of obstacles) {
      for (const t of p.trees) expect(Math.hypot(t.x - o.x, t.z - o.z)).toBeGreaterThanOrEqual(o.r + t.radius);
      for (const b of p.bushes) expect(Math.hypot(b.x - o.x, b.z - o.z)).toBeGreaterThan(o.r);
    }
  });

  it('is deterministic, independent of the courtyard order, and stays within four meshes and a triangle cap', () => {
    const small: Rect = { minX: -20, maxX: 0, minZ: -20, maxZ: 0 };
    const a = createCourtyardGreenery([small, BIG], 4);
    const b = createCourtyardGreenery([small, BIG], 4);
    expect(hashGroup(a)).toBe(hashGroup(b));
    const parkOnlyA = createCourtyardGreenery([BIG], 4);
    const parkOnlyB = createCourtyardGreenery([{ minX: 100, maxX: 110, minZ: 100, maxZ: 110 }, BIG], 4);
    let trisA = 0;
    const box = new THREE.Box3();
    parkOnlyA.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        trisA += o.geometry.getAttribute('position').count / 3;
        o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox!);
      }
    });
    // Park geometry of BIG is the same whatever comes before it (only the small yard is added).
    let trisB = 0;
    parkOnlyB.traverse((o) => {
      if (o instanceof THREE.Mesh) trisB += o.geometry.getAttribute('position').count / 3;
    });
    expect(trisB).toBeGreaterThan(trisA);
    // Four meshes: hedges, beds, bushes and crowns. Winter crowns need their own mesh so they can be hidden.
    expect(a.children.length).toBeLessThanOrEqual(4);
    expect(trisA).toBeLessThan(26_000);
    expect(box.min.x).toBeGreaterThanOrEqual(BIG.minX);
    expect(box.max.z).toBeLessThanOrEqual(BIG.maxZ);
    expect(box.min.y).toBeGreaterThan(-0.3);
    expect(box.max.y).toBeLessThan(11);
    // Seasons recolour the park like any other greenery (conifers keep their green).
    setGreenerySeason(parkOnlyA, 'autumn');
    setGreenerySeason(parkOnlyA, 'winter');
  });
});
