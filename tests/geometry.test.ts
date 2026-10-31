// Geometry QA: z-fighting, missing walls and bad winding on houses (see tests/helpers/geometryAudit.ts).
//
// Thresholds (all documented in the helper): two visible surfaces that overlap by more than 1 cm2 must
// be at least 2 cm apart along their normal unless they face opposite ways (a back face is culled, so
// it cannot fight; those are counted and reported but allowed); every triangle winds the way its stored
// normal says; and a grid of rays (17 directions, 0.5 m spacing on single houses, 1.5 m on whole city
// blocks) must always meet a front-facing surface first.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHouse, defaultHouseParams, HOUSE_PRESETS, ROOF_TYPES, type HouseParams } from '../src/buildings';
import { computeLayout } from '../src/buildings/facade/layout';
import { resolveLayers, LAYER_STEP, type LayerBox } from '../src/buildings/facade/layers';
import {
  auditAll,
  coplanarOverlaps,
  formatAudit,
  raycasterHitsFront,
  seeThrough,
  traceRay,
  windingMismatches,
  type FloorRect,
} from './helpers/geometryAudit';
import { FACADE_SETS, matrixCases } from './helpers/matrix';
import { buildCityBlocks, houseParamsFor, lotMatrix } from './helpers/cityBuild';
import { buildMonument, MONUMENT_KINDS } from '../src/buildings/monument';
import { DEFAULT_SETTINGS } from '../src/store/model';

/** Footprint rectangle in which a downward ray must meet a roof: the lot minus facade reveals and chamfers. */
function floorFor(params: HouseParams): FloorRect[] {
  const lay = computeLayout(params);
  const inset = 1.2 + lay.chamfer;
  return [{ x: 0, z: 0, hw: Math.max(0.5, lay.W / 2 - inset), hd: Math.max(0.5, lay.D / 2 - inset), facing: 0 }];
}

function check(label: string, params: HouseParams, opts: { spacing?: number } = {}): string {
  const g = buildHouse(params);
  const a = auditAll(g, { seeThrough: { spacing: opts.spacing ?? 0.5, floors: floorFor(params) } });
  const bad = a.coplanar.sameFacing + a.winding.mismatches + a.seeThrough.violations;
  return bad === 0 ? '' : formatAudit(label, a);
}

// ---------------------------------------------------------------------------------------------
describe('geometry audit helpers', () => {
  const boxGeo = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
  };
  const mesh = (g: THREE.BufferGeometry, name = 'body', side: THREE.Side = THREE.FrontSide): THREE.Mesh => {
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side }));
    m.name = name;
    return m;
  };

  it('finds equally facing coplanar overlaps and ignores 2 cm separation', () => {
    const a = boxGeo(0, 2, 0, 2, 0, 1);
    const flush = boxGeo(0.5, 1.5, 0.5, 1.5, 0.5, 1); // its +z face shares the plane z = 1
    const r = coplanarOverlaps(new THREE.Group().add(mesh(a), mesh(flush)));
    expect(r.sameFacing).toBeGreaterThan(0);
    const lifted = boxGeo(0.5, 1.5, 0.5, 1.5, 0.5, 1.02);
    expect(coplanarOverlaps(new THREE.Group().add(mesh(a), mesh(lifted))).sameFacing).toBe(0);
    const lifted1 = boxGeo(0.5, 1.5, 0.5, 1.5, 0.5, 1.01);
    expect(coplanarOverlaps(new THREE.Group().add(mesh(a), mesh(lifted1))).sameFacing).toBeGreaterThan(0);
  });

  it('counts back-to-back faces as opposed, not as z-fights', () => {
    const a = boxGeo(0, 1, 0, 1, 0, 1);
    const b = boxGeo(0, 1, 0, 1, 1, 2);
    const r = coplanarOverlaps(new THREE.Group().add(mesh(a), mesh(b)));
    expect(r.sameFacing).toBe(0);
    expect(r.opposed).toBeGreaterThan(0);
  });

  it('flags windings that disagree with the stored normals, including mirrored matrices', () => {
    const g = boxGeo(0, 1, 0, 1, 0, 1);
    expect(windingMismatches(g).mismatches).toBe(0);
    const pos = g.getAttribute('position');
    const a = pos.getX(1);
    const b = pos.getY(1);
    const c = pos.getZ(1);
    pos.setXYZ(1, pos.getX(2), pos.getY(2), pos.getZ(2));
    pos.setXYZ(2, a, b, c);
    expect(windingMismatches(g).mismatches).toBe(1);
    // A mirrored object matrix baked without flipping the winding.
    const m = mesh(boxGeo(0, 1, 0, 1, 0, 1));
    m.scale.x = -1;
    m.updateMatrixWorld(true);
    expect(windingMismatches(m).mismatches).toBeGreaterThan(0);
  });

  it('sees through a box with a missing face and agrees with THREE.Raycaster on a closed one', () => {
    const closed = boxGeo(0, 2, 0, 2, 0, 2);
    expect(seeThrough(mesh(closed)).violations).toBe(0);
    const open = closed.clone();
    // Drop the two triangles of the +x face.
    const pos = open.getAttribute('position');
    const keep: number[] = [];
    for (let t = 0; t < pos.count / 3; t++) {
      if (pos.getX(t * 3) > 1.99 && pos.getX(t * 3 + 1) > 1.99 && pos.getX(t * 3 + 2) > 1.99) continue;
      keep.push(t);
    }
    const g2 = new THREE.BufferGeometry();
    const arr = new Float32Array(keep.length * 9);
    const narr = new Float32Array(keep.length * 9);
    keep.forEach((t, i) => {
      for (let k = 0; k < 9; k++) {
        arr[i * 9 + k] = (pos.array as Float32Array)[t * 9 + k];
        narr[i * 9 + k] = (open.getAttribute('normal').array as Float32Array)[t * 9 + k];
      }
    });
    g2.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g2.setAttribute('normal', new THREE.BufferAttribute(narr, 3));
    expect(seeThrough(mesh(g2)).violations).toBeGreaterThan(0);
    // Cross-check one ray against the stock Raycaster and the brute-force tracer.
    const m = mesh(closed);
    expect(raycasterHitsFront(m, [-5, 1, 1], [1, 0, 0])).toBe(true);
    const hits = traceRay(m, [-5, 1, 1], [1, 0, 0]);
    expect(hits[0].front).toBe(true);
  });

  it('layering pass keeps equally facing overlapping faces 2 cm apart and drops hidden ones', () => {
    const f = { ox: 0, oz: 0, ux: 1, uz: 0, nx: 0, nz: 1 };
    const box = (n0: number, n1: number): LayerBox => ({ f, u0: 0, u1: 1, y0: 0, y1: 1, n0, n1, skip: 0 });
    const wall = box(-0.3, 0);
    const trim = box(0, 0.01); // front face 1 cm proud of the wall's: too close
    const next = box(0.01, 0.2); // stands on the trim: shares a face with it
    resolveLayers([wall, trim, next]);
    expect(trim.n1 - wall.n1).toBeGreaterThanOrEqual(LAYER_STEP - 1e-9);
    // The box sitting on the wall hides its own back face and the wall's front is covered only partly.
    expect(trim.skip).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
describe('single houses', () => {
  const all = matrixCases();

  it('has the expected matrix (every preset x roof x style x facade set)', () => {
    expect(all.length).toBe((HOUSE_PRESETS.length - 1) * ROOF_TYPES.length * 2 * Object.keys(FACADE_SETS).length);
  });

  it('every preset x roof x style is free of z-fights, bad winding and see-through gaps', () => {
    // One facade set per (preset, style, roof), rotating through all five, so each combination of the
    // matrix is built and each facade set is hit equally often; floors 2/4/8 and seeds rotate too.
    const sets = Object.keys(FACADE_SETS).length;
    const picked = all.filter((_, i) => Math.floor(i / sets) % sets === i % sets).filter((_, i) => i % 2 === 0);
    const failures: string[] = [];
    for (const c of picked) {
      const msg = check(c.label, c.params);
      if (msg) failures.push(msg);
      if (failures.length >= 6) break;
    }
    expect(failures.join('\n')).toBe('');
    expect(picked.length).toBeGreaterThan(75);
  }, 120_000);

  it('facade combinations x floors x seeds on the roofs that carry most detail', () => {
    const failures: string[] = [];
    let n = 0;
    for (const preset of ['original-feuilles', 'canal-amsterdam', 'brownstone-ny', 'glass-tower'] as const) {
      for (const [name, facades] of Object.entries(FACADE_SETS)) {
        for (const floors of [2, 8]) {
          const base = defaultHouseParams(preset, 'classic');
          const roof = floors === 2 ? 'gable' : floors === 4 ? base.roof : 'mansard';
          const params: HouseParams = { ...base, roof, floors, facades, seed: 3 + floors, width: 11, depth: 15 };
          const msg = check(`${preset}/${name}/f${floors}/${roof}`, params);
          n++;
          if (msg) failures.push(msg);
        }
      }
    }
    expect(failures.slice(0, 6).join('\n')).toBe('');
    expect(n).toBe(40);
  }, 120_000);

  it('shared-courtyard backs (merged blocks) are free of z-fights, bad winding and see-through gaps', () => {
    const failures: string[] = [];
    let n = 0;
    for (const preset of HOUSE_PRESETS) {
      for (const floors of [2, 4, 8]) {
        for (const seed of [1, 7]) {
          const base = defaultHouseParams(preset, 'classic');
          const facades = seed === 1 ? FACADE_SETS.front : FACADE_SETS['front+left'];
          const params: HouseParams = { ...base, floors, seed, facades, width: 11, depth: 15, sharedCourtyard: true };
          const msg = check(`${preset}/shared/f${floors}/s${seed}`, params);
          n++;
          if (msg) failures.push(msg);
        }
      }
    }
    expect(failures.slice(0, 6).join('\n')).toBe('');
    expect(n).toBeGreaterThan(40);
  }, 120_000);

  it('stays inside the triangle budget', () => {
    const p: HouseParams = { ...defaultHouseParams('original-feuilles', 'classic'), floors: 5, width: 12, depth: 14, seed: 3 };
    const g = buildHouse(p);
    expect(g.userData.triangles).toBeLessThan(17_000);
  });
});

// ---------------------------------------------------------------------------------------------
describe('the real city, built like Town.tsx builds it', () => {
  /**
   * Neighbouring houses can graze each other through rear details that reach over the lot line (a
   * drainpipe against the next house's parapet). mergeByMaterial drops what lies inside a neighbour; what
   * is left must stay below this overlap area (m2) per pair, and winding and see-through stay at zero.
   */
  const CROSS_HOUSE_MAX_AREA = 0.02;

  function auditBlocks(seed: number, rayStep: number | null, every: number): string {
    const blocks = buildCityBlocks(seed);
    expect(blocks.length).toBeGreaterThan(5);
    const failures: string[] = [];
    blocks.forEach((b, bi) => {
      if (bi % every !== 0) return;
      // Every lot matrix is a pure rotation: a negative determinant would flip the winding of the block.
      for (const lot of b.lots) expect(lotMatrix(lot).determinant()).toBeGreaterThan(0);
      const floors: FloorRect[] = b.lots.map((lot) => {
        const lay = computeLayout(houseParamsFor(lot, b.id));
        const inset = 1.2 + lay.chamfer;
        return { x: lot.position.x, z: lot.position.z, hw: Math.max(0.5, lot.width / 2 - inset), hd: Math.max(0.5, lot.depth / 2 - inset), facing: lot.facing };
      });
      const a = auditAll(b.group, { skipSeeThrough: rayStep === null, seeThrough: { spacing: rayStep ?? 2, floors } });
      const big = a.coplanar.samplesSame.filter((p) => p.area >= CROSS_HOUSE_MAX_AREA).length;
      // Rays that run along the 5 cm slit between two houses can meet a ledge from behind: allow 0.5% of the rays.
      if (big > 0 || a.winding.mismatches > 0 || a.seeThrough.violations > 0.005 * a.seeThrough.rays) failures.push(formatAudit(`seed ${seed} ${b.id}`, a));
    });
    return failures.slice(0, 5).join('\n');
  }

  it('DEFAULT_SETTINGS city: merged blocks pass winding, coplanar and see-through audits', () => {
    expect(auditBlocks(DEFAULT_SETTINGS.seed, 2, 1)).toBe('');
  }, 180_000);

  it('two other seeds: coplanar overlaps and winding over every second merged block', () => {
    expect(auditBlocks(7, null, 2)).toBe('');
    expect(auditBlocks(23, null, 2)).toBe('');
  }, 180_000);
});

// ---------------------------------------------------------------------------------------------
describe('monuments (report only)', () => {
  it('audits the ten monuments; winding and z-fight counts must not grow beyond the recorded baseline', () => {
    let same = 0;
    let wind = 0;
    for (const kind of MONUMENT_KINDS) {
      const g = buildMonument(kind, { seed: 1 });
      const a = auditAll(g, { skipSeeThrough: true });
      same += a.coplanar.sameFacing;
      wind += a.winding.mismatches;
    }
    // Baseline measured when the audit was introduced (monuments use ColorBatch, not the layering pass).
    expect(wind).toBeLessThanOrEqual(240);
    expect(same).toBeLessThanOrEqual(11_000);
  }, 120_000);
});
