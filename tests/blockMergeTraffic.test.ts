// Traffic on a town with merged blocks (block merge phase 3). A 2x2 merge (block-2-2..3-3, at the north-east
// corner) and a 1x3 merge (block-1-0..1-2) remove four street pieces. Junctions on the merged blocks' boundaries keep
// only their real arms: T junctions (3 arms) keep the signal with turns over the existing moves, 2-arm junctions
// lose the signal. Vehicles, parked cars and pedestrians never use the removed streets.

import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import type { CityLayout, RoadSegment } from '../src/city/layout';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { TrafficLightController } from '../src/traffic/lights';
import { VehicleSystem } from '../src/traffic/vehicles';
import { Pedestrians } from '../src/traffic/pedestrians';
import { computeParkingSpots } from '../src/traffic/parking';

const MERGES = [
  ['block-2-2', 'block-3-2', 'block-2-3', 'block-3-3'],
  ['block-1-0', 'block-1-1', 'block-1-2'],
];
const base = generateCity(DEFAULT_SETTINGS);
const merged = generateCity({ ...DEFAULT_SETTINGS, blockMerges: MERGES });

interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The removed street pieces (carriageway and sidewalks) of every merge, between the sidewalks of the streets that
 * remain. Shrunk by 2.5 m at both ends: the merged block's new frontage there carries doors that walkers enter.
 */
function removedStreets(layout: CityLayout): Rect[] {
  const line = (id: string): RoadSegment => base.roads.find((r) => r.id === id)!;
  const pad = (r: RoadSegment): number => r.width / 2 + r.sidewalkWidth;
  const out: Rect[] = [];
  for (const m of layout.merges ?? []) {
    const [c0, r0, c1, r1] = m.id.split('-').slice(1).map(Number);
    const south = line(`road-h-${r0}`);
    const north = line(`road-h-${r1 + 1}`);
    const west = line(`road-v-${c0}`);
    const east = line(`road-v-${c1 + 1}`);
    for (let i = c0 + 1; i <= c1; i++) {
      const r = line(`road-v-${i}`);
      out.push({ minX: r.start.x - pad(r), maxX: r.start.x + pad(r), minZ: south.start.z + pad(south) + 2.5, maxZ: north.start.z - pad(north) - 2.5 });
    }
    for (let j = r0 + 1; j <= r1; j++) {
      const r = line(`road-h-${j}`);
      out.push({ minX: west.start.x + pad(west) + 2.5, maxX: east.start.x - pad(east) - 2.5, minZ: r.start.z - pad(r), maxZ: r.start.z + pad(r) });
    }
  }
  return out;
}

const removed = removedStreets(merged);
const inRemoved = (x: number, z: number): boolean => removed.some((s) => x > s.minX + 0.2 && x < s.maxX - 0.2 && z > s.minZ + 0.2 && z < s.maxZ - 0.2);
function onAsphaltOffCrosswalk(x: number, z: number): boolean {
  for (const r of merged.roads) {
    const hw = r.width / 2 - 0.05;
    const inside =
      r.orientation === 'vertical'
        ? Math.abs(x - r.start.x) < hw && z > Math.min(r.start.z, r.end.z) && z < Math.max(r.start.z, r.end.z)
        : Math.abs(z - r.start.z) < hw && x > Math.min(r.start.x, r.end.x) && x < Math.max(r.start.x, r.end.x);
    if (!inside) continue;
    const onCrosswalk = merged.crosswalks.some((c) => {
      const alongX = c.orientation === 'horizontal';
      const hx = alongX ? c.length / 2 : c.width / 2;
      const hz = alongX ? c.width / 2 : c.length / 2;
      return Math.abs(x - c.center.x) <= hx + 0.1 && Math.abs(z - c.center.z) <= hz + 0.1;
    });
    if (!onCrosswalk) return true;
  }
  return false;
}
const junctionIndex = (layout: CityLayout, id: string): number => layout.intersections.findIndex((it) => it.id === id);

describe('block merges: junction arms and signals', () => {
  it('both merges are in force and remove four street pieces', () => {
    expect(new Set(merged.merges?.map((m) => m.id))).toEqual(new Set(['merged-2-2-3-3', 'merged-1-0-1-2']));
    expect(removed).toHaveLength(4); // the 2x2 cuts one line each way, the 1x3 cuts two horizontal lines
  });

  it('counts 4 arms at every junction without merges', () => {
    const veh = new VehicleSystem(base, { trafficMultiplier: 1, seed: 1 });
    for (let j = 0; j < base.intersections.length; j++) expect(veh.junctionArms(j)).toBe(4);
  });

  it('turns boundary junctions into T junctions (3 arms) and straight roads (2 arms)', () => {
    const veh = new VehicleSystem(merged, { trafficMultiplier: 1, seed: 1 });
    const arms = (id: string): number => veh.junctionArms(junctionIndex(merged, id));
    for (const t of ['intersection-1-1', 'intersection-2-1', 'intersection-1-2', 'intersection-2-2', 'intersection-2-3', 'intersection-3-2']) {
      expect(arms(t)).toBe(3);
    }
    expect(arms('intersection-3-4')).toBe(2); // only east and west remain
    expect(arms('intersection-4-3')).toBe(2); // only north and south remain
    expect(arms('intersection-0-0')).toBe(4);
    expect(junctionIndex(merged, 'intersection-3-3')).toBe(-1); // inside the 2x2: removed
  });

  it('drops the signal at 2-arm junctions and keeps it at T junctions', () => {
    const withMerge = new VehicleSystem(merged, { trafficMultiplier: 1, seed: 1 });
    const without = new VehicleSystem(base, { trafficMultiplier: 1, seed: 1 });
    expect(without.stopLineFor('path-road-h-4-pos', 'light-3-4')).not.toBeNull();
    expect(withMerge.stopLineFor('path-road-h-4-pos', 'light-3-4')).toBeNull();
    expect(withMerge.stopLineFor('path-road-v-4-pos', 'light-4-3')).toBeNull();
    expect(withMerge.stopLineFor('path-road-v-2-pos', 'light-2-2')).not.toBeNull(); // T junction keeps its signal
  });

  it('renormalises the 60/20/20 split at a T junction: about 75 percent straight on the through road', () => {
    const veh = new VehicleSystem(merged, { trafficMultiplier: 2, seed: 4 });
    const internal = veh as unknown as {
      decideAmongAllowed: (pm: unknown, v: { plan: number }, j: number, roll: number, straightOk: boolean) => void;
    };
    const original = internal.decideAmongAllowed.bind(veh);
    let through = 0;
    let straight = 0;
    let stem = 0;
    let stemStraight = 0;
    internal.decideAmongAllowed = (pm, v, j, roll, straightOk) => {
      original(pm, v, j, roll, straightOk);
      if (straightOk) {
        through++;
        if (v.plan < 0) straight++;
      } else {
        stem++;
        if (v.plan < 0) stemStraight++;
      }
    };
    for (let i = 0; i < 6000; i++) veh.update(0.1);
    expect(through).toBeGreaterThan(200);
    // Through roads at a T have straight and one turn: 0.6 / (0.6 + 0.2) = 0.75. At a 2-arm straight junction there
    // is no turn at all, which pushes the share a little up.
    expect(straight / through).toBeGreaterThan(0.68);
    expect(straight / through).toBeLessThan(0.9);
    // A lane that ends at a closed junction always turns.
    expect(stem).toBeGreaterThan(20);
    expect(stemStraight).toBe(0);
  }, 60000);
});

describe('block merges: nothing on the removed streets', () => {
  it('spawns no vehicle on a closed lane start and never runs a vehicle past a closed lane end', () => {
    const veh = new VehicleSystem(merged, { trafficMultiplier: 2, seed: 9 });
    const models = (veh as unknown as { models: { conn: unknown; startOpen: boolean; endOpen: boolean; spawns: unknown[]; length: number; list: { s: number }[] }[] }).models;
    const closed = models.filter((m) => !m.conn && !m.endOpen);
    expect(closed.length).toBe(6);
    expect(models.filter((m) => !m.conn && !m.startOpen && m.spawns.length > 0)).toHaveLength(0);
    let overEnd = 0;
    for (let i = 0; i < 3000; i++) {
      veh.update(0.1);
      for (const m of closed) for (const v of m.list) if (v.s > m.length - 0.5) overEnd++;
    }
    expect(overEnd).toBe(0);
  }, 60000);

  it('parks no car on a removed street piece', () => {
    const spots = computeParkingSpots(merged);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.filter((s) => inRemoved(s.x, s.z))).toEqual([]);
  });

  it(
    'keeps vehicles and pedestrians off the removed streets and keeps traffic moving for 20 minutes (no gridlock)',
    () => {
      const lights = new TrafficLightController(merged.trafficLights);
      const veh = new VehicleSystem(merged, { trafficMultiplier: 1.5, seed: 3, lights });
      const peds = new Pedestrians(merged, { trafficMultiplier: 1.75, seed: 3, lights, timeOfDay: 12 });
      veh.setPedestrianSource(() => peds.getPedestrians());
      const bad: string[] = [];
      const movingPerMinute: number[] = [];
      let speedSum = 0;
      let samples = 0;
      for (let i = 0; i < 12000; i++) {
        veh.update(0.1);
        peds.update(0.1, { timeOfDay: 12, rain: 0 });
        if (i % 10 !== 0) continue;
        const t = (i / 10).toFixed(0);
        for (const v of veh.getVehicles()) {
          speedSum += v.speed;
          samples++;
          if (inRemoved(v.position.x, v.position.z)) bad.push(`t=${t} vehicle ${v.id} at ${v.position.x.toFixed(1)},${v.position.z.toFixed(1)}`);
        }
        for (const p of peds.getPedestrians()) {
          if (inRemoved(p.position.x, p.position.z)) bad.push(`t=${t} walker ${p.id} at ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)}`);
          if (p.dog && inRemoved(p.dog.position.x, p.dog.position.z)) bad.push(`t=${t} dog of walker ${p.id}`);
          // On the streets that remain, walkers and dogs only stand on asphalt on a crosswalk.
          if (onAsphaltOffCrosswalk(p.position.x, p.position.z)) bad.push(`t=${t} walker ${p.id} on asphalt at ${p.position.x.toFixed(1)},${p.position.z.toFixed(1)}`);
          if (p.dog && onAsphaltOffCrosswalk(p.dog.position.x, p.dog.position.z)) bad.push(`t=${t} dog of walker ${p.id} on asphalt`);
        }
        if (i % 600 === 0 && i >= 600) movingPerMinute.push(veh.getVehicles().filter((v) => v.speed > 0.5).length);
      }
      expect(bad.slice(0, 5)).toEqual([]);
      expect(veh.count).toBeGreaterThan(30);
      expect(speedSum / samples).toBeGreaterThan(1.5);
      // Every minute, vehicles are on the move.
      expect(Math.min(...movingPerMinute)).toBeGreaterThan(2);
    },
    120000,
  );
});
