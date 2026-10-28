import { describe, expect, it } from 'vitest';
import type { CityLayout, TrafficLightTiming } from '../src/city/layout';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { VehicleSystem, VEHICLE_SPECS, type VehicleRender } from '../src/traffic/vehicles';
import { VARIANTS } from '../src/traffic/vehicles/models';
import { VARIANT_COUNT, CLASS_VARIANTS } from '../src/traffic/vehicles/variants';
import { computeParkingSpots, PARKING_MIN_FROM_INTERSECTION, PARKING_ROAD_END_MARGIN, PARKED_SIZE } from '../src/traffic/parking';
import { createVehicleMeshes } from '../src/traffic/vehicleMeshes';

const TIMING: TrafficLightTiming = { cycleSeconds: 40, nsGreenSeconds: 18, ewGreenSeconds: 18, yellowSeconds: 2 };

function straightLayout(): CityLayout {
  return {
    seed: 1,
    townBounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    blocks: [], lots: [], streetTrees: [], lamps: [], benches: [], crosswalks: [], intersections: [],
    roads: [{ id: 'road-v-0', orientation: 'vertical', start: { x: 0, z: -100 }, end: { x: 0, z: 100 }, width: 8, lanes: 2, streetClass: 'street', sidewalkWidth: 3 }],
    trafficLights: [{ id: 'light-0', position: { x: 0, z: 0 }, timing: { ...TIMING } }],
    trafficPaths: [{ id: 'path-pos', roadId: 'road-v-0', direction: 1, lane: 0, waypoints: [{ x: 2, z: -100 }, { x: 2, z: 100 }], spawnPoints: [], trafficLightIds: ['light-0'] }],
  };
}

/** One path with a 90 degree turn in the middle and no lights. */
function cornerLayout(): CityLayout {
  const base = straightLayout();
  base.trafficLights = [];
  base.trafficPaths = [
    {
      id: 'path-turn', roadId: 'road-v-0', direction: 1, lane: 0,
      waypoints: [{ x: 0, z: -100 }, { x: 0, z: 0 }, { x: 100, z: 0 }],
      spawnPoints: [], trafficLightIds: [],
    },
  ];
  return base;
}

const city = generateCity(DEFAULT_SETTINGS);

describe('vehicle models', () => {
  it('has one model per variant, ids in order', () => {
    expect(VARIANTS).toHaveLength(VARIANT_COUNT);
    VARIANTS.forEach((v, i) => expect(v.id).toBe(i));
    for (const cls of ['car', 'bus', 'truck', 'motorbike'] as const) {
      expect(CLASS_VARIANTS[cls].length).toBeGreaterThan(0);
      const sum = CLASS_VARIANTS[cls].reduce((a, b) => a + b.weight, 0);
      expect(sum).toBeCloseTo(1, 6);
      for (const o of CLASS_VARIANTS[cls]) expect(VARIANTS[o.variant].cls).toBe(cls);
    }
  });

  it('builds every variant within 400-1200 triangles with valid attributes', () => {
    for (const v of VARIANTS) {
      const geo = v.build();
      const tris = geo.getAttribute('position').count / 3;
      expect(tris, v.name).toBeGreaterThanOrEqual(400);
      expect(tris, v.name).toBeLessThanOrEqual(1200);
      expect(geo.getAttribute('aPart').count).toBe(geo.getAttribute('position').count);
      for (const name of ['position', 'normal', 'color', 'aPart']) {
        const arr = geo.getAttribute(name).array as Float32Array;
        for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
      }
      geo.dispose();
    }
  });

  it('keeps each model in a plausible size envelope, front toward +Z', () => {
    const expected: Record<string, [number, number]> = { hatchback: [3.6, 4.2], sedan: [4.4, 5], suv: [4.3, 4.8], microvan: [4, 4.6], taxi: [4.4, 5], 'delivery-van': [5, 5.7], bus: [11.5, 12.5], truck: [8.5, 9.5], scooter: [1.6, 2.2] };
    for (const v of VARIANTS) {
      const geo = v.build();
      geo.computeBoundingBox();
      const b = geo.boundingBox!;
      const len = b.max.z - b.min.z;
      expect(len, v.name).toBeGreaterThanOrEqual(expected[v.name][0]);
      expect(len, v.name).toBeLessThanOrEqual(expected[v.name][1]);
      expect(b.min.y).toBeGreaterThanOrEqual(-0.001);
      expect(b.max.y).toBeLessThan(4);
      geo.dispose();
    }
  });
});

describe('createVehicleMeshes', () => {
  it('uses at most 12 draw calls and sizes capacity per variant', () => {
    const m = createVehicleMeshes(100, city);
    expect(m.variants).toHaveLength(VARIANT_COUNT);
    expect(m.group.children.length).toBeLessThanOrEqual(12);
    const parked = new Array(VARIANT_COUNT).fill(0);
    for (const p of m.parked) parked[p.variant]++;
    m.variants.forEach((mesh, i) => {
      expect(mesh.instanceMatrix.count).toBe(100 + parked[i]);
      expect(mesh.count).toBe(parked[i]);
    });
    m.dispose();
  });

  it('writes parked cars once and appends moving vehicles after them', () => {
    const m = createVehicleMeshes(50, city);
    const before = m.variants.map((v) => v.count);
    const sys = new VehicleSystem(city, { trafficMultiplier: 2, seed: 9 });
    for (let i = 0; i < 400; i++) sys.update(0.1);
    const list = sys.getVehicles();
    expect(list.length).toBeGreaterThan(0);
    m.update(list, { time: 1, night: false, season: 'summer' });
    let total = 0;
    m.variants.forEach((v, i) => {
      expect(v.count).toBeGreaterThanOrEqual(before[i]);
      total += v.count - before[i];
    });
    expect(total).toBe(list.length);
    // No NaN in matrices.
    for (const v of m.variants) {
      const a = v.instanceMatrix.array as Float32Array;
      for (let i = 0; i < v.count * 16; i++) expect(Number.isFinite(a[i])).toBe(true);
    }
    m.dispose();
  });

  it('setNight toggles the emissive uniform and the glow mesh', () => {
    const m = createVehicleMeshes(10);
    expect(m.uniforms.night.value).toBe(0);
    m.setNight(true);
    expect(m.uniforms.night.value).toBe(1);
    expect(m.glow.visible).toBe(true);
    m.setNight(false);
    expect(m.uniforms.night.value).toBe(0);
    expect(m.glow.visible).toBe(false);
    m.dispose();
  });

  it('draws headlight glow for every vehicle at night, however far from the camera, and none by day', () => {
    const m = createVehicleMeshes(300);
    const list: VehicleRender[] = [];
    for (let i = 0; i < 300; i++) {
      list.push({ id: i + 1, position: { x: i * 10, z: 0 }, heading: 0, cls: 'car', variant: 0, speed: 8, accel: -3, braking: true, indicator: 0, yawRate: 0, wheelPhase: 0, tint: 0.1 });
    }
    m.setFocus(0, 0); // vehicles up to 3 km away: no distance cut-off may switch their glow off
    m.update(list, { time: 0, night: false, season: 'summer' });
    expect(m.glow.count).toBe(0);
    m.setNight(true);
    m.update(list, { time: 0, night: true, season: 'summer' });
    // One headlight pool and one brake pool each (all braking), within the instance capacity.
    expect(m.glow.count).toBe(600);
    expect(m.glow.count).toBeLessThanOrEqual(m.glow.instanceMatrix.count);
    m.dispose();
  });
});

describe('parking', () => {
  const spots = computeParkingSpots(city);

  it('places at least 40 parked cars on the default city', () => {
    expect(spots.length).toBeGreaterThanOrEqual(40);
  });

  it('is deterministic and varies with the seed', () => {
    expect(computeParkingSpots(city)).toEqual(spots);
    expect(computeParkingSpots(city, { seed: 99 })).not.toEqual(spots);
  });

  it('mixes variants and colours', () => {
    expect(new Set(spots.map((s) => s.variant)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(spots.map((s) => Math.floor(s.tint * 10))).size).toBeGreaterThanOrEqual(5);
  });

  it('keeps 12 m from every intersection centre and road end, inside bounds', () => {
    const b = city.townBounds;
    for (const s of spots) {
      expect(s.x).toBeGreaterThan(b.minX);
      expect(s.x).toBeLessThan(b.maxX);
      expect(s.z).toBeGreaterThan(b.minZ);
      expect(s.z).toBeLessThan(b.maxZ);
      const road = city.roads.find((r) => r.id === s.roadId)!;
      const vertical = road.orientation === 'vertical';
      const along = vertical ? s.z : s.x;
      const a0 = vertical ? road.start.z : road.start.x;
      const a1 = vertical ? road.end.z : road.end.x;
      expect(along - Math.min(a0, a1)).toBeGreaterThanOrEqual(PARKING_ROAD_END_MARGIN);
      expect(Math.max(a0, a1) - along).toBeGreaterThanOrEqual(PARKING_ROAD_END_MARGIN);
      for (const it of city.intersections) {
        const d = Math.hypot(it.center.x - s.x, it.center.z - s.z);
        expect(d, `${s.roadId}`).toBeGreaterThanOrEqual(PARKING_MIN_FROM_INTERSECTION);
      }
    }
  });

  it('sits in the curb lane, on the correct side, facing the lane direction', () => {
    for (const s of spots) {
      const road = city.roads.find((r) => r.id === s.roadId)!;
      const vertical = road.orientation === 'vertical';
      const axis = vertical ? road.start.x : road.start.z;
      const lateral = (vertical ? s.x : s.z) - axis;
      expect(Math.sign(lateral)).toBe(s.side);
      const half = PARKED_SIZE[s.variant].half;
      expect(Math.abs(lateral) + half).toBeLessThanOrEqual(road.width / 2 + 1e-6); // inside the curb
      expect(Math.abs(lateral) - half).toBeGreaterThanOrEqual(road.width / 4 + 0.6); // clear of the driving lane centre
      // heading within ~0.12 rad of the lane direction
      const want = vertical ? (s.side === 1 ? 0 : Math.PI) : s.side === 1 ? Math.PI / 2 : -Math.PI / 2;
      let d = Math.abs(s.heading - want) % (Math.PI * 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      expect(d).toBeLessThan(0.12);
    }
  });

  it('does not overlap crosswalks, lamps or each other', () => {
    for (const s of spots) {
      const size = PARKED_SIZE[s.variant];
      for (const c of city.crosswalks) {
        const hx = c.orientation === 'horizontal' ? c.length / 2 : c.width / 2;
        const hz = c.orientation === 'horizontal' ? c.width / 2 : c.length / 2;
        const vertical = city.roads.find((r) => r.id === s.roadId)!.orientation === 'vertical';
        const sx = vertical ? size.half : size.length / 2;
        const sz = vertical ? size.length / 2 : size.half;
        const overlap = Math.abs(c.center.x - s.x) < hx + sx && Math.abs(c.center.z - s.z) < hz + sz;
        expect(overlap).toBe(false);
      }
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        if (spots[i].roadId !== spots[j].roadId || spots[i].side !== spots[j].side) continue;
        const d = Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z);
        const need = (PARKED_SIZE[spots[i].variant].length + PARKED_SIZE[spots[j].variant].length) / 2;
        expect(d).toBeGreaterThan(need);
      }
    }
  });
});

describe('VehicleSystem behaviour', () => {
  it('sets the braking flag when slowing for a red light and holds it while stopped', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(25);
    const id = sys.addVehicle('path-pos', 50, 'car') as number;
    let sawBraking = false;
    let brakingEarly = false;
    for (let i = 0; i < 60; i++) {
      sys.update(0.1);
      const v = sys.getVehicles().find((x) => x.id === id)!;
      if (v.braking) sawBraking = true;
      if (v.braking && i < 8) brakingEarly = true; // cruising far from the line
    }
    expect(sawBraking).toBe(true);
    expect(brakingEarly).toBe(false);
    const stopped = sys.getVehicles().find((x) => x.id === id)!;
    expect(stopped.speed).toBeLessThan(0.1);
    expect(stopped.braking).toBe(true);
    // Not braking while cruising on a clear green road.
    const sys2 = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys2.lights.setTime(0);
    const id2 = sys2.addVehicle('path-pos', 10, 'car') as number;
    for (let i = 0; i < 10; i++) sys2.update(0.1);
    expect(sys2.getVehicles().find((x) => x.id === id2)!.braking).toBe(false);
  });

  it('turns the heading smoothly through a corner with no jump per step', () => {
    const sys = new VehicleSystem(cornerLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    const id = sys.addVehicle('path-turn', 60, 'car') as number;
    let prev = sys.getVehicles().find((x) => x.id === id)!.heading;
    let maxStep = 0;
    let finalHeading = prev;
    let sawIndicator = false;
    for (let i = 0; i < 400; i++) {
      sys.update(1 / 60);
      const v = sys.getVehicles().find((x) => x.id === id);
      if (!v) break;
      let d = v.heading - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      maxStep = Math.max(maxStep, Math.abs(d));
      if (v.indicator !== 0) sawIndicator = true;
      prev = v.heading;
      finalHeading = v.heading;
    }
    expect(maxStep).toBeLessThan(0.06); // radians per 1/60 s step
    expect(finalHeading).toBeGreaterThan(1.3); // now heading +X (pi/2)
    expect(sawIndicator).toBe(true);
  });

  it('slows down for a corner', () => {
    const sys = new VehicleSystem(cornerLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    const id = sys.addVehicle('path-turn', 60, 'car') as number;
    let minSpeed = Infinity;
    for (let i = 0; i < 300; i++) {
      sys.update(0.05);
      const s = sys.getVehicleState(id);
      if (!s) break;
      minSpeed = Math.min(minSpeed, s.speed);
    }
    expect(minSpeed).toBeLessThan(VEHICLE_SPECS.car.cruiseSpeed * 0.8);
  });

  it('varies cruise speed per vehicle and assigns valid variants', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 3, seed: 21 });
    const speeds = new Set<number>();
    const variants = new Set<number>();
    for (let i = 0; i < 1200; i++) {
      sys.update(0.1);
      if (i % 20 === 0) {
        for (const v of sys.getVehicles()) {
          variants.add(v.variant);
          expect(v.variant).toBeGreaterThanOrEqual(0);
          expect(v.variant).toBeLessThan(VARIANT_COUNT);
          expect(VARIANTS[v.variant].cls).toBe(v.cls);
          if (v.cls === 'car' && v.speed > 5) speeds.add(Math.round(v.speed * 2));
        }
      }
    }
    expect(speeds.size).toBeGreaterThan(3);
    expect(variants.size).toBeGreaterThanOrEqual(5);
  });

  it('keeps per-class counts bounded and values finite', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 4 });
    let max = 0;
    for (let i = 0; i < 700; i++) {
      sys.update(0.1);
      max = Math.max(max, sys.count);
      for (const v of sys.getVehicles()) {
        for (const n of [v.position.x, v.position.z, v.heading, v.speed, v.accel, v.yawRate, v.wheelPhase, v.tint]) {
          expect(Number.isFinite(n)).toBe(true);
        }
      }
    }
    expect(max).toBeLessThanOrEqual(sys.capacity);
    expect(max).toBeGreaterThan(5);
  });

  it('wheel phase grows with distance driven', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(0);
    const id = sys.addVehicle('path-pos', 10, 'car') as number;
    sys.update(1);
    const a = sys.getVehicles().find((x) => x.id === id)!.wheelPhase;
    sys.update(1);
    const b = sys.getVehicles().find((x) => x.id === id)!.wheelPhase;
    expect(b).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(5);
  });

  it('returns the same array and records every call (no per-frame allocation)', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 2, seed: 8 });
    for (let i = 0; i < 300; i++) sys.update(0.1);
    const a = sys.getVehicles();
    const first = a[0];
    sys.update(0.1);
    const b = sys.getVehicles();
    expect(b).toBe(a);
    expect(b[0]).toBe(first);
    expect(b[0].position).toBe(first.position);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const sys = new VehicleSystem(city, { trafficMultiplier: 2, seed: 13 });
      for (let i = 0; i < 400; i++) sys.update(0.1);
      return sys.getVehicles().map((v) => [v.id, v.position.x, v.position.z, v.variant, v.tint]);
    };
    expect(run()).toEqual(run());
  });
});
