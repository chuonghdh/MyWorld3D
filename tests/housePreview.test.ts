import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HOUSE_PRESETS,
  PREVIEW_FLOORS,
  buildHousePreview,
  disposeHousePreview,
  houseFootprint,
  housePreviewBounds,
  presetDefaultShutter,
  presetHasShutters,
  defaultHouseParams,
  buildHouse,
} from '../src/buildings';
import { getBodyMaterial, getGlassLitMaterial, getGlassMaterial } from '../src/buildings/materials';
import { getSignMaterial } from '../src/buildings/signs';

function meshes(g: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

function hash(g: THREE.Object3D): number {
  let h = 0;
  for (const m of meshes(g)) {
    const a = m.geometry.getAttribute('position').array as Float32Array;
    for (let i = 0; i < a.length; i += 7) h = (h * 31 + Math.round(a[i] * 1000)) | 0;
  }
  return h;
}

describe('buildHousePreview', () => {
  for (const preset of HOUSE_PRESETS) {
    it(`${preset}: non-empty, ~3 floors, grounded, centred, front at +Z`, () => {
      const g = buildHousePreview(preset);
      const ms = meshes(g);
      expect(ms.length).toBeGreaterThan(0);
      expect(ms.some((m) => m.geometry.getAttribute('position').count > 0)).toBe(true);
      expect(g.userData.floors).toBe(PREVIEW_FLOORS);

      const b = housePreviewBounds(g);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.02); // plinths sink a few mm below grade (no coplanar ground)
      expect(b.min.y).toBeLessThan(0.05);
      const wallTop = g.userData.wallTop as number;
      // Three storeys: 3.2-4.6 m ground floor plus two upper floors.
      expect(wallTop).toBeGreaterThan(8);
      expect(wallTop).toBeLessThan(14);
      expect(b.max.y).toBeLessThan(wallTop + 9);

      const { width, depth } = houseFootprint(preset);
      expect(g.userData.width).toBeCloseTo(width, 5);
      expect(g.userData.depth).toBeCloseTo(depth, 5);
      const c = b.getCenter(new THREE.Vector3());
      expect(Math.abs(c.x)).toBeLessThan(width * 0.25);

      // Front faces +Z: the front facade carries the ground-floor door/shopfront and so more glass and
      // detail projects towards +Z than towards -X/+X; the lot itself is centred, so check the glass
      // normals point mostly along +/-Z and that the front half holds front-facing glass.
      let frontGlass = 0;
      for (const m of ms) {
        if (m.name !== 'glass' && m.name !== 'glassLit') continue;
        const n = m.geometry.getAttribute('normal');
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < n.count; i++) if (n.getZ(i) > 0.9 && p.getZ(i) > 0) frontGlass++;
      }
      expect(frontGlass).toBeGreaterThan(0);
      disposeHousePreview(g);
    });
  }

  it('shutters match a picked type: fill shutter for canal, brownstone, nordic; others unchanged', () => {
    for (const preset of HOUSE_PRESETS) {
      if (preset === 'as-block') continue;
      const d = defaultHouseParams(preset, 'classic');
      const want = d.shutterColor ?? (presetHasShutters(preset) ? presetDefaultShutter(preset) : null);
      const { width, depth } = houseFootprint(preset);
      const ref = buildHouse({
        ...d,
        shutterColor: want,
        floors: PREVIEW_FLOORS,
        width,
        depth,
        facades: { front: true, back: true, left: true, right: true },
        seed: 1,
      });
      expect(hash(buildHousePreview(preset))).toBe(hash(ref));
      if (['canal-amsterdam', 'brownstone-ny', 'nordic-timber'].includes(preset)) {
        expect(d.shutterColor).toBeNull();
        expect(want).not.toBeNull();
        const bare = buildHouse({ ...d, floors: PREVIEW_FLOORS, width, depth, facades: { front: true, back: true, left: true, right: true }, seed: 1 });
        const tris = (g: THREE.Object3D): number => meshes(g).reduce((t, m) => t + m.geometry.getAttribute('position').count, 0);
        expect(tris(buildHousePreview(preset))).toBeGreaterThan(tris(bare));
      }
    }
  });

  it('is deterministic', () => {
    const a = buildHousePreview('canal-amsterdam');
    const b = buildHousePreview('canal-amsterdam');
    expect(hash(a)).toBe(hash(b));
  });

  it('honours the floors argument', () => {
    const lo = buildHousePreview('brownstone-ny', 3);
    const hi = buildHousePreview('brownstone-ny', 5);
    expect(hi.userData.wallTop).toBeGreaterThan(lo.userData.wallTop);
    expect(buildHousePreview('as-block').children.length).toBeGreaterThan(0);
  });

  it('dispose frees preview geometry but keeps shared materials', () => {
    const shared = [getBodyMaterial(), getGlassMaterial(), getGlassLitMaterial(), getSignMaterial()];
    const disposed = new Set<THREE.Material>();
    const onDispose = (e: { target: THREE.Material }): void => {
      disposed.add(e.target);
    };
    for (const m of shared) m.addEventListener('dispose', onDispose);
    const g = buildHousePreview('shophouse-asia');
    const geoms = meshes(g).map((m) => m.geometry);
    for (const m of meshes(g)) expect(shared).toContain(m.material);
    let freed = 0;
    for (const geo of geoms) geo.addEventListener('dispose', () => freed++);
    disposeHousePreview(g);
    expect(freed).toBe(geoms.length);
    expect(disposed.size).toBe(0);
    expect(g.children.length).toBe(0);
    for (const m of shared) m.removeEventListener('dispose', onDispose);
  });
});
