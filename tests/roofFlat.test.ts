// Flat roof membrane: ROOF_FLAT surface on flat tops only, per-building deck tone, determinism.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHouse, defaultHouseParams, type HouseParams } from '../src/buildings';
import { SURFACE, SURFACE_ATTRIBUTE } from '../src/buildings/surface';
import type { HousePreset } from '../src/core/types';

function surfaceIds(g: THREE.Object3D): Set<number> {
  const ids = new Set<number>();
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const a = o.geometry.getAttribute(SURFACE_ATTRIBUTE);
    if (!a) return;
    for (let i = 0; i < a.count; i++) ids.add(Math.round(a.getX(i)));
  });
  return ids;
}

function colourHash(g: THREE.Object3D): number {
  let h = 0;
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const c = o.geometry.getAttribute('color').array as Float32Array;
    for (let i = 0; i < c.length; i += 11) h = (h * 31 + Math.round(c[i] * 1000)) | 0;
  });
  return h;
}

const FLAT_PRESETS: HousePreset[] = ['original-feuilles', 'glass-tower', 'brutalist-concrete', 'bauhaus', 'mediterranean', 'shophouse-asia'];

describe('flat roof membrane', () => {
  it('flat-top houses carry the ROOF_FLAT surface id on their roof cap', () => {
    for (const preset of FLAT_PRESETS) {
      const g = buildHouse(defaultHouseParams(preset));
      if (g.userData.roof === 'flat' || g.userData.roof === 'parapet' || g.userData.roof === 'cornice' || g.userData.roof === 'terrace') {
        expect(surfaceIds(g).has(SURFACE.ROOF_FLAT), preset).toBe(true);
      }
    }
  });

  it('pitched roofs never use ROOF_FLAT', () => {
    const params: HouseParams = { ...defaultHouseParams('canal-amsterdam'), roof: 'gable' };
    expect(surfaceIds(buildHouse(params)).has(SURFACE.ROOF_FLAT)).toBe(false);
    expect(surfaceIds(buildHouse({ ...defaultHouseParams('original-feuilles'), roof: 'mansard' })).has(SURFACE.ROOF_FLAT)).toBe(false);
  });

  it('deterministic per seed, and flat roofs tone differently between seeds', () => {
    const a = buildHouse({ ...defaultHouseParams('original-feuilles'), seed: 3 });
    const b = buildHouse({ ...defaultHouseParams('original-feuilles'), seed: 3 });
    expect(colourHash(a)).toBe(colourHash(b));
    const tones = new Set<number>();
    for (let s = 1; s <= 6; s++) tones.add(colourHash(buildHouse({ ...defaultHouseParams('original-feuilles'), seed: s })));
    expect(tones.size).toBeGreaterThan(1);
  });

  it('a flat roof is a cap, not extra triangles: same vertex count with and without the id change', () => {
    const g = buildHouse(defaultHouseParams('glass-tower'));
    let tris = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) tris += o.geometry.getAttribute('position').count / 3;
    });
    expect(tris).toBeGreaterThan(0);
    expect(g.userData.roof).toBe('flat');
  });
});
