import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HOUSE_PRESETS, MONUMENT_KINDS, buildHouse, buildMonument, defaultHouseParams } from '../src/buildings';
import { mergeByMaterial } from '../src/scene/mergeBlock';
import {
  WIND,
  anchorWeight,
  liftColor,
  luminance,
  nightClock,
  paneSeed,
  windAmplitude,
  windowLit,
  windowOffAt,
  windowOnAt,
} from '../src/buildings/facade/polish';
import { getBodyMaterial, getGlassLitMaterial, getSignMaterial, glassUniforms, setNightClock } from '../src/buildings/materials';
import { setBuildingWind, windUniforms } from '../src/buildings/shaders/wind';
import { DOOR_COLORS } from '../src/buildings/palette';

const VERT = '#include <common>\nvoid main() {\n#include <begin_vertex>\n}';
const FRAG = '#include <common>\nvoid main() {\n#include <emissivemap_fragment>\n}';
function compile(m: THREE.Material) {
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: VERT, fragmentShader: FRAG };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
}

describe('anchor weights and wind amplitude', () => {
  it('runs 0 at the anchor to 1 at the free edge, in either direction, clamped', () => {
    expect(anchorWeight(0, 0, 2)).toBe(0);
    expect(anchorWeight(1, 0, 2)).toBeCloseTo(0.5);
    expect(anchorWeight(5, 0, 2)).toBe(1);
    expect(anchorWeight(0.5, 2, 0)).toBeCloseTo(0.75);
    expect(anchorWeight(1, 1, 1)).toBe(0);
  });

  it('grows with wind and gusts and stays bounded', () => {
    expect(windAmplitude(0, 0)).toBeLessThan(windAmplitude(8, 0));
    expect(windAmplitude(8, 1)).toBeGreaterThan(windAmplitude(8, 0));
    expect(windAmplitude(100, 0)).toBeLessThanOrEqual(2.2);
    expect(windAmplitude(Number.NaN, Number.NaN)).toBeGreaterThan(0);
    // The default 5 m/s wind must already move cloth clearly.
    expect(windAmplitude(5, 0)).toBeGreaterThan(0.9);
  });
});

describe('window light schedule', () => {
  it('maps clock hours to hours since noon', () => {
    expect(nightClock(12)).toBe(0);
    expect(nightClock(18)).toBe(6);
    expect(nightClock(0)).toBe(12);
    expect(nightClock(3)).toBe(15);
    expect(nightClock(25)).toBe(13);
  });

  it('pane seeds are deterministic, never zero and spread out', () => {
    expect(paneSeed(7)).toBe(paneSeed(7));
    const seeds = Array.from({ length: 200 }, (_, i) => paneSeed(i));
    expect(Math.min(...seeds)).toBeGreaterThan(0);
    expect(Math.max(...seeds)).toBeLessThanOrEqual(1);
    expect(new Set(seeds.map((s) => s.toFixed(3))).size).toBeGreaterThan(150);
  });

  it('follows the target share of lit windows by hour', () => {
    const seeds = Array.from({ length: 4000 }, (_, i) => paneSeed(i));
    const litAt = (hour: number): number => seeds.filter((s) => windowLit(s, nightClock(hour))).length / seeds.length;
    const tol = 0.04;
    expect(litAt(12)).toBe(0);
    expect(litAt(16.9)).toBe(0);
    expect(Math.abs(litAt(20) - 0.7)).toBeLessThan(tol);
    expect(Math.abs(litAt(21) - 0.85)).toBeLessThan(tol);
    expect(Math.abs(litAt(22) - 0.85)).toBeLessThan(tol);
    expect(litAt(23)).toBeLessThan(litAt(22));
    expect(litAt(23)).toBeGreaterThan(litAt(24));
    expect(Math.abs(litAt(24) - 0.3)).toBeLessThan(tol);
    expect(Math.abs(litAt(3) - 0.3)).toBeLessThan(tol);
    expect(Math.abs(litAt(5.5) - 0.3)).toBeLessThan(tol);
    expect(litAt(7.2)).toBe(0);
    expect(litAt(10)).toBe(0);
  });

  it('is monotone: a window stays lit once on until its off time', () => {
    for (let i = 0; i < 500; i++) {
      const s = paneSeed(i);
      const on = windowOnAt(s);
      const off = windowOffAt(s);
      if (on >= 99) {
        expect(off).toBeGreaterThanOrEqual(99);
        continue;
      }
      expect(on).toBeLessThan(off);
      expect(on).toBeGreaterThanOrEqual(5);
      expect(on).toBeLessThanOrEqual(9);
      for (let c = 0; c <= 24; c += 0.25) expect(windowLit(s, c)).toBe(c >= on && c < off);
    }
  });

  it('keeps fixtures lit and ignores the schedule when disabled', () => {
    expect(windowLit(0, nightClock(3))).toBe(true);
    expect(windowLit(0.9, -1)).toBe(true);
  });
});

describe('door colours', () => {
  it('lifts dark colours to the minimum luminance and leaves bright ones alone', () => {
    const lifted = liftColor([0.01, 0.01, 0.01], 0.06);
    expect(luminance(lifted)).toBeGreaterThanOrEqual(0.0599);
    expect(liftColor([0.5, 0.4, 0.3], 0.06)).toEqual([0.5, 0.4, 0.3]);
  });

  it('no front door colour is near black', () => {
    const c = new THREE.Color();
    for (const hex of DOOR_COLORS) {
      c.set(hex);
      expect(luminance([c.r, c.g, c.b])).toBeGreaterThan(0.02);
    }
  });
});

describe('wind and schedule wiring in the shaders', () => {
  it('body and sign vertex shaders carry the wind code on shared uniforms', () => {
    for (const m of [getBodyMaterial(), getSignMaterial()]) {
      const s = compile(m);
      expect(s.vertexShader).toContain('windDisp');
      expect(s.uniforms.uWTime).toBe(windUniforms.uWTime);
      expect(s.uniforms.uWWind).toBe(windUniforms.uWWind);
      expect(s.uniforms.uWGust).toBe(windUniforms.uWGust);
    }
  });

  it('setBuildingWind writes the shared uniforms', () => {
    setBuildingWind(12.5, { x: 3, z: -2 }, 0.7);
    expect(windUniforms.uWTime.value).toBe(12.5);
    expect(windUniforms.uWWind.value.x).toBe(3);
    expect(windUniforms.uWWind.value.y).toBe(-2);
    expect(windUniforms.uWGust.value).toBe(0.7);
  });

  it('lit glass follows the schedule uniform; setNightClock converts hours', () => {
    const s = compile(getGlassLitMaterial());
    expect(s.fragmentShader).toContain('uClock');
    expect(s.uniforms.uClock).toBe(glassUniforms.uClock);
    setNightClock(20);
    expect(glassUniforms.uClock.value).toBe(8);
    setNightClock(-1);
    expect(glassUniforms.uClock.value).toBe(-1);
  });
});

describe('built houses carry the new vertex data', () => {
  it('has wind-tagged body vertices with weights in 0..1, lit-glass seeds, and wind on shop signs', () => {
    let windVerts = 0;
    let badWeight = 0;
    let seeded = 0;
    let signWind = 0;
    for (const preset of HOUSE_PRESETS) {
      const params = { ...defaultHouseParams(preset), avenue: true };
      const group = buildHouse(params);
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const g = o.geometry as THREE.BufferGeometry;
        if (o.name === 'body') {
          const uv = g.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) {
            if (uv.getX(i) > 0) {
              windVerts++;
              const w = uv.getY(i);
              if (w < 0 || w > 1 || uv.getX(i) > WIND.PARASOL) badWeight++;
            }
          }
        } else if (o.name === 'glassLit') {
          const uv = g.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) if (uv.getX(i) > 0) seeded++;
        } else if (o.name === 'sign') {
          const w = g.getAttribute('aWind');
          expect(w).toBeDefined();
          for (let i = 0; i < w.count; i++) if (w.getX(i) > 0) signWind++;
        }
      });
    }
    expect(windVerts).toBeGreaterThan(0);
    expect(badWeight).toBe(0);
    expect(seeded).toBeGreaterThan(0);
    expect(signWind).toBeGreaterThan(0);
  });
});


describe('wind reaches the merged block meshes', () => {
  it('a merged block keeps non-zero wind ids and weights on the shared body material, which injects the wind code', () => {
    const items = HOUSE_PRESETS.slice(0, 4).map((preset, i) => ({
      object: buildHouse({ ...defaultHouseParams(preset), avenue: true }),
      matrix: new THREE.Matrix4().makeTranslation(i * 30, 0, 0),
    }));
    const block = mergeByMaterial(items, 'test-block');
    const ids = new Set<number>();
    let weighted = 0;
    block.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || (o.material as THREE.Material).name !== 'building-body') return;
      const uv = (o.geometry as THREE.BufferGeometry).getAttribute('uv');
      expect(uv).toBeDefined();
      for (let i = 0; i < uv.count; i++) {
        const id = uv.getX(i);
        if (id > 0) {
          ids.add(id);
          if (uv.getY(i) > 0.5) weighted++;
        }
      }
      expect(compile(o.material as THREE.Material).vertexShader).toContain('windToObject(windDisp(uv, position))');
    });
    expect(weighted).toBeGreaterThan(0);
    // Awnings and laundry are the cloth the wind must move.
    expect(ids.has(WIND.AWNING) || ids.has(WIND.LAUNDRY)).toBe(true);
  });
});

describe('monuments stay rigid except genuinely flexible parts', () => {
  it('every wind-tagged monument vertex is a flexible kind with a weight in 0..1, and most geometry is rigid', () => {
    const FLEX = new Set<number>([WIND.FLAG, WIND.LAUNDRY, WIND.AWNING, WIND.PLANT, WIND.PARASOL]);
    const movers = new Map<string, Set<number>>();
    for (const kind of MONUMENT_KINDS) {
      const group = buildMonument(kind);
      let total = 0;
      let moving = 0;
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.name !== 'body') return;
        const uv = (o.geometry as THREE.BufferGeometry).getAttribute('uv');
        for (let i = 0; i < uv.count; i++) {
          total++;
          const id = uv.getX(i);
          const w = uv.getY(i);
          if (id === 0) {
            expect(w).toBe(0);
            continue;
          }
          moving++;
          expect(FLEX.has(id)).toBe(true);
          expect(w).toBeGreaterThanOrEqual(0);
          expect(w).toBeLessThanOrEqual(1);
          if (!movers.has(kind)) movers.set(kind, new Set());
          movers.get(kind)!.add(id);
        }
      });
      expect(moving / total).toBeLessThan(0.25);
    }
    // At least flags/foliage move somewhere, and no tower, dome or wall vertex carries a rigid-breaking id.
    expect(movers.size).toBeGreaterThan(0);
  });

  it('a plain monument box has zero wind data (box texture coordinates never leak)', () => {
    for (const kind of MONUMENT_KINDS) {
      buildMonument(kind).traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const uv = (o.geometry as THREE.BufferGeometry).getAttribute('uv');
        if (o.name === 'body') for (let i = 0; i < uv.count; i++) expect(uv.getX(i) === 0 || Number.isInteger(uv.getX(i))).toBe(true);
      });
    }
  });
});

describe('houses on the shared courtyard of a merged block', () => {
  const geomKey = (g: THREE.Object3D): string => {
    const parts: string[] = [];
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const p = (o.geometry as THREE.BufferGeometry).getAttribute('position');
      let h = 0;
      for (let i = 0; i < p.array.length; i++) h = (h * 31 + Math.round((p.array[i] as number) * 1000)) | 0;
      parts.push(`${o.name}:${p.count}:${h}`);
    });
    return parts.join('|');
  };
  const glassOf = (g: THREE.Object3D): number => {
    let n = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name.startsWith('glass')) n += (o.geometry as THREE.BufferGeometry).getAttribute('position').count;
    });
    return n;
  };

  it('sharedCourtyard: false or absent builds exactly the same house', () => {
    for (const preset of HOUSE_PRESETS) {
      const p = { ...defaultHouseParams(preset), floors: 5, width: 11, depth: 14, seed: 4, facades: { front: true, back: false, left: true, right: false } };
      expect(geomKey(buildHouse({ ...p, sharedCourtyard: false }))).toBe(geomKey(buildHouse(p)));
    }
  });

  it('gives the courtyard back more windows, deterministically', () => {
    let richer = 0;
    for (const preset of HOUSE_PRESETS) {
      for (const seed of [2, 5, 9]) {
        const facades = { front: true, back: false, left: false, right: false };
        const p = { ...defaultHouseParams(preset), floors: 5, width: 11, depth: 14, seed, facades };
        const a = buildHouse({ ...p, sharedCourtyard: true });
        expect(geomKey(a)).toBe(geomKey(buildHouse({ ...p, sharedCourtyard: true })));
        if (glassOf(a) > glassOf(buildHouse(p))) richer++;
      }
    }
    // Every preset with a rear elevation gains glass on most seeds.
    expect(richer).toBeGreaterThan(HOUSE_PRESETS.length * 2);
  });
});
