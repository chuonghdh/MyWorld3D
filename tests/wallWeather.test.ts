// House wall weathering: routing per wall type, cathedral ids excluded, knob as uniform, determinism.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUSE_PRESETS, buildHouse, defaultHouseParams } from '../src/buildings';
import type { HousePreset } from '../src/core/types';
import { SURFACE, SURFACE_ATTRIBUTE, WALL_WEATHER_SURFACES } from '../src/buildings/surface';
import { wallWeatherUniform } from '../src/buildings/materials';
import { SURFACE_FRAGMENT_COMMON } from '../src/buildings/shaders/surface';
import { buildings } from '../src/config/tuning';

function bodyIds(g: THREE.Group): Set<number> {
  const out = new Set<number>();
  for (const m of g.children) {
    if (!(m instanceof THREE.Mesh) || m.name !== 'body') continue;
    const a = m.geometry.getAttribute(SURFACE_ATTRIBUTE);
    for (let i = 0; i < a.count; i++) out.add(Math.round(a.getX(i)));
  }
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

/** Wall surface each house type is built with (its classic wall, facade and party walls). */
const WALL_FOR: Record<HousePreset, number> = {
  'as-block': SURFACE.PLAIN,
  'original-feuilles': SURFACE.STONE,
  'canal-amsterdam': SURFACE.BRICK,
  'glass-tower': SURFACE.PLAIN,
  'brutalist-concrete': SURFACE.CONCRETE,
  bauhaus: SURFACE.STUCCO,
  mediterranean: SURFACE.STUCCO,
  'brownstone-ny': SURFACE.BRICK,
  'nordic-timber': SURFACE.TIMBER,
  'shophouse-asia': SURFACE.STUCCO,
};

describe('house wall weathering', () => {
  it('covers brick, timber, stucco, stone and concrete; never the cathedral ids or plain geometry', () => {
    expect([...WALL_WEATHER_SURFACES].sort((a, b) => a - b)).toEqual(
      [SURFACE.BRICK, SURFACE.TIMBER, SURFACE.STUCCO, SURFACE.STONE, SURFACE.CONCRETE].sort((a, b) => a - b),
    );
    for (const id of [SURFACE.STONE_AGED, SURFACE.SLATE_AGED, SURFACE.ZINC_AGED, SURFACE.PLAIN]) {
      expect(WALL_WEATHER_SURFACES).not.toContain(id);
    }
  });

  for (const preset of HOUSE_PRESETS) {
    it(`${preset}: walls carry the expected weathering surface`, () => {
      const ids = bodyIds(buildHouse({ ...defaultHouseParams(preset), seed: 3 }));
      const want = WALL_FOR[preset];
      expect(ids.has(want), preset).toBe(true);
      if (WALL_WEATHER_SURFACES.includes(want)) expect(WALL_WEATHER_SURFACES).toContain(want);
    });
  }

  it('strength is the knob, passed to the shader as a uniform, and the shader declares it', () => {
    expect(wallWeatherUniform.value).toBe(buildings.wallWeatheringAmount);
    expect(buildings.wallWeatheringAmount).toBeGreaterThan(0);
    expect(buildings.wallWeatheringAmount).toBeLessThanOrEqual(1);
    expect(SURFACE_FRAGMENT_COMMON).toContain('uniform float uWallWeather;');
    expect(SURFACE_FRAGMENT_COMMON).toContain('vec3 patWallWeather(');
  });

  it('deterministic: same params give identical colours', () => {
    const a = buildHouse({ ...defaultHouseParams('canal-amsterdam'), seed: 9 });
    const b = buildHouse({ ...defaultHouseParams('canal-amsterdam'), seed: 9 });
    expect(colourHash(a)).toBe(colourHash(b));
  });
});
