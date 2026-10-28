import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildMonument, MONUMENT_KINDS } from '../src/buildings';
import { getBodyMaterial, getGlassLitMaterial, getGlassMaterial } from '../src/buildings/materials';

const SHARED = new Set<THREE.Material>([getBodyMaterial(), getGlassMaterial(), getGlassLitMaterial()]);
const TOL = 0.5;
const BUDGET = 40000;

function meshes(group: THREE.Group): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function triangles(group: THREE.Group): number {
  let n = 0;
  for (const m of meshes(group)) {
    const g = m.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  }
  return n;
}

function bounds(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(group);
}

function expectFits(group: THREE.Group, w: number, d: number): void {
  const b = bounds(group);
  expect(b.min.x).toBeGreaterThanOrEqual(-w / 2 - TOL);
  expect(b.max.x).toBeLessThanOrEqual(w / 2 + TOL);
  expect(b.min.z).toBeGreaterThanOrEqual(-d / 2 - TOL);
  expect(b.max.z).toBeLessThanOrEqual(d / 2 + TOL);
  expect(b.min.y).toBeGreaterThanOrEqual(-0.01);
}

describe('monuments', () => {
  it.each(MONUMENT_KINDS)('%s builds with at most 3 meshes on shared materials', (kind) => {
    const g = buildMonument(kind);
    const ms = meshes(g);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.length).toBeLessThanOrEqual(3);
    for (const m of ms) expect(SHARED.has(m.material as THREE.Material)).toBe(true);
    expect(bounds(g).max.y).toBeGreaterThan(2);
  });

  it.each(MONUMENT_KINDS)('%s fits the default 34 x 34 block', (kind) => {
    expectFits(buildMonument(kind), 34, 34);
  });

  it.each(MONUMENT_KINDS)('%s respects a custom width and depth', (kind) => {
    for (const [w, d] of [
      [26, 30],
      [40, 22],
      [48, 44],
    ] as const) {
      expectFits(buildMonument(kind, { width: w, depth: d, seed: 3 }), w, d);
    }
  });

  it.each(MONUMENT_KINDS)('%s is deterministic for a seed', (kind) => {
    const a = buildMonument(kind, { seed: 7 });
    const b = buildMonument(kind, { seed: 7 });
    const ma = meshes(a);
    const mb = meshes(b);
    expect(ma.map((m) => m.name)).toEqual(mb.map((m) => m.name));
    for (let i = 0; i < ma.length; i++) {
      const pa = ma[i].geometry.getAttribute('position').array;
      const pb = mb[i].geometry.getAttribute('position').array;
      expect(pa.length).toBe(pb.length);
      expect(Array.from(pa)).toEqual(Array.from(pb));
      expect(Array.from(ma[i].geometry.getAttribute('color').array)).toEqual(Array.from(mb[i].geometry.getAttribute('color').array));
    }
  });

  it.each(MONUMENT_KINDS)('%s stays under the triangle budget', (kind) => {
    for (const seed of [1, 2, 3]) {
      const n = triangles(buildMonument(kind, { seed }));
      expect(n).toBeLessThan(BUDGET);
    }
  });

  it('has lit glass for night on every kind', () => {
    for (const kind of MONUMENT_KINDS) {
      const names = meshes(buildMonument(kind)).map((m) => m.name);
      expect(names).toContain('glassLit');
    }
  });

  it('reports triangle counts', () => {
    const counts = Object.fromEntries(MONUMENT_KINDS.map((k) => [k, triangles(buildMonument(k))]));
    console.log('monument triangles', counts);
    expect(Object.keys(counts).length).toBe(MONUMENT_KINDS.length);
  });
});
