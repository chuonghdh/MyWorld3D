// Determinism and allocation-hygiene guards for the per-frame traffic path (Round 3 task 3.3).
// The expected hashes were captured from the code BEFORE the allocation clean-up, so a refactor that
// changes simulation or instance-buffer output by even one bit fails here.

import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { TrafficLightController } from '../src/traffic/lights';
import { VehicleSystem } from '../src/traffic/vehicles';
import { Pedestrians } from '../src/traffic/pedestrians';
import { createVehicleMeshes } from '../src/traffic/vehicleMeshes';
import { createPeopleMeshes } from '../src/traffic/people/peopleMeshes';

const city = generateCity({ ...DEFAULT_SETTINGS, seed: 4242 });
const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

class Hasher {
  h = 2166136261 >>> 0;
  num(v: number): void {
    f32[0] = v;
    this.h = Math.imul(this.h ^ u32[0], 16777619) >>> 0;
  }
  arr(a: ArrayLike<number>, n: number): void {
    for (let i = 0; i < n; i++) this.num(a[i]);
  }
  get hex(): string {
    return this.h.toString(16);
  }
}

// A fixed, irregular dt sequence (includes a long frame that gets split into sub-steps).
function dtAt(i: number): number {
  return [0.016, 0.017, 0.033, 0.05, 0.016, 0.1, 0.021][i % 7];
}

const STEPS = 900;

function vehicleRun(): string {
  const sys = new VehicleSystem(city, { trafficMultiplier: 1.5, seed: 77 });
  const meshes = createVehicleMeshes(256, city);
  meshes.setNight(true);
  const h = new Hasher();
  for (let i = 0; i < STEPS; i++) {
    sys.update(dtAt(i));
    const list = sys.getVehicles();
    meshes.update(list, { time: i * 0.02, night: true, season: 'summer' });
    if (i % 5 === 0) {
      h.num(list.length);
      for (const v of list) {
        h.num(v.id);
        h.num(v.position.x);
        h.num(v.position.z);
        h.num(v.heading);
        h.num(v.speed);
        h.num(v.accel);
        h.num(v.yawRate);
        h.num(v.wheelPhase);
        h.num(v.tint);
        h.num(v.variant);
        h.num(v.braking ? 1 : 0);
        h.num(v.indicator);
      }
    }
  }
  for (const m of meshes.variants) {
    h.num(m.count);
    h.arr(m.instanceMatrix.array, m.count * 16);
    h.arr(m.instanceColor!.array, m.count * 3);
  }
  h.num(meshes.glow.count);
  h.arr(meshes.glow.instanceMatrix.array, meshes.glow.count * 16);
  meshes.dispose();
  return h.hex;
}

function pedestrianRun(): string {
  const lights = new TrafficLightController(city.trafficLights);
  const peds = new Pedestrians(city, { trafficMultiplier: 1.5, seed: 5, lights, timeOfDay: 8 });
  const meshes = createPeopleMeshes(512, 256);
  const h = new Hasher();
  for (let i = 0; i < STEPS; i++) {
    const hour = 8 + (i / STEPS) * 6;
    lights.update(dtAt(i));
    peds.update(dtAt(i), { timeOfDay: hour, rain: i > 450 ? 0.6 : 0 });
    const list = peds.getPedestrians();
    meshes.update(list, { time: i * 0.02, night: false, season: 'autumn', rain: i > 450 ? 0.6 : 0 });
    if (i % 5 === 0) {
      h.num(list.length);
      for (const p of list) {
        h.num(p.id);
        h.num(p.position.x);
        h.num(p.position.z);
        h.num(p.y);
        h.num(p.heading);
        h.num(p.pose);
        h.num(p.speed);
        h.num(p.scale);
        if (p.dog) {
          h.num(p.dog.position.x);
          h.num(p.dog.position.z);
          h.num(p.dog.heading);
          h.num(p.dog.leashHand.x);
          h.num(p.dog.leashHand.z);
        }
      }
    }
  }
  for (const m of meshes.bodies) {
    h.num(m.count);
    h.arr(m.instanceMatrix.array, m.count * 16);
  }
  h.num(meshes.dogs.count);
  h.arr(meshes.dogs.instanceMatrix.array, meshes.dogs.count * 16);
  h.num(meshes.umbrellas.count);
  h.arr(meshes.umbrellas.instanceMatrix.array, meshes.umbrellas.count * 16);
  h.arr(meshes.umbrellas.instanceColor!.array, meshes.umbrellas.count * 3);
  meshes.dispose();
  return h.hex;
}

// Captured from the pre-change implementation.
// Re-captured when the signal rules changed (stop at the crosswalk line, queueing, commit past it,
// yield to pedestrians and cross traffic, junction right of way, turns, edge spawns).
const EXPECTED_VEHICLES = 'b0d22ec1';
// Re-captured when the signals gained an all-red gap (pedestrians read the same timing).
// Re-captured for the people overhaul (intentional): four age groups with teens, sexes, hair styles, garments,
// age and sex speeds, child gait wobble, dogs kept off the road, dresses at about 5 percent, patterned tops,
// children in pairs at the child's pace (the adult walks at it), 90 percent of women with long hair, 70 percent
// patterned tops in six patterns, and no dresses or ao dai (their random draws were removed; coat tails replaced
// the dress shape).
// Re-captured 2026-11-06 for the child gait change (commit d47180a): child stride cycle, swing ease, knee, arm and bob
// multipliers and the 5 percent gait wobble (config trafficLife.child*). Checked: with those child knobs reset to the
// previous values the hash is still a8684131, so adults, teens, elders, dogs and umbrellas are unchanged.
const EXPECTED_PEDESTRIANS = '63333cfb';
// Previous: 'a8684131', re-captured when walker density followed the shared 11:00/19:00 traffic curve (trafficDensity.ts)

describe('traffic determinism (baseline captured before allocation clean-up)', () => {
  it('vehicle simulation and instance buffers are bit-identical for a seed and dt sequence', () => {
    const a = vehicleRun();
    expect(vehicleRun()).toBe(a);
    expect(a).toBe(EXPECTED_VEHICLES);
  });

  it('pedestrian simulation and instance buffers are bit-identical for a seed and dt sequence', () => {
    const a = pedestrianRun();
    expect(pedestrianRun()).toBe(a);
    expect(a).toBe(EXPECTED_PEDESTRIANS);
  });
});

describe('traffic allocation hygiene', () => {
  it('getVehicles returns the same array and the same record objects across calls', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 2, seed: 9 });
    for (let i = 0; i < 400; i++) sys.update(0.05);
    const a = sys.getVehicles();
    expect(a.length).toBeGreaterThan(0);
    const first = a[0];
    const snapshot = a.slice();
    sys.update(0.05);
    const b = sys.getVehicles();
    expect(b).toBe(a);
    // Records are pooled by index: the same objects come back in the same slots.
    for (let i = 0; i < Math.min(snapshot.length, b.length); i++) expect(b[i]).toBe(snapshot[i]);
    expect(b[0]).toBe(first);
  });

  it('getPedestrians returns the same array, records, positions and dogs across calls', () => {
    const peds = new Pedestrians(city, { trafficMultiplier: 2, seed: 9 });
    for (let i = 0; i < 100; i++) peds.update(0.05, { timeOfDay: 12 });
    const a = peds.getPedestrians();
    expect(a.length).toBeGreaterThan(0);
    const snapshot = a.slice();
    const pos = snapshot.map((p) => p.position);
    const dogs = snapshot.map((p) => p.dog);
    peds.update(0.05, { timeOfDay: 12 });
    const b = peds.getPedestrians();
    expect(b).toBe(a);
    const n = Math.min(snapshot.length, b.length);
    for (let i = 0; i < n; i++) {
      if (b[i] === snapshot[i]) {
        expect(b[i].position).toBe(pos[i]);
        if (dogs[i]) expect(b[i].dog).toBe(dogs[i]);
      }
    }
    // The same record keeps the same id (slot) between calls.
    const again = peds.getPedestrians();
    expect(again).toBe(a);
  });

  it('mesh update does not replace instance buffers or attributes', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 3 });
    const meshes = createVehicleMeshes(128, city);
    const people = createPeopleMeshes(128, 64);
    const peds = new Pedestrians(city, { trafficMultiplier: 1, seed: 3 });
    const ctx = { time: 0, night: false, season: 'summer' as const };
    for (let i = 0; i < 50; i++) {
      sys.update(0.05);
      peds.update(0.05, { timeOfDay: 12 });
      meshes.update(sys.getVehicles(), ctx);
      people.update(peds.getPedestrians(), ctx);
    }
    const mArr = meshes.variants.map((m) => m.instanceMatrix.array);
    const pArr = people.bodies.map((m) => m.instanceMatrix.array);
    const aGait = people.bodies.map((m) => m.geometry.getAttribute('aGait'));
    for (let i = 0; i < 50; i++) {
      sys.update(0.05);
      peds.update(0.05, { timeOfDay: 12 });
      meshes.update(sys.getVehicles(), ctx);
      people.update(peds.getPedestrians(), ctx);
    }
    meshes.variants.forEach((m, i) => expect(m.instanceMatrix.array).toBe(mArr[i]));
    people.bodies.forEach((m, i) => {
      expect(m.instanceMatrix.array).toBe(pArr[i]);
      expect(m.geometry.getAttribute('aGait')).toBe(aGait[i]);
    });
  });
});
