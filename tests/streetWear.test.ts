// Street surface wear: seed determinism, knob defaults, shader hook safety and the streetscape budget.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateCity } from '../src/city';
import { cityStreets } from '../src/config/tuning';
import { attachStreetWear, streetWearSeed } from '../src/streets/streetWear';
import { createStreetscape } from '../src/streets';
import { buildTyreTrackMap, onCarriageway } from '../src/streets/tyreTracks';
import { DEFAULT_SETTINGS } from '../src/store/model';

/** Runs the material hook on a fake shader and returns the patched sources and uniforms. */
function compile(mode: 'surface' | 'paint', seed: number) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  attachStreetWear(material, mode, seed);
  const shader = {
    vertexShader: '#include <common>\n#include <project_vertex>\n',
    fragmentShader: '#include <common>\n#include <color_fragment>\n',
    uniforms: {} as Record<string, { value: unknown }>,
  };
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return { material, shader };
}

describe('street wear seed', () => {
  it('is deterministic per seed and differs between towns', () => {
    const a = streetWearSeed(1);
    const b = streetWearSeed(1);
    expect(a.equals(b)).toBe(true);
    expect(streetWearSeed(7).equals(a)).toBe(false);
    expect(streetWearSeed(1234).equals(streetWearSeed(7))).toBe(false);
  });

  it('stays in the noise-space range [0, 97)', () => {
    for (const seed of [0, 1, 7, 1234, 99999, -5]) {
      const v = streetWearSeed(seed);
      for (const c of [v.x, v.y]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(97);
      }
    }
  });
});

describe('street wear knobs', () => {
  it('keeps the designed defaults, all as 0-1 amounts', () => {
    expect({
      roadBlockTone: cityStreets.roadBlockTone,
      roadAggregate: cityStreets.roadAggregate,
      roadWornLift: cityStreets.roadWornLift,
      roadOilStain: cityStreets.roadOilStain,
      roadPatchSeam: cityStreets.roadPatchSeam,
      pavingJoint: cityStreets.pavingJoint,
      pavingGrime: cityStreets.pavingGrime,
      pavingWear: cityStreets.pavingWear,
      pavingBikeTrack: cityStreets.pavingBikeTrack,
      pavingFootprint: cityStreets.pavingFootprint,
      pavingStain: cityStreets.pavingStain,
      pavingJointWidth: cityStreets.pavingJointWidth,
      pavingEdgeWear: cityStreets.pavingEdgeWear,
      pavingStoneTone: cityStreets.pavingStoneTone,
      pavingAccentShare: cityStreets.pavingAccentShare,
      pavingGumSpot: cityStreets.pavingGumSpot,
      pavingPuddleMark: cityStreets.pavingPuddleMark,
      pavingDirtZone: cityStreets.pavingDirtZone,
      paintWear: cityStreets.paintWear,
      paintFade: cityStreets.paintFade,
    }).toEqual({
      roadBlockTone: 0.04,
      roadAggregate: 0.05,
      roadWornLift: 0.1,
      roadOilStain: 0.08,
      roadPatchSeam: 0.06,
      pavingJoint: 0.16,
      pavingGrime: 0.22,
      pavingWear: 0.07,
      pavingBikeTrack: 0.07,
      pavingFootprint: 0.08,
      pavingStain: 0.12,
      pavingJointWidth: 0.012,
      pavingEdgeWear: 0.05,
      pavingStoneTone: 0.05,
      pavingAccentShare: 0.05,
      pavingGumSpot: 0.12,
      pavingPuddleMark: 0.05,
      pavingDirtZone: 0.06,
      paintWear: 0.3,
      paintFade: 0.06,
    });
  });

  it('feeds the knobs and the seed into the shader uniforms', () => {
    const { shader } = compile('surface', 7);
    expect(shader.uniforms.uPaintWear.value).toBe(cityStreets.paintWear);
    expect(shader.uniforms.uPavingGrime.value).toBe(cityStreets.pavingGrime);
    expect((shader.uniforms.uWearSeed.value as THREE.Vector2).equals(streetWearSeed(7))).toBe(true);
  });
});

describe('street wear shader hook', () => {
  // GLSL ES words that would break the compile if used as identifiers (e.g. `patch`, `sample`).
  const RESERVED = /\b(patch|sample|input|output|filter|texture|active|cast|class|partition|superp|fixed|half|common)\b/;

  it.each(['surface', 'paint'] as const)('injects %s code without reserved identifiers', (mode) => {
    const { material, shader } = compile(mode, 1);
    const strip = (s: string) => s.replace(/#include\s*<[^>]+>/g, '');
    expect(RESERVED.exec(strip(shader.fragmentShader))).toBeNull();
    expect(RESERVED.exec(strip(shader.vertexShader))).toBeNull();
    expect(shader.fragmentShader).toContain('wearNoise');
    expect(shader.vertexShader).toContain('vWearPos');
    expect(material.customProgramCacheKey()).toContain(`street-wear-${mode}-v1`);
  });
});

describe('paver accent spread', () => {
  // The same formula as accentHash in streetWear.ts, in float64: the accent share must hold over a wide area.
  const fr = (v: number): number => v - Math.floor(v);
  const accentHash = (x: number, y: number): number => {
    // p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z)
    let a = fr(x * 0.1031);
    let b = fr(y * 0.1031);
    let c = fr(x * 0.1031);
    const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
    a += d;
    b += d;
    c += d;
    return fr((a + b) * c);
  };

  it('keeps the set share uniform across a 200 x 200 stone grid', () => {
    const share = cityStreets.pavingAccentShare;
    let hits = 0;
    let total = 0;
    const rowHits: number[] = [];
    for (let r = 0; r < 200; r++) {
      let row = 0;
      for (let c = 0; c < 200; c++) {
        total++;
        if (accentHash(c + 37 * 7, r + 41) < share) {
          hits++;
          row++;
        }
      }
      rowHits.push(row);
    }
    expect(hits / total).toBeGreaterThan(share * 0.7);
    expect(hits / total).toBeLessThan(share * 1.3);
    expect(Math.max(...rowHits)).toBeLessThan(share * 200 * 3);
  });

  it('gates the paver pattern to blue-grey stone', () => {
    const { shader } = compile('surface', 1);
    expect(shader.fragmentShader).toContain('diffuseColor.b - diffuseColor.r');
    expect(shader.fragmentShader).toContain('accentHash(wStoneCell + 41.0)');
  });
});

describe('tyre track mask (car tracks)', () => {
  it('marks only carriageway texels, so pavement gets no car track', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed: 1 });
    const map = buildTyreTrackMap(layout);
    const { rect } = map;
    const data = map.texture.image.data as Uint8Array;
    const w = map.texture.image.width as number;
    const h = map.texture.image.height as number;
    let marked = 0;
    let offRoad = 0;
    for (let iz = 0; iz < h; iz++) {
      for (let ix = 0; ix < w; ix++) {
        if (data[(iz * w + ix) * 4] === 0) continue;
        marked++;
        const x = rect.x + (ix + 0.5) * (rect.z / w);
        const z = rect.y + (iz + 0.5) * (rect.w / h);
        if (!onCarriageway(layout, x, z)) offRoad++;
      }
    }
    expect(marked).toBeGreaterThan(0);
    expect(offRoad).toBe(0);
  });
});

describe('street wear budget', () => {
  // Baseline before the wear pass (default settings). The wear is shader-only, so these must not move.
  const BASELINE: Record<number, { meshes: number; tris: number; verts: number }> = {
    1: { meshes: 8, tris: 99076, verts: 297172 },
    7: { meshes: 8, tris: 101658, verts: 304918 },
  };

  for (const seed of [1, 7]) {
    it(`keeps the streetscape draw calls and triangles unchanged (seed ${seed})`, () => {
      const layout = generateCity({ ...DEFAULT_SETTINGS, seed });
      const group = createStreetscape(layout).group;
      let meshes = 0;
      let tris = 0;
      let verts = 0;
      group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        meshes++;
        const g = o.geometry as THREE.BufferGeometry;
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
        verts += g.getAttribute('position').count;
      });
      expect({ meshes, tris, verts }).toEqual(BASELINE[seed]);
    });
  }
});
