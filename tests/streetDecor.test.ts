import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateCity, type CityLayout } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { createStreetscape, MESH_NAMES } from '../src/streets';
import {
  planStreetDecor,
  rectCircleDistance,
  solidCorners,
  WALK_CLEARANCE,
  type DecorPlan,
} from '../src/streets/decor';
import { CURB_WIDTH } from '../src/streets/surfaces';
import { computeParkingSpots, PARKED_SIZE } from '../src/traffic/parking';

const SEEDS = [1, 7, 1234, 98765];

function cityOf(seed: number, size = 217): CityLayout {
  return generateCity({ ...DEFAULT_SETTINGS, seed, townWidth: size, townDepth: size });
}

const count = (plan: DecorPlan, kind: string) => plan.solids.filter((s) => s.kind === kind).length;

describe('street decor plan', () => {
  it('is deterministic and responds to the seed', () => {
    const a = planStreetDecor(cityOf(1));
    const b = planStreetDecor(cityOf(1));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(planStreetDecor(cityOf(7)))).not.toBe(JSON.stringify(a));
  });

  it('provides every family on the default town', () => {
    const plan = planStreetDecor(cityOf(DEFAULT_SETTINGS.seed));
    expect(count(plan, 'busStop')).toBeGreaterThanOrEqual(1);
    expect(count(plan, 'busSign')).toBeGreaterThanOrEqual(1);
    expect(count(plan, 'kiosk')).toBeGreaterThanOrEqual(1);
    expect(count(plan, 'bikeRack')).toBeGreaterThanOrEqual(1);
    expect(plan.manholes.length).toBeGreaterThanOrEqual(3);
    expect(plan.patches.filter((p) => p.kind === 'dark' || p.kind === 'light').length).toBeGreaterThanOrEqual(3);
    expect(plan.patches.some((p) => p.kind === 'wear')).toBe(true);
    expect(plan.paving.length).toBeGreaterThanOrEqual(20);
    expect(plan.kerbCorners.length).toBeGreaterThanOrEqual(4);
    expect(plan.tactile.length).toBeGreaterThan(0);
    expect(plan.fountain).not.toBeNull();
    expect(plan.fountain!.pigeons.length).toBeGreaterThan(0);
  });

  it('keeps solids bounded (triangle budget) and a fountain exists on larger towns too', () => {
    for (const seed of SEEDS) {
      const plan = planStreetDecor(cityOf(seed, 300));
      expect(plan.solids.length).toBeLessThan(120);
      expect(plan.fountain).not.toBeNull();
    }
  });

  it('places solids clear of lanes, crossings, pedestrian lines, parking and other furniture', () => {
    for (const seed of SEEDS) {
      const layout = cityOf(seed);
      const plan = planStreetDecor(layout);
      const spots = computeParkingSpots(layout);
      for (const s of plan.solids) {
        const road = layout.roads.find((r) => r.id === s.roadId)!;
        const vertical = road.orientation === 'vertical';
        const centre = vertical ? road.start.x : road.start.z;
        const half = road.width / 2;
        const walkLine = half + road.sidewalkWidth / 2;
        for (const c of solidCorners(s)) {
          const lateral = Math.abs((vertical ? c.x : c.z) - centre);
          // Inside the sidewalk strip: behind the curb, in front of the building line.
          expect(lateral).toBeGreaterThanOrEqual(half + CURB_WIDTH);
          expect(lateral).toBeLessThanOrEqual(half + road.sidewalkWidth + 1e-6);
          // Not on the pedestrian walking line (bus signs and the like sit at the curb side of it).
          if (s.kind !== 'busSign') expect(Math.abs(lateral - walkLine)).toBeGreaterThanOrEqual(WALK_CLEARANCE - 1e-6);
          else expect(lateral).toBeLessThan(walkLine - WALK_CLEARANCE);
          // Not inside any crossing road's carriageway or sidewalk.
          const along = vertical ? c.z : c.x;
          for (const o of layout.roads) {
            if (o.orientation === road.orientation) continue;
            const ov = o.orientation === 'vertical' ? o.start.x : o.start.z;
            expect(Math.abs(along - ov)).toBeGreaterThan(o.width / 2 + o.sidewalkWidth);
          }
        }
        for (const cw of layout.crosswalks) {
          const dx = Math.abs(s.x - cw.center.x), dz = Math.abs(s.z - cw.center.z);
          const bound = Math.hypot(s.hx, s.hz);
          expect(dx > cw.width + bound || dz > cw.width + bound || Math.hypot(dx, dz) > 4 + bound).toBe(true);
        }
        for (const sp of spots) {
          // Parked cars are parallel to their road, so compare lateral extents (car half width) from the centre line.
          if (sp.roadId !== s.roadId || sp.side !== s.side) continue;
          const car = PARKED_SIZE[sp.variant];
          const spotLat = Math.abs((vertical ? sp.x : sp.z) - centre);
          for (const c of solidCorners(s)) {
            expect(Math.abs((vertical ? c.x : c.z) - centre) - spotLat).toBeGreaterThan(car.half);
          }
        }
        for (const lamp of layout.lamps) expect(rectCircleDistance(s, { ...lamp.position, r: 0 })).toBeGreaterThan(0.5);
        for (const t of layout.streetTrees) expect(rectCircleDistance(s, { ...t.position, r: 0 })).toBeGreaterThan(0.7);
        for (const b of layout.benches) expect(rectCircleDistance(s, { ...b.position, r: 0 })).toBeGreaterThan(0.9);
      }
      // Items do not overlap each other.
      for (let i = 0; i < plan.solids.length; i++) {
        for (let j = i + 1; j < plan.solids.length; j++) {
          const a = plan.solids[i], b = plan.solids[j];
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.3);
          for (const c of solidCorners(b)) expect(rectCircleDistance(a, { ...c, r: 0 })).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps solids away from the traffic lane polylines', () => {
    for (const seed of SEEDS) {
      const layout = cityOf(seed);
      const plan = planStreetDecor(layout);
      for (const s of plan.solids) {
        for (const path of layout.trafficPaths) {
          for (let k = 0; k + 1 < path.waypoints.length; k++) {
            const a = path.waypoints[k], b = path.waypoints[k + 1];
            // Lane polylines are axis aligned: distance from the solid's centre to the segment.
            const dx = Math.max(Math.min(a.x, b.x) - s.x, 0, s.x - Math.max(a.x, b.x));
            const dz = Math.max(Math.min(a.z, b.z) - s.z, 0, s.z - Math.max(a.z, b.z));
            expect(Math.hypot(dx, dz)).toBeGreaterThan(2);
          }
        }
      }
    }
  });

  it('keeps road decals between the lane markings and off each other', () => {
    for (const seed of SEEDS) {
      const layout = cityOf(seed);
      const plan = planStreetDecor(layout);
      const lines = (roadId: string) => {
        const r = layout.roads.find((x) => x.id === roadId)!;
        const edge = r.width / 2 - CURB_WIDTH - 0.35;
        const out = [-edge, edge, 0];
        if (r.streetClass === 'avenue') out.push(-0.12, 0.12);
        return { r, out };
      };
      for (const m of plan.manholes) {
        const { r, out } = lines(m.roadId);
        const vertical = r.orientation === 'vertical';
        const lat = (vertical ? m.x - r.start.x : m.z - r.start.z);
        for (const l of out) expect(Math.abs(lat - l)).toBeGreaterThan(0.4 + 0.08);
      }
      for (const p of plan.patches) {
        const { r, out } = lines(p.roadId);
        const vertical = r.orientation === 'vertical';
        const lo = (vertical ? p.minX - r.start.x : p.minZ - r.start.z);
        const hi = (vertical ? p.maxX - r.start.x : p.maxZ - r.start.z);
        for (const l of out) expect(l < lo - 0.06 || l > hi + 0.06).toBe(true);
      }
      // Decals on the same plane never overlap one another.
      const rects = [
        ...plan.patches.map((p) => ({ x0: p.minX, x1: p.maxX, z0: p.minZ, z1: p.maxZ })),
        ...plan.manholes.map((m) => ({ x0: m.x - 0.4, x1: m.x + 0.4, z0: m.z - 0.4, z1: m.z + 0.4 })),
      ];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], b = rects[j];
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
          expect(overlap).toBe(false);
        }
      }
      const tiles = plan.paving;
      for (let i = 0; i < tiles.length; i += 7) {
        for (let j = i + 1; j < tiles.length; j++) {
          const a = tiles[i], b = tiles[j];
          expect(a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ).toBe(false);
        }
      }
    }
  });

  it('puts the fountain in free courtyard space', () => {
    for (const seed of SEEDS) {
      const layout = cityOf(seed);
      const f = planStreetDecor(layout).fountain!;
      const inCourtyard = layout.blocks.some(
        (b) => b.courtyard && f.x - f.plazaRadius >= b.courtyard.minX && f.x + f.plazaRadius <= b.courtyard.maxX && f.z - f.plazaRadius >= b.courtyard.minZ && f.z + f.plazaRadius <= b.courtyard.maxZ,
      );
      expect(inCourtyard).toBe(true);
      for (const t of layout.streetTrees) {
        if (t.setting === 'courtyard') expect(Math.hypot(t.position.x - f.x, t.position.z - f.z)).toBeGreaterThan(f.plazaRadius);
      }
    }
  });
});

describe('street decor geometry', () => {
  it('adds at most 3 draw calls to the 6 of the base streetscape', () => {
    const s = createStreetscape(cityOf(1));
    let calls = 0;
    s.group.traverse((o) => {
      if (o instanceof THREE.Mesh) calls++;
    });
    expect(calls).toBeLessThanOrEqual(9);
    expect(calls).toBeGreaterThanOrEqual(7);
    expect(s.group.getObjectByName(MESH_NAMES.shelterGlass)).toBeDefined();
    s.dispose();
  });

  it('animates the water shimmer and dims it at night', () => {
    const s = createStreetscape(cityOf(1));
    const water = s.group.getObjectByName(MESH_NAMES.water) as THREE.Mesh;
    expect(water).toBeInstanceOf(THREE.Mesh);
    const mat = water.material as THREE.ShaderMaterial;
    expect(typeof water.onBeforeRender).toBe('function');
    water.onBeforeRender({} as never, {} as never, {} as never, {} as never, mat, {} as never);
    const t0 = mat.uniforms.uTime.value as number;
    expect(t0).toBeGreaterThan(0);
    const day = mat.uniforms.uBright.value as number;
    s.setNightAmount(1);
    expect(mat.uniforms.uBright.value as number).toBeLessThan(day);
    s.setNightAmount(0);
    expect(mat.uniforms.uBright.value as number).toBeCloseTo(day);
    s.dispose();
  });

  it('keeps the decor triangle count small', () => {
    const base = cityOf(1);
    const s = createStreetscape(base);
    let tris = 0;
    s.group.traverse((o) => {
      if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) {
        const g = o.geometry as THREE.BufferGeometry;
        tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
      }
    });
    // Streetscape total stays modest (measured well below this ceiling with decor included).
    expect(tris).toBeLessThan(260_000);
    s.dispose();
  });
});
