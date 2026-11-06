// Performance budgets for a seeded default city (REVIEW-01 R-1 / R-10, tasks 3.1 and 3.6).
//
// The scene is assembled the way src/scene/Town.tsx does for the static parts (house blocks merged per
// block, monuments, streetscape, street trees, courtyard greenery) and every mesh is counted:
//   main pass   = every visible mesh, triangles times instances;
//   shadow pass = meshes with castShadow, drawn again from the sun.
// Moving actors (vehicles, walkers, birds, leaves, smoke, clouds) are instanced with a runtime count and
// are not part of this static estimate. Draw calls are one per mesh, so the estimate is
// main-pass meshes + shadow-pass meshes. Thresholds sit a little above the measured values.
import { beforeAll, describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { generateCity } from '../src/city';
import { buildHouse, buildMonument } from '../src/buildings';
import { boxCasts, CASTER_ATTRIBUTE } from '../src/buildings/facade/mesh';
import { createStreetscape } from '../src/streets';
import { createCourtyardGreenery } from '../src/environment';
import {
  createNatureTreeField,
  NATURE_TYPES,
  natureAssetFromGltf,
  natureItems,
  type NatureAsset,
} from '../src/streets/natureTrees';
import type { Rect } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { mergeByMaterial, type PlacedObject } from '../src/scene/mergeBlock';
import { buildCityBlocks, houseParamsFor, lotMatrix } from './helpers/cityBuild';

const SEED = 1;

let blocksCache: ReturnType<typeof buildCityBlocks> | null = null;
/** The seeded city's house blocks, built once for the whole file (building them takes a few seconds). */
function seededBlocks(): ReturnType<typeof buildCityBlocks> {
  return (blocksCache ??= buildCityBlocks(SEED));
}

interface Counts {
  /** Triangles drawn by the camera. */
  main: number;
  /** Triangles drawn into the sun shadow map. */
  shadow: number;
  /** Meshes drawn by the camera. */
  mainMeshes: number;
  /** Meshes drawn into the shadow map. */
  shadowMeshes: number;
  /** Triangles of shadow-only meshes (layers exclude 0): in the shadow total, never in the main pass. */
  shadowOnly: number;
}

function trisOf(mesh: THREE.Mesh): number {
  const g = mesh.geometry as THREE.BufferGeometry;
  const per = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
  return mesh instanceof THREE.InstancedMesh ? per * mesh.count : per;
}

function count(root: THREE.Object3D, into: Counts): Counts {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const t = trisOf(o);
    if (t === 0) return;
    // The main camera only draws layer 0; shadow-only copies (natureTrees.ts SHADOW_LAYER) are not main-pass work.
    const inMain = o.layers.isEnabled(0);
    if (inMain) {
      into.main += t;
      into.mainMeshes++;
    }
    if (o.castShadow) {
      into.shadow += t;
      into.shadowMeshes++;
      if (!inMain) into.shadowOnly += t;
    }
  });
  return into;
}

/** The six city tree types, parsed from the GLBs (no textures, no sway: triangles and draws only). */
type NodeFs = { readFileSync(path: string): Uint8Array };

async function loadNatureAssetsForTest(): Promise<NatureAsset[]> {
  // Node's fs, loaded at run time (no @types/node in this project). vitest runs from the project root.
  const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as NodeFs;
  const loader = new GLTFLoader();
  return Promise.all(
    NATURE_TYPES.map(async (type) => {
      const buf = fs.readFileSync(`public/models/quaternius/${type.file}.glb`);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const gltf = await loader.parseAsync(data, '');
      return natureAssetFromGltf(type, gltf, null, null);
    }),
  );
}

function sceneCounts(seed: number, assets: NatureAsset[]): { total: Counts; blocks: Counts } {
  const settings = { ...DEFAULT_SETTINGS, seed };
  const layout = generateCity(settings);
  const blocks: Counts = { main: 0, shadow: 0, mainMeshes: 0, shadowMeshes: 0, shadowOnly: 0 };
  for (const b of seed === SEED ? seededBlocks() : buildCityBlocks(seed)) count(b.group, blocks);
  const total = { ...blocks };
  for (const block of layout.blocks) {
    if (block.kind !== 'monument') continue;
    count(buildMonument(block.monument!, { width: 30, depth: 30, seed: 1 }), total);
  }
  count(createStreetscape(layout).group, total);
  count(createNatureTreeField(natureItems(layout, seed), assets, 'summer').group, total);
  count(
    createCourtyardGreenery(
      layout.blocks.filter((b) => b.kind === 'houses' && b.courtyard).map((b) => b.courtyard as Rect),
      seed,
    ),
    total,
  );
  return { total, blocks };
}

const BLOCK_CASE = 3;

function meshesOf(root: THREE.Object3D, name: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.name === name) out.push(o);
  });
  return out;
}

function trisByName(root: THREE.Object3D): Record<string, number> {
  const out: Record<string, number> = {};
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) out[o.name] = (out[o.name] ?? 0) + trisOf(o);
  });
  return out;
}

describe('shadow caster classification', () => {
  it('keeps masses casting and drops small detail', () => {
    // wall, roof slab, parapet, balcony slab, cornice, chimney stack, shutter-free thick lintel
    expect(boxCasts(12, 3, 0.3)).toBe(true);
    expect(boxCasts(8, 0.2, 5)).toBe(true);
    expect(boxCasts(10, 0.6, 0.2)).toBe(true);
    expect(boxCasts(3, 0.12, 1.2)).toBe(true);
    expect(boxCasts(10, 0.25, 0.3)).toBe(true);
    expect(boxCasts(0.6, 1.4, 0.6)).toBe(true);
    // window frame bar, railing bar, chimney pot, shutter, sign board, tiny block
    expect(boxCasts(0.06, 1.4, 0.05)).toBe(false);
    expect(boxCasts(0.03, 1.2, 0.03)).toBe(false);
    expect(boxCasts(0.25, 0.3, 0.25)).toBe(false);
    expect(boxCasts(0.5, 1.6, 0.04)).toBe(false);
    expect(boxCasts(2.4, 0.6, 0.05)).toBe(false);
    expect(boxCasts(0.3, 0.3, 0.3)).toBe(false);
  });
});

describe('shadow pass diet (task 3.1)', () => {
  it('splits each block body into a caster mesh and a detail mesh without losing a triangle', () => {
    const blocks = seededBlocks().slice(0, BLOCK_CASE);
    expect(blocks.length).toBe(BLOCK_CASE);
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed: SEED });
    for (const b of blocks) {
      // Reference: the same block merged the old way (no caster flags, the whole body casts).
      const placed: PlacedObject[] = b.lots.map((lot) => {
        const object = buildHouse(houseParamsFor(lot, b.id));
        object.traverse((c) => {
          if (c instanceof THREE.Mesh) (c.geometry as THREE.BufferGeometry).deleteAttribute(CASTER_ATTRIBUTE);
        });
        return { object, matrix: lotMatrix(lot) };
      });
      const ref = trisByName(mergeByMaterial(placed, 'ref-' + b.id));
      const got = trisByName(b.group);
      expect(got['building-body'] + (got['building-body-detail'] ?? 0)).toBe(ref['building-body']);
      for (const k of Object.keys(ref)) if (k !== 'building-body') expect(got[k]).toBe(ref[k]);
      expect(got['building-body-detail']).toBeGreaterThan(0);
      for (const m of meshesOf(b.group, 'building-body-detail')) {
        expect(m.castShadow).toBe(false);
        expect(m.geometry.getAttribute(CASTER_ATTRIBUTE)).toBeUndefined();
      }
      for (const m of meshesOf(b.group, 'building-body')) expect(m.castShadow).toBe(true);
    }
    expect(layout.blocks.length).toBeGreaterThan(0);
  });

  it('keeps walls, roofs and chimney stacks in the caster mesh', { timeout: 120_000 }, () => {
    const blocks = seededBlocks().slice(0, BLOCK_CASE);
    const ray = new THREE.Raycaster();
    let rays = 0;
    let chimneys = 0;
    for (const b of blocks) {
      const casters = meshesOf(b.group, 'building-body');
      const detail = meshesOf(b.group, 'building-body-detail');
      const all = [...casters, ...detail];
      const isCaster = new Set<THREE.Object3D>(casters);
      for (const lot of b.lots) {
        const m = lotMatrix(lot);
        const house = buildHouse(houseParamsFor(lot, b.id));
        const height = (house.userData as { height: number }).height;
        // Straight down onto the roof, 1.5 m inside the footprint: some caster must lie within 1.6 m of the first hit.
        const hw = Math.max(0.5, lot.width / 2 - 2.5);
        const hd = Math.max(0.5, lot.depth / 2 - 2.5);
        for (const [fx, fz] of [[0, 0], [-0.6, 0.3], [0.6, -0.3]]) {
          const o = new THREE.Vector3(fx * hw, height + 30, fz * hd).applyMatrix4(m);
          ray.set(o, new THREE.Vector3(0, -1, 0));
          const hits = ray.intersectObjects(all, false);
          if (hits.length === 0) continue;
          rays++;
          const first = hits[0].distance;
          expect(hits.some((h) => isCaster.has(h.object) && h.distance - first < 1.6), `${b.id}/${lot.id} roof`).toBe(true);
        }
        // Horizontal rays at 3 m height at the street facade: a caster (the wall) lies within 1.6 m of the first hit.
        for (const fx of [-0.6, 0, 0.6]) {
          const o = new THREE.Vector3(fx * (lot.width / 2 - 1), 3, lot.depth / 2 + 6).applyMatrix4(m);
          const dir = new THREE.Vector3(0, 0, -1).transformDirection(m);
          ray.set(o, dir);
          const hits = ray.intersectObjects(all, false);
          if (hits.length === 0) continue;
          rays++;
          const first = hits[0].distance;
          expect(hits.some((h) => isCaster.has(h.object) && h.distance - first < 1.6), `${b.id}/${lot.id} wall`).toBe(true);
        }
        // Chimney stacks: the tip is the top of a pot; the brick stack (a caster) ends just below it, within 1.5 m sideways.
        const pos = casters.map((c) => c.geometry.getAttribute('position'));
        for (const c of ((house.userData as { chimneys?: { x: number; y: number; z: number }[] }).chimneys ?? [])) {
          const tip = new THREE.Vector3(c.x, c.y, c.z).applyMatrix4(m);
          let found = false;
          const v = new THREE.Vector3();
          for (const p of pos) {
            for (let i = 0; i < p.count && !found; i++) {
              v.fromBufferAttribute(p, i);
              if (Math.hypot(v.x - tip.x, v.z - tip.z) < 1.5 && v.y > tip.y - 1.6 && v.y <= tip.y + 0.01) found = true;
            }
            if (found) break;
          }
          expect(found, `${b.id}/${lot.id} chimney`).toBe(true);
          chimneys++;
        }
      }
    }
    expect(rays).toBeGreaterThan(20);
    expect(chimneys).toBeGreaterThan(0);
  });
});

describe('render budget (seeded default city)', () => {
  let total: Counts;
  let blocks: Counts;
  let bodyAll = 0;
  let detailMeshes = 0;
  beforeAll(async () => {
    ({ total, blocks } = sceneCounts(SEED, await loadNatureAssetsForTest()));
    bodyAll = (() => {
    const t = { body: 0 };
    for (const b of seededBlocks()) {
      const by = trisByName(b.group);
      t.body += (by['building-body'] ?? 0) + (by['building-body-detail'] ?? 0);
    }
    return t.body;
    })();
    detailMeshes = seededBlocks().reduce((n, b) => n + meshesOf(b.group, 'building-body-detail').length, 0);

  // Measured on seed 1, default settings, static scene (task 3.1 done):
  //   main pass    1,383,853 triangles in 98 meshes (75 of them house-block meshes), unchanged by the split
  //   shadow pass    421,859 triangles in 32 meshes; before the split every body triangle cast: 1,325,327
  //   draw calls     130 (98 main + 32 shadow); before the split 115 (the 15 detail meshes are new)
  }, 300_000);

  it('measures the scene', () => {
    console.log('BUDGET', JSON.stringify({ total, blocks, bodyAll, detailMeshes, calls: total.mainMeshes + total.shadowMeshes }));
    expect(total.main).toBeGreaterThan(1_000_000);
  });

  it('main-pass triangles stay at the pre-diet level (no visible geometry removed)', () => {
    // Measured 1,539,195 (Quaternius city trees, was 1,383,853); the diet moves triangles between meshes but never deletes one.
    // Raised from 1,700,000: broadleaf leaf clusters and falling leaves add main-pass triangles (user decision).
    expect(total.main).toBeLessThanOrEqual(1_900_000);
    // House-block mass only. Re-banded: the monument rule (1 in 5 blocks, city/generate.ts) turns 3 of the 16 seed-1
    // blocks into monuments, so 13 are house blocks now (948,598 measured) instead of about 15 (1.1 M before).
    expect(blocks.main).toBeGreaterThanOrEqual(900_000);
    expect(blocks.main).toBeLessThanOrEqual(1_000_000);
  });

  it('shadow-pass triangles stay under the 605,000 ceiling', () => {
    expect(total.shadow).toBeLessThanOrEqual(605_000);
  });

  it('no shadow-only copies: every caster is also drawn by the main pass', () => {
    expect(total.shadowOnly).toBe(0);
    // Raised from 1,700,000: broadleaf leaf clusters and falling leaves add main-pass triangles (user decision).
    expect(total.main).toBeLessThanOrEqual(1_900_000);
  });

  it('main plus shadow triangles of the static scene stay well under the 3 M design budget', () => {
    // Measured 1,539,195 + 549,627 = 2,088,822.
    expect(total.main + total.shadow).toBeLessThanOrEqual(2_300_000);
  });

  it('draw-call estimate (main meshes + shadow meshes) stays under its threshold', () => {
    // Measured 127 = 95 + 32 with 3 monuments per seed-1 town (1 in 5 rule). The diet adds one detail mesh per house block to the main pass only.
    expect(total.mainMeshes + total.shadowMeshes).toBeLessThanOrEqual(140);
    expect(detailMeshes).toBeLessThanOrEqual(seededBlocks().length);
  });
});
