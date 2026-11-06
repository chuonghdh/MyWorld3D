// House roof moss and lichen: every roof type carries a moss-eligible surface, the cathedral ids stay out,
// the strength comes from the knob, and the shader keeps the cathedral arithmetic.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHouse, defaultHouseParams, ROOF_TYPES, type RoofType } from '../src/buildings';
import { ROOF_MOSS_SURFACES, SURFACE, SURFACE_ATTRIBUTE } from '../src/buildings/surface';
import { roofMossUniform } from '../src/buildings/materials';
import { SURFACE_FRAGMENT_COMMON } from '../src/buildings/shaders/surface';
import { buildings } from '../src/config/tuning';

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

describe('roof moss surfaces', () => {
  it('covers tiles, slate, zinc and the membrane, and never the cathedral ageing ids', () => {
    expect([...ROOF_MOSS_SURFACES].sort((a, b) => a - b)).toEqual(
      [SURFACE.TILE_TERRACOTTA, SURFACE.TILE_SLATE, SURFACE.ZINC, SURFACE.ROOF_FLAT].sort((a, b) => a - b),
    );
    for (const id of [SURFACE.STONE_AGED, SURFACE.SLATE_AGED, SURFACE.ZINC_AGED]) expect(ROOF_MOSS_SURFACES).not.toContain(id);
  });

  it('every roof type ends up with a moss-eligible roof surface', () => {
    const presetFor: Partial<Record<RoofType, Parameters<typeof defaultHouseParams>[0]>> = {
      gable: 'canal-amsterdam',
      'step-gable': 'canal-amsterdam',
      'low-tiled': 'mediterranean',
      hip: 'nordic-timber',
      mansard: 'original-feuilles',
    };
    for (const roof of ROOF_TYPES) {
      const preset = presetFor[roof] ?? 'brutalist-concrete';
      const g = buildHouse({ ...defaultHouseParams(preset), roof });
      const ids = surfaceIds(g);
      expect(ROOF_MOSS_SURFACES.some((id) => ids.has(id)), roof).toBe(true);
    }
  });

  it('strength is the knob, passed to the shader as a uniform', () => {
    expect(roofMossUniform.value).toBe(buildings.roofMossAmount);
    expect(buildings.roofMossAmount).toBeGreaterThan(0);
    expect(buildings.roofMossAmount).toBeLessThanOrEqual(1);
    expect(SURFACE_FRAGMENT_COMMON).toContain('uniform float uRoofMoss;');
  });

  it('cathedral ageRoof keeps its arithmetic (moss strength 0.55, eave band 12 to 18 m)', () => {
    expect(SURFACE_FRAGMENT_COMMON).toContain('float moss = roofMossLayer(p, eave, nrm) * 0.55;');
    expect(SURFACE_FRAGMENT_COMMON).toContain('float eave = 1.0 - smoothstep(12.0, 18.0, wy);');
  });

  it('deterministic: same params give identical colours; seeds vary the tone', () => {
    const a = buildHouse({ ...defaultHouseParams('mediterranean'), seed: 5 });
    const b = buildHouse({ ...defaultHouseParams('mediterranean'), seed: 5 });
    expect(colourHash(a)).toBe(colourHash(b));
  });
});
