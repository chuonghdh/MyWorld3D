// Performance budgets for a seeded default city (REVIEW-01 R-1 / R-10, tasks 3.1 and 3.6).
//
// The scene is assembled the way src/scene/Town.tsx does for the static parts (house blocks merged per
// block, monuments, streetscape, street trees, courtyard greenery) and every mesh is counted:
//   main pass   = every visible mesh, triangles times instances;
//   shadow pass = meshes with castShadow, drawn again from the sun.
// Moving actors (vehicles, walkers, birds, leaves, smoke, clouds) are instanced with a runtime count and
// are not part of this static estimate. Draw calls are one per mesh, so the estimate is
// main-pass meshes + shadow-pass meshes. Thresholds sit a little above the measured values.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateCity } from '../src/city';
import { buildHouse, buildMonument, MONUMENT_KINDS } from '../src/buildings';
import { boxCasts, CASTER_ATTRIBUTE } from '../src/buildings/facade/mesh';
import { createStreetscape } from '../src/streets';
import { createTreeField, createCourtyardGreenery, createWindUniforms } from '../src/environment';
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
    into.main += t;
    into.mainMeshes++;
    if (o.castShadow) {
      into.shadow += t;
      into.shadowMeshes++;
    }
  });
  return into;
}

function hash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

function sceneCounts(seed: number): { total: Counts; blocks: Counts } {
  const settings = { ...DEFAULT_SETTINGS, seed };
  const layout = generateCity(settings);
  const blocks: Counts = { main: 0, shadow: 0, mainMeshes: 0, shadowMeshes: 0 };
  for (const b of seed === SEED ? seededBlocks() : buildCityBlocks(seed)) count(b.group, blocks);
  const total = { ...blocks };
  for (const block of layout.blocks) {
    if (block.kind !== 'monument') continue;
    const kind = MONUMENT_KINDS[Math.floor(hash(block.id) * MONUMENT_KINDS.length)];
    count(buildMonument(kind, { width: 30, depth: 30, seed: 1 }), total);
  }
  count(createStreetscape(layout).group, total);
  const trees = createTreeField(
    layout.streetTrees.map((t) => ({ id: t.id, position: t.position, species: t.species, scale: t.scale * 1.35 })),
    { season: 'summer', uniforms: createWindUniforms(), seed },
  );
  count(trees.group, total);
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
  const { total, blocks } = sceneCounts(SEED);
  const bodyAll = (() => {
    const t = { body: 0 };
    for (const b of seededBlocks()) {
      const by = trisByName(b.group);
      t.body += (by['building-body'] ?? 0) + (by['building-body-detail'] ?? 0);
    }
    return t.body;
  })();

  const detailMeshes = seededBlocks().reduce((n, b) => n + meshesOf(b.group, 'building-body-detail').length, 0);

  // Measured on seed 1, default settings, static scene (task 3.1 done):
  //   main pass    1,383,853 triangles in 98 meshes (75 of them house-block meshes), unchanged by the split
  //   shadow pass    421,859 triangles in 32 meshes; before the split every body triangle cast: 1,325,327
  //   draw calls     130 (98 main + 32 shadow); before the split 115 (the 15 detail meshes are new)
  const shadowBefore = total.shadow - blocks.shadow + bodyAll;

  it('measures the scene', () => {
    // eslint-disable-next-line no-console
    console.log('BUDGET', JSON.stringify({ total, blocks, bodyAll, shadowBefore, detailMeshes, calls: total.mainMeshes + total.shadowMeshes }));
    expect(total.main).toBeGreaterThan(1_000_000);
  });

  it('main-pass triangles stay at the pre-diet level (no visible geometry removed)', () => {
    // Measured 1,383,853; the diet moves triangles between meshes but never deletes one.
    expect(total.main).toBeLessThanOrEqual(1_430_000);
    expect(blocks.main).toBeGreaterThanOrEqual(1_100_000);
    expect(blocks.main).toBeLessThanOrEqual(1_140_000);
  });

  it('shadow-pass triangles are at most 40 percent of the pre-diet level', () => {
    // Measured 421,859 (31.8 percent of the 1,325,327 before the diet).
    expect(total.shadow).toBeLessThanOrEqual(450_000);
    expect(total.shadow).toBeLessThanOrEqual(shadowBefore * 0.4);
  });

  it('main plus shadow triangles of the static scene stay well under the 3 M design budget', () => {
    // Measured 1,383,853 + 421,859 = 1,805,712.
    expect(total.main + total.shadow).toBeLessThanOrEqual(1_900_000);
  });

  it('draw-call estimate (main meshes + shadow meshes) stays under its threshold', () => {
    // Measured 130 = 98 + 32. The diet adds one detail mesh per house block to the main pass only.
    expect(total.mainMeshes + total.shadowMeshes).toBeLessThanOrEqual(140);
    expect(total.mainMeshes + total.shadowMeshes).toBeLessThanOrEqual(400);
    expect(detailMeshes).toBeLessThanOrEqual(seededBlocks().length);
  });
});
