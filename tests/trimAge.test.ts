// Window trim ageing: trims carry the TRIM_AGED surface, the shader declares the knob uniforms, determinism.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHouse, defaultHouseParams, HOUSE_PRESETS } from '../src/buildings';
import { SURFACE, SURFACE_ATTRIBUTE } from '../src/buildings/surface';
import { trimAgeUniform, trimTopUniform } from '../src/buildings/materials';
import { SURFACE_FRAGMENT_COMMON } from '../src/buildings/shaders/surface';
import { buildings } from '../src/config/tuning';

function ids(g: THREE.Object3D): Set<number> {
  const out = new Set<number>();
  g.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const a = o.geometry.getAttribute(SURFACE_ATTRIBUTE);
    if (!a) return;
    for (let i = 0; i < a.count; i++) out.add(Math.round(a.getX(i)));
  });
  return out;
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

describe('window trim ageing', () => {
  it('classic houses with window surrounds, sills or lintels carry TRIM_AGED', () => {
    let seen = 0;
    for (const preset of HOUSE_PRESETS) {
      if (preset === 'as-block' || preset === 'glass-tower') continue;
      if (ids(buildHouse({ ...defaultHouseParams(preset), seed: 3 })).has(SURFACE.TRIM_AGED)) seen++;
    }
    expect(seen).toBeGreaterThanOrEqual(5);
  });

  it('knobs reach the shader as uniforms, and the shader declares them', () => {
    expect(trimAgeUniform.value).toBe(buildings.trimAgeAmount);
    expect(trimTopUniform.value).toBe(buildings.trimTopDarken);
    expect(buildings.trimTopDarken).toBeGreaterThan(0);
    expect(SURFACE_FRAGMENT_COMMON).toContain('uniform float uTrimAge;');
    expect(SURFACE_FRAGMENT_COMMON).toContain('uniform float uTrimTop;');
    expect(SURFACE_FRAGMENT_COMMON).toContain('vec3 patTrimAged(');
  });

  it('defaults: trim age 0.84, top faces 60% darker (trimTopDarken 0.6)', () => {
    expect(buildings.trimAgeAmount).toBe(0.84);
    expect(buildings.trimTopDarken).toBe(0.6);
  });

  it('cathedral ageing ids are not trims', () => {
    expect([SURFACE.STONE_AGED, SURFACE.SLATE_AGED, SURFACE.ZINC_AGED]).not.toContain(SURFACE.TRIM_AGED);
  });

  it('deterministic: same params give identical colours', () => {
    const a = buildHouse({ ...defaultHouseParams('original-feuilles'), seed: 4 });
    const b = buildHouse({ ...defaultHouseParams('original-feuilles'), seed: 4 });
    expect(colourHash(a)).toBe(colourHash(b));
  });
});
