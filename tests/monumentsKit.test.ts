import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Kit, waterBasin, windowAt, wing } from '../src/buildings/monuments/kit';

function allMeshes(group: THREE.Group): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function triangleCount(group: THREE.Group): number {
  let n = 0;
  for (const m of allMeshes(group)) {
    const g = m.geometry;
    n += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  }
  return n;
}

/** Smallest triangle area over a geometry (indexed or not). */
function minTriangleArea(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute('position');
  const idx = geo.index;
  const n = idx ? idx.count : p.count;
  let min = Infinity;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    const ia = idx ? idx.getX(i) : i;
    const ib = idx ? idx.getX(i + 1) : i + 1;
    const ic = idx ? idx.getX(i + 2) : i + 2;
    a.fromBufferAttribute(p, ia);
    b.fromBufferAttribute(p, ib);
    c.fromBufferAttribute(p, ic);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    min = Math.min(min, area);
  }
  return min;
}

function maxYOf(group: THREE.Group, name: string): number {
  let top = -Infinity;
  for (const m of allMeshes(group)) {
    if (m.name !== name) continue;
    const p = m.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  }
  return top;
}

describe('waterBasin', () => {
  const rim = { w: 6, d: 4, coping: 0.4 };

  it('emits no zero-area triangles', () => {
    const k = new Kit(1);
    waterBasin(k, rim, 0.5, '#3fc1c9');
    const group = k.batch.build();
    const meshes = allMeshes(group);
    expect(meshes.length).toBeGreaterThan(0);
    for (const m of meshes) expect(minTriangleArea(m.geometry)).toBeGreaterThan(1e-9);
  });

  it('keeps the water surface below the deck top (y = 0)', () => {
    const k = new Kit(1);
    waterBasin(k, rim, 0.5, '#3fc1c9');
    const group = k.batch.build();
    const waterTop = maxYOf(group, 'glass');
    expect(waterTop).toBeLessThan(-0.05);
    // The coping is the only thing standing above the deck, and it is not water.
    expect(maxYOf(group, 'body')).toBeGreaterThan(0);
  });

  it('uses only body and glass targets and no wind uv', () => {
    const k = new Kit(1);
    waterBasin(k, rim, 0.5, '#3fc1c9');
    const group = k.batch.build();
    const names = allMeshes(group).map((m) => m.name).sort();
    expect(names).toEqual(['body', 'glass']);
    for (const m of allMeshes(group)) {
      const uv = m.geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) {
        expect(uv.getX(i)).toBe(0);
        expect(uv.getY(i)).toBe(0);
      }
    }
  });

  it('rejects sizes that cannot hold a pit', () => {
    const k = new Kit(1);
    expect(() => waterBasin(k, { w: 0.5, d: 4, coping: 0.4 }, 0.5, '#3fc1c9')).toThrow();
    expect(() => waterBasin(new Kit(1), rim, 0.05, '#3fc1c9')).toThrow();
  });
});

function wingKit(bayOpenings?: { u: number; w: number; h: number; depth: number }[]): Kit {
  const k = new Kit(1);
  wing(k, {
    x: 0, z: 0, w: 10, d: 4, floors: 2, groundH: 4, floorH: 3,
    wall: '#ffffff', trim: '#eeeeee', base: '#999999', faces: {}, cornice: false, bayOpenings,
  });
  return k;
}

describe('wing bay openings', () => {
  it('default (no openings) matches an empty opening list exactly', () => {
    expect(triangleCount(wingKit().batch.build())).toBe(triangleCount(wingKit([]).batch.build()));
  });

  it('emits no zero-area triangles and leaves the recess void empty', () => {
    const opening = { u: 0, w: 3, h: 2.5, depth: 1 };
    const group = wingKit([opening]).batch.build();
    for (const m of allMeshes(group)) expect(minTriangleArea(m.geometry)).toBeGreaterThan(1e-9);
    // Recess void: x in span, y in (0, h), z between the back of the recess (-2 + 1 = -1 at front z=2 minus depth) and the front.
    const frontZ = 2;
    const backZ = frontZ - opening.depth;
    for (const m of allMeshes(group)) {
      const p = m.geometry.getAttribute('position');
      const idx = m.geometry.index;
      const n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i += 3) {
        const v = [0, 1, 2].map((j) => (idx ? idx.getX(i + j) : i + j));
        const cx = (p.getX(v[0]) + p.getX(v[1]) + p.getX(v[2])) / 3;
        const cy = (p.getY(v[0]) + p.getY(v[1]) + p.getY(v[2])) / 3;
        const cz = (p.getZ(v[0]) + p.getZ(v[1]) + p.getZ(v[2])) / 3;
        // The plinth (0.9 m, front 0.08 m proud of the wall) has its own recess back, so only check above it.
        const inVoid = Math.abs(cx - opening.u) < opening.w / 2 && cy > 0.95 && cy < opening.h - 0.01 && cz > backZ + 0.01 && cz < frontZ - 0.01;
        expect(inVoid).toBe(false);
      }
    }
  });

  it('splits the wall into pieces around the opening (more boxes than the solid wall)', () => {
    const solid = triangleCount(wingKit().batch.build());
    const cut = triangleCount(wingKit([{ u: 0, w: 3, h: 2.5, depth: 1 }]).batch.build());
    expect(cut).toBeGreaterThan(solid);
  });
});

describe('windowAt backFace flag', () => {
  it('is off by default: jambs and sill are kept (glass, 2 jambs, head, sill = 5 boxes)', () => {
    const k = new Kit(1);
    windowAt(k, 0, 0, 1.2, 1.9, false);
    expect(triangleCount(k.batch.build())).toBe(5 * 12);
  });

  it('explicit false matches the default output', () => {
    const a = new Kit(1);
    windowAt(a, 0, 0, 1.2, 1.9, false);
    const b = new Kit(1);
    windowAt(b, 0, 0, 1.2, 1.9, false, { backFace: false });
    expect(triangleCount(b.batch.build())).toBe(triangleCount(a.batch.build()));
  });

  it('backFace skips jambs and sill (glass and head remain = 2 boxes)', () => {
    const k = new Kit(1);
    windowAt(k, 0, 0, 1.2, 1.9, false, { backFace: true });
    expect(triangleCount(k.batch.build())).toBe(2 * 12);
  });
});
