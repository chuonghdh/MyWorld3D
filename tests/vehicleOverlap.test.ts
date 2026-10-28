// Vehicles must not overlap parked cars, overlap each other only in rare jams (which are broken on purpose,
// see HELD_BACKUP_S in vehicles.ts), keep flowing, enter at the map border, split 60/20/20 at junctions and
// give way to pedestrians on the crosswalk. Footprints are the real model sizes (src/traffic/collision.ts).

import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { Pedestrians, VehicleSystem } from '../src/traffic';
import { VARIANT_FOOTPRINT, obbOverlap, type Obb } from '../src/traffic/collision';
import { PARKED_SIZE, computeParkingSpots } from '../src/traffic/parking';
import type { CityLayout } from '../src/city/layout';

const SLACK = 0.02;

function boxOf(x: number, z: number, heading: number, variant: number): Obb {
  const f = VARIANT_FOOTPRINT[variant];
  return { x, z, heading, halfLength: f.length / 2, halfWidth: f.width / 2 };
}

interface Report {
  movingPairs: number;
  parkedHits: number;
  samples: number;
  stoppedOnGreen: number;
}

function simulate(seed: number, trafficMultiplier: number, seconds: number): Report {
  const layout = generateCity({ ...DEFAULT_SETTINGS, seed });
  const sys = new VehicleSystem(layout, { trafficMultiplier, seed: seed * 3 + 1 });
  const parked = computeParkingSpots(layout).map((p) => ({ x: p.x, z: p.z, heading: p.heading, halfLength: PARKED_SIZE[p.variant].length / 2, halfWidth: PARKED_SIZE[p.variant].half }));
  const report: Report = { movingPairs: 0, parkedHits: 0, samples: 0, stoppedOnGreen: 0 };
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) {
    sys.update(0.1);
    if (i % 2) continue;
    const list = sys.getVehicles();
    report.samples += list.length;
    const boxes = list.map((v) => boxOf(v.position.x, v.position.z, v.heading, v.variant));
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        if (Math.abs(boxes[a].x - boxes[b].x) > 14 || Math.abs(boxes[a].z - boxes[b].z) > 14) continue;
        if (obbOverlap(boxes[a], boxes[b], SLACK)) report.movingPairs++;
      }
      for (const p of parked) {
        if (Math.abs(boxes[a].x - p.x) > 10 || Math.abs(boxes[a].z - p.z) > 10) continue;
        if (obbOverlap(boxes[a], p, SLACK)) report.parkedHits++;
      }
    }
  }
  return report;
}

describe('entering the map and turning', () => {
  it('vehicles come in from the map border, not out of the middle of a street', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed: 1 });
    const sys = new VehicleSystem(layout, { trafficMultiplier: 1.75, seed: 1 });
    const edge = Math.max(layout.townBounds.maxX, layout.townBounds.maxZ);
    const seen = new Set<number>();
    let firstSeen = 0;
    let inside = 0;
    for (let i = 0; i < 4000; i++) {
      sys.update(0.1);
      for (const v of sys.getVehicles()) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        firstSeen++;
        // The first time a vehicle is drawn it is at the border (outside vehicles are not drawn).
        if (Math.max(Math.abs(v.position.x), Math.abs(v.position.z)) < edge - 1) inside++;
      }
    }
    expect(firstSeen).toBeGreaterThan(100);
    expect(inside).toBe(0);
  }, 60_000);

  it('chooses straight / left / right at junctions in a 60 / 20 / 20 split and really turns', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed: 7 });
    const sys = new VehicleSystem(layout, { trafficMultiplier: 1.75, seed: 7 });
    const heading = new Map<number, number>();
    let turned = 0;
    for (let i = 0; i < 6000; i++) {
      sys.update(0.1);
      for (const v of sys.getVehicles()) {
        const h0 = heading.get(v.id);
        if (h0 === undefined) heading.set(v.id, v.heading);
        else if (Math.abs(Math.sin((v.heading - h0) / 2)) > 0.6) {
          turned++; // changed heading by more than about 74 degrees since first seen
          heading.set(v.id, v.heading);
        }
      }
    }
    const t = sys.turnStats;
    const total = t.straight + t.left + t.right;
    expect(total).toBeGreaterThan(500);
    expect(Math.abs(t.straight / total - 0.6)).toBeLessThan(0.05);
    expect(Math.abs(t.left / total - 0.2)).toBeLessThan(0.05);
    expect(Math.abs(t.right / total - 0.2)).toBeLessThan(0.05);
    expect(turned).toBeGreaterThan(50); // vehicles drive the curved connectors, they do not just count
  }, 120_000);
});

describe('traffic keeps flowing', () => {
  it('no vehicle stands still for minutes (no gridlock) with busy traffic and walkers', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed: 1 });
    const sys = new VehicleSystem(layout, { trafficMultiplier: 1.75, seed: 1 });
    const walkers = new Pedestrians(layout, { trafficMultiplier: 1.75, lights: sys.lights, timeOfDay: 12 });
    sys.setPedestrianSource(() => walkers.getPedestrians());
    const still = new Map<number, number>();
    let worst = 0;
    let seen = 0;
    for (let i = 0; i < 6000; i++) {
      sys.update(0.1);
      walkers.update(0.1, { timeOfDay: 12 });
      if (i % 10) continue;
      for (const v of sys.getVehicles()) {
        if (v.speed < 0.1) {
          const t = (still.get(v.id) ?? 0) + 1;
          still.set(v.id, t);
          worst = Math.max(worst, t);
        } else {
          still.set(v.id, 0);
        }
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(5000);
    expect(worst).toBeLessThan(100); // seconds: a red phase and a queue, never minutes
  }, 120_000);
});

describe('vehicle overlap', () => {
  it('never overlaps a parked car, and overlaps another moving vehicle only rarely (3 cities)', () => {
    for (const seed of [1, 7, 23]) {
      const r = simulate(seed, 1.75, 400);
      expect(r.samples).toBeGreaterThan(2000); // the traffic really ran
      expect(r.parkedHits).toBe(0);
      // A jam at a junction is broken by letting one vehicle push through (a short overlap): a tiny share only.
      expect(r.movingPairs / r.samples).toBeLessThan(0.005);
    }
  }, 120_000);

  it('keeps lanes on avenues clear of the parked cars at the kerb', () => {
    const layout = generateCity({ ...DEFAULT_SETTINGS });
    const spots = computeParkingSpots(layout);
    expect(spots.length).toBeGreaterThan(20);
    const roads = new Map(layout.roads.map((r) => [r.id, r]));
    for (const path of layout.trafficPaths) {
      const road = roads.get(path.roadId)!;
      if (road.streetClass !== 'avenue') continue;
      const lateral = Math.abs(road.orientation === 'vertical' ? path.waypoints[0].x - road.start.x : path.waypoints[0].z - road.start.z);
      // A bus (half width 1.25) plus its clearance must stay inside the innermost parked car edge.
      for (const s of spots.filter((p) => p.roadId === road.id)) {
        const axis = road.orientation === 'vertical' ? road.start.x : road.start.z;
        const parkedLat = Math.abs((road.orientation === 'vertical' ? s.x : s.z) - axis);
        const inner = parkedLat - PARKED_SIZE[s.variant].half - 0.1;
        expect(lateral + 1.25 + 0.15).toBeLessThanOrEqual(inner + 1e-6);
      }
    }
  });
});

/** A vertical street with one light at the origin and one crosswalk 5.5 m before it on the +Z path. */
function crosswalkLayout(): CityLayout {
  const timing = { cycleSeconds: 40, nsGreenSeconds: 16, ewGreenSeconds: 16, yellowSeconds: 2, allRedSeconds: 2 };
  return {
    seed: 1,
    townBounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    blocks: [],
    lots: [],
    streetTrees: [],
    roads: [
      { id: 'road-v-0', orientation: 'vertical', start: { x: 0, z: -100 }, end: { x: 0, z: 100 }, width: 8, lanes: 2, streetClass: 'street', sidewalkWidth: 3 },
    ],
    lamps: [],
    benches: [],
    crosswalks: [{ id: 'crosswalk-0', center: { x: 0, z: -5.5 }, orientation: 'horizontal', length: 8, width: 3 }],
    intersections: [{ id: 'intersection-0-0', center: { x: 0, z: 0 }, sizeX: 8, sizeZ: 8 }],
    trafficLights: [{ id: 'light-0', position: { x: 0, z: 0 }, timing }],
    trafficPaths: [
      { id: 'path-pos', roadId: 'road-v-0', direction: 1, lane: 0, waypoints: [{ x: 2, z: -100 }, { x: 2, z: 100 }], spawnPoints: [], trafficLightIds: ['light-0'] },
    ],
  } as unknown as CityLayout;
}

describe('pedestrians on the crosswalk', () => {
  it('a vehicle waits on green while a pedestrian is on the crosswalk, and goes once it clears', () => {
    const sys = new VehicleSystem(crosswalkLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    const peds = [{ position: { x: 1, z: -5.5 } }]; // on the crosswalk, in front of the car
    sys.setPedestrianSource(() => peds);
    sys.lights.setTime(0); // north-south green
    const id = sys.addVehicle('path-pos', 60, 'car') as number;
    for (let i = 0; i < 100; i++) sys.update(0.1); // 10 s, still green (0 to 16)
    const held = sys.getVehicleState(id)!;
    expect(held.speed).toBeCloseTo(0, 6);
    // Front bumper stays before the near edge of the crosswalk (z = -7).
    const frontZ = held.s - 100 + 4.5 / 2; // path z = s - 100
    expect(frontZ).toBeLessThanOrEqual(-7 + 1e-6);
    expect(frontZ).toBeGreaterThan(-8.5); // it did come up to the line

    peds.length = 0; // pedestrian has crossed
    sys.lights.setTime(1);
    for (let i = 0; i < 60; i++) sys.update(0.1);
    expect(sys.getVehicleState(id)!.s).toBeGreaterThan(110); // driving through
  });

  it('a vehicle with a part over the crosswalk keeps going even if a pedestrian steps out', () => {
    const sys = new VehicleSystem(crosswalkLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    const peds = [{ position: { x: 1, z: -5.5 } }];
    sys.setPedestrianSource(() => peds);
    sys.lights.setTime(0);
    // Centre at z = -6.5 (s = 93.5): front at z = -4.25, already over the crosswalk (it spans z -7 to -4).
    const id = sys.addVehicle('path-pos', 93.5, 'car') as number;
    expect(id).not.toBeNull();
    sys.update(2);
    expect(sys.getVehicleState(id)!.s).toBeGreaterThan(95);
  });
});
