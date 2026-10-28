import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  HOUSE_PRESETS,
  ROOF_TYPES,
  buildHouse,
  defaultHouseParams,
  houseFootprint,
  houseHeight,
  type HouseParams,
} from '../src/buildings';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getBodyMaterial, getGlassLitMaterial, getGlassMaterial } from '../src/buildings/materials';
import { getSignMaterial } from '../src/buildings/signs';
import { SURFACE, SURFACE_ATTRIBUTE } from '../src/buildings/surface';
import type { HouseChimney } from '../src/buildings';
import type { Facades, HouseStyle } from '../src/core/types';

const EPS = 1e-4;

function bounds(obj: THREE.Object3D): THREE.Box3 {
  return new THREE.Box3().setFromObject(obj);
}

function triangles(obj: THREE.Object3D): number {
  let t = 0;
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) t += o.geometry.getAttribute('position').count / 3;
  });
  return t;
}

function meshes(obj: THREE.Object3D): THREE.Mesh[] {
  return obj.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
}

const STYLES: HouseStyle[] = ['classic', 'modern'];

describe('buildHouse', () => {
  for (const preset of HOUSE_PRESETS) {
    for (const style of STYLES) {
      it.each(ROOF_TYPES)(`${preset} ${style} with roof %s builds within contract`, (roof) => {
        const params: HouseParams = { ...defaultHouseParams(preset, style), roof };
        const group = buildHouse(params);
        expect(group).toBeInstanceOf(THREE.Group);
        const ms = meshes(group);
        expect(ms.length).toBeGreaterThan(0);
        expect(ms.length).toBeLessThanOrEqual(4);
        const shared = new Set<THREE.Material>([getBodyMaterial(), getGlassMaterial(), getGlassLitMaterial(), getSignMaterial()]);
        for (const m of ms) {
          expect(shared.has(m.material as THREE.Material)).toBe(true);
          const pos = m.geometry.getAttribute('position');
          let finite = true;
          for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) finite = false;
          expect(finite).toBe(true);
          expect(m.geometry.getAttribute('color')).toBeDefined();
          if (m.name === 'body') {
            const a = m.geometry.getAttribute(SURFACE_ATTRIBUTE);
            expect(a).toBeDefined();
            expect(a.itemSize).toBe(1);
            expect(a.count).toBe(pos.count);
          }
        }
        const b = bounds(group);
        const { width, depth } = houseFootprint(preset);
        // Default facades: front and back. Left and right are party walls and must stay inside.
        expect(b.min.x).toBeGreaterThanOrEqual(-width / 2 - EPS);
        expect(b.max.x).toBeLessThanOrEqual(width / 2 + EPS);
        expect(b.min.z).toBeGreaterThanOrEqual(-depth / 2 - 1.5 - EPS);
        expect(b.max.z).toBeLessThanOrEqual(depth / 2 + 1.5 + EPS);
        expect(b.min.y).toBeGreaterThanOrEqual(-EPS);
        expect(group.userData).toMatchObject({ floors: params.floors, roof, style, width, depth });
        expect(group.userData.height).toBeCloseTo(houseHeight(params), 6);
      });
    }
  }

  it('fills an explicit lot and protrudes at most 1.5 m on facade sides only', () => {
    const cases: { facades: Facades; w: number; d: number }[] = [
      { facades: { front: true, back: false, left: false, right: false }, w: 9.3, d: 11.2 },
      { facades: { front: true, back: true, left: true, right: false }, w: 13, d: 12 },
      { facades: { front: true, back: false, left: false, right: true }, w: 7.5, d: 10 },
      { facades: { front: false, back: true, left: true, right: true }, w: 10, d: 13 },
    ];
    for (const preset of HOUSE_PRESETS) {
      for (const { facades, w, d } of cases) {
        for (const groundFloor of ['shop', 'cafe', 'residential'] as const) {
          const params: HouseParams = { ...defaultHouseParams(preset), width: w, depth: d, facades, groundFloor, seed: 7 };
          const b = bounds(buildHouse(params));
          const lim = (facade: boolean): number => (facade ? 1.5 : 0) + EPS;
          expect(b.max.z).toBeLessThanOrEqual(d / 2 + lim(facades.front));
          expect(b.min.z).toBeGreaterThanOrEqual(-d / 2 - (facades.back ? 1.5 : 1.2) - EPS);
          expect(b.max.x).toBeLessThanOrEqual(w / 2 + lim(facades.right));
          expect(b.min.x).toBeGreaterThanOrEqual(-w / 2 - lim(facades.left));
          // The main volume fills the lot.
          expect(b.max.x).toBeGreaterThanOrEqual(w / 2 - 0.05);
          expect(b.min.x).toBeLessThanOrEqual(-w / 2 + 0.05);
          expect(b.max.z).toBeGreaterThanOrEqual(d / 2 - 0.05);
          expect(b.min.z).toBeLessThanOrEqual(-d / 2 + 0.05);
        }
      }
    }
  });

  it('height grows with floors and floors are clamped to 2..8', () => {
    for (const preset of HOUSE_PRESETS) {
      const h = (floors: number): number => bounds(buildHouse({ ...defaultHouseParams(preset), floors })).max.y;
      expect(h(6)).toBeGreaterThan(h(3));
      expect(houseHeight({ ...defaultHouseParams(preset), floors: 6 })).toBeGreaterThan(
        houseHeight({ ...defaultHouseParams(preset), floors: 3 }),
      );
      expect(h(0)).toBeCloseTo(h(2), 6);
      expect(h(99)).toBeCloseTo(h(8), 6);
    }
  });

  it('is deterministic for a seed and varies between seeds', () => {
    for (const preset of HOUSE_PRESETS) {
      const p = (seed: number): HouseParams => ({ ...defaultHouseParams(preset), seed });
      const a = buildHouse(p(42));
      const b = buildHouse(p(42));
      const c = buildHouse(p(43));
      const arr = (g: THREE.Group): number[] =>
        meshes(g).flatMap((m) => Array.from(m.geometry.getAttribute('position').array as Float32Array));
      expect(arr(a)).toEqual(arr(b));
      expect(arr(a)).not.toEqual(arr(c));
    }
  });

  it('lights about a third of the windows', () => {
    let lit = 0;
    let all = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const preset of ['original-feuilles', 'canal-amsterdam', 'brownstone-ny', 'mediterranean'] as const) {
        const g = buildHouse({ ...defaultHouseParams(preset), seed });
        for (const m of meshes(g)) {
          const t = m.geometry.getAttribute('position').count / 3;
          if (m.name === 'glassLit') lit += t;
          if (m.name === 'glass' || m.name === 'glassLit') all += t;
        }
      }
    }
    const ratio = lit / all;
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.55);
  });

  it('corner facades get windows on the side', () => {
    for (const preset of HOUSE_PRESETS) {
      const base: HouseParams = { ...defaultHouseParams(preset), width: 12, depth: 12, seed: 3 };
      const sideGlass = (facades: Facades): number => {
        const g = buildHouse({ ...base, facades });
        let count = 0;
        for (const m of meshes(g)) {
          if (m.name === 'body') continue;
          const pos = m.geometry.getAttribute('position');
          const nor = m.geometry.getAttribute('normal');
          for (let i = 0; i < pos.count; i++) if (nor.getX(i) > 0.9 && pos.getX(i) > 4) count++;
        }
        return count;
      };
      const without = sideGlass({ front: true, back: false, left: false, right: false });
      const withSide = sideGlass({ front: true, back: false, left: false, right: true });
      expect(withSide).toBeGreaterThan(without + 24);
    }
  });

  it('a 5-floor, 12 m house with front and back facades stays within the triangle budget', () => {
    for (const preset of HOUSE_PRESETS) {
      for (const style of STYLES) {
        for (const groundFloor of ['shop', 'cafe', 'residential'] as const) {
          const g = buildHouse({ ...defaultHouseParams(preset, style), floors: 5, width: 12, depth: 12, groundFloor, seed: 5 });
          expect(triangles(g)).toBeLessThan(15000);
        }
      }
    }
  });

  it('modern style and shutter colour variants build', () => {
    const modern = buildHouse({ ...defaultHouseParams('mediterranean'), style: 'modern', shutterColor: null });
    const classic = buildHouse({ ...defaultHouseParams('mediterranean'), style: 'classic', shutterColor: '#2f5d8a' });
    expect(meshes(modern).length).toBeGreaterThan(0);
    expect(meshes(classic).length).toBeGreaterThan(0);
  });

  it('every body geometry carries aSurface and the expected surfaces appear', () => {
    const ids = (g: THREE.Group): Set<number> => {
      const out = new Set<number>();
      for (const m of meshes(g)) {
        if (m.name !== 'body') continue;
        const a = m.geometry.getAttribute(SURFACE_ATTRIBUTE);
        for (let i = 0; i < a.count; i++) out.add(a.getX(i));
      }
      return out;
    };
    const expectIds = (preset: (typeof HOUSE_PRESETS)[number], want: number[]): void => {
      const got = ids(buildHouse({ ...defaultHouseParams(preset), seed: 3 }));
      for (const w of want) expect(got.has(w)).toBe(true);
    };
    expectIds('canal-amsterdam', [SURFACE.BRICK, SURFACE.TILE_SLATE]);
    expectIds('mediterranean', [SURFACE.STUCCO, SURFACE.TILE_TERRACOTTA]);
    expectIds('original-feuilles', [SURFACE.STONE, SURFACE.ZINC, SURFACE.BRICK]);
    expectIds('brownstone-ny', [SURFACE.BRICK]);
    expectIds('brutalist-concrete', [SURFACE.CONCRETE]);
    expectIds('nordic-timber', [SURFACE.TIMBER, SURFACE.TILE_SLATE]);
    expectIds('shophouse-asia', [SURFACE.STUCCO, SURFACE.TILE_TERRACOTTA]);
    expectIds('bauhaus', [SURFACE.STUCCO]);
  });

  it('builds a finished rear elevation when the back is not a facade', () => {
    const rearGlass = (g: THREE.Group): number => {
      let n = 0;
      for (const m of meshes(g)) {
        if (m.name !== 'glass' && m.name !== 'glassLit') continue;
        const nor = m.geometry.getAttribute('normal');
        const pos = m.geometry.getAttribute('position');
        for (let i = 0; i < nor.count; i++) if (nor.getZ(i) < -0.9 && pos.getZ(i) < -2) n++;
      }
      return n;
    };
    for (const preset of HOUSE_PRESETS) {
      const base: HouseParams = { ...defaultHouseParams(preset), width: 12, depth: 12, floors: 5, seed: 11 };
      const front = { front: true, back: false, left: false, right: false };
      const both = { front: true, back: true, left: false, right: false };
      const noBack = buildHouse({ ...base, facades: front });
      const withBack = buildHouse({ ...base, facades: both });
      expect(rearGlass(noBack)).toBeGreaterThan(0);
      expect(rearGlass(withBack)).toBeGreaterThan(0);
      const again = buildHouse({ ...base, facades: both });
      expect(again.userData.triangles).toBe(withBack.userData.triangles);
    }
  });

  it('exports chimney pot tops inside the footprint above the roof line', () => {
    let count = 0;
    for (const preset of HOUSE_PRESETS) {
      for (const style of STYLES) {
        for (let seed = 1; seed <= 4; seed++) {
          const params: HouseParams = { ...defaultHouseParams(preset, style), seed };
          const g = buildHouse(params);
          const list = g.userData.chimneys as HouseChimney[];
          expect(Array.isArray(list)).toBe(true);
          expect(list.length).toBeLessThanOrEqual(3);
          const { width, depth } = houseFootprint(preset);
          for (const ch of list) {
            count++;
            expect(Math.abs(ch.x)).toBeLessThanOrEqual(width / 2);
            expect(Math.abs(ch.z)).toBeLessThanOrEqual(depth / 2);
            expect(ch.y).toBeGreaterThan(g.userData.height - 4);
          }
        }
      }
    }
    expect(count).toBeGreaterThan(20);
    const classic = buildHouse({ ...defaultHouseParams('original-feuilles'), seed: 2 });
    expect((classic.userData.chimneys as HouseChimney[]).length).toBeGreaterThanOrEqual(1);
  });

  it('shopfronts and cafes get a sign mesh with atlas uvs', () => {
    for (const groundFloor of ['cafe', 'shop'] as const) {
      const g = buildHouse({ ...defaultHouseParams('original-feuilles'), groundFloor, seed: 4 });
      const sign = meshes(g).find((m) => m.name === 'sign');
      expect(sign).toBeDefined();
      const uv = sign!.geometry.getAttribute('uv');
      let nonZero = 0;
      for (let i = 0; i < uv.count; i++) if (uv.getX(i) > 0 || uv.getY(i) > 0) nonZero++;
      expect(nonZero).toBeGreaterThan(0);
      expect(sign!.material).toBe(getSignMaterial());
    }
    const res = buildHouse({ ...defaultHouseParams('canal-amsterdam'), groundFloor: 'residential' });
    expect(meshes(res).find((m) => m.name === 'sign')).toBeUndefined();
    const a = buildHouse({ ...defaultHouseParams('shophouse-asia'), seed: 9 });
    const b = buildHouse({ ...defaultHouseParams('shophouse-asia'), seed: 9 });
    const sig = (g: THREE.Group): number[] =>
      Array.from(meshes(g).find((m) => m.name === 'sign')!.geometry.getAttribute('uv').array as Float32Array);
    expect(sig(a)).toEqual(sig(b));
  });

  it('houses merge: every body geometry has the same attribute set', () => {
    const geos: THREE.BufferGeometry[] = [];
    const signs: THREE.BufferGeometry[] = [];
    for (const preset of HOUSE_PRESETS) {
      const facades = { front: true, back: false, left: true, right: false };
      const g = buildHouse({ ...defaultHouseParams(preset), seed: 5, groundFloor: 'shop', facades });
      for (const m of meshes(g)) {
        if (m.name === 'body') geos.push(m.geometry);
        if (m.name === 'sign') signs.push(m.geometry);
      }
    }
    expect(mergeGeometries(geos, false)).not.toBeNull();
    expect(mergeGeometries(signs, false)).not.toBeNull();
  });
});
