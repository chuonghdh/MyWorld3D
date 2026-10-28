import { describe, expect, it } from 'vitest';
import type { CityLayout, TrafficLightTiming } from '../src/city/layout';
import type { WorldSettings } from '../src/core/types';
import { generateCity } from '../src/city';
import { TrafficLightController, lightStateAt } from '../src/traffic/lights';
import { VehicleSystem } from '../src/traffic/vehicles';
import { Pedestrians } from '../src/traffic/pedestrians';

const TIMING: TrafficLightTiming = {
  cycleSeconds: 40,
  nsGreenSeconds: 18,
  ewGreenSeconds: 18,
  yellowSeconds: 2,
};

/** One north-south road along Z with a single light at the origin. The path runs 200 m, stop line at z = -5. */
function straightLayout(spawnPoints: { x: number; z: number }[] = []): CityLayout {
  return {
    seed: 1,
    townBounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
    blocks: [],
    lots: [],
    streetTrees: [],
    roads: [
      {
        id: 'road-v-0',
        orientation: 'vertical',
        start: { x: 0, z: -100 },
        end: { x: 0, z: 100 },
        width: 8,
        lanes: 2,
        streetClass: 'street',
        sidewalkWidth: 3,
      },
    ],
    lamps: [],
    benches: [],
    crosswalks: [],
    intersections: [],
    trafficLights: [{ id: 'light-0', position: { x: 0, z: 0 }, timing: { ...TIMING } }],
    trafficPaths: [
      {
        id: 'path-pos',
        roadId: 'road-v-0',
        direction: 1,
        lane: 0,
        waypoints: [
          { x: 2, z: -100 },
          { x: 2, z: 100 },
        ],
        spawnPoints,
        trafficLightIds: ['light-0'],
      },
    ],
  };
}

function settings(overrides: Partial<WorldSettings> = {}): WorldSettings {
  return {
    seed: 4242,
    timeOfDay: 12,
    season: 'summer',
    windSpeed: 2,
    windDirection: 0,
    townWidth: 400,
    townDepth: 400,
    trafficMultiplier: 1,
    streetTreeMultiplier: 1,
    leafAmount: 0.5,
    leafSize: 1,
    soundEnabled: false,
    ...overrides,
  };
}

describe('lightStateAt', () => {
  it('cycles north-south green, yellow, red and back within the cycle', () => {
    expect(lightStateAt(TIMING, 0, 'ns')).toBe('green');
    expect(lightStateAt(TIMING, 17.9, 'ns')).toBe('green');
    expect(lightStateAt(TIMING, 18.5, 'ns')).toBe('yellow');
    expect(lightStateAt(TIMING, 25, 'ns')).toBe('red');
    expect(lightStateAt(TIMING, 39.9, 'ns')).toBe('red');
    expect(lightStateAt(TIMING, 40, 'ns')).toBe('green');
    expect(lightStateAt(TIMING, 40 + 18.5, 'ns')).toBe('yellow');
  });

  it('gives east-west its turn after north-south yellow', () => {
    expect(lightStateAt(TIMING, 5, 'ew')).toBe('red');
    expect(lightStateAt(TIMING, 20, 'ew')).toBe('green');
    expect(lightStateAt(TIMING, 38.5, 'ew')).toBe('yellow');
    expect(lightStateAt(TIMING, 39.5, 'ew')).toBe('yellow');
  });

  it('wraps negative time into the cycle', () => {
    expect(lightStateAt(TIMING, -1, 'ns')).toBe(lightStateAt(TIMING, 39, 'ns'));
  });

  it('controller reports phases for each light by id', () => {
    const ctl = new TrafficLightController([{ id: 'a', position: { x: 0, z: 0 }, timing: TIMING }], 25);
    expect(ctl.phaseOf('a', 'ns')).toBe('red');
    ctl.update(15);
    expect(ctl.phaseOf('a', 'ns')).toBe('green');
    expect(ctl.phaseOf('missing', 'ns')).toBe('green');
  });
});

describe('VehicleSystem', () => {
  it('stops a vehicle before the stop line on red and never passes it', () => {
    const layout = straightLayout();
    const sys = new VehicleSystem(layout, { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(25); // north-south red from 20 to 40
    const id = sys.addVehicle('path-pos', 50, 'car');
    expect(id).not.toBeNull();

    const stopZ = -5; // light at z = 0, stop line 5 m before it
    let maxZ = -Infinity;
    for (let i = 0; i < 100; i++) {
      sys.update(0.1); // 10 s, still red (time 25 to 35)
      const v = sys.getVehicles().find((x) => x.id === id);
      if (v) maxZ = Math.max(maxZ, v.position.z);
    }
    expect(maxZ).toBeLessThanOrEqual(stopZ + 1e-9);

    const state = sys.getVehicleState(id as number);
    expect(state).not.toBeNull();
    expect(state!.s).toBeLessThanOrEqual(95 + 1e-9);
    expect(state!.s).toBeGreaterThan(90);
    expect(state!.speed).toBeCloseTo(0, 6);
  });

  it('on yellow, a vehicle fully behind the line stops with its front before the line', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(18.2); // north-south yellow from 18 to 20, then red
    const id = sys.addVehicle('path-pos', 70, 'car') as number;
    sys.update(12);
    const st = sys.getVehicleState(id)!;
    expect(st.speed).toBeCloseTo(0, 6);
    expect(st.s + 4.5 / 2).toBeLessThanOrEqual(95 + 1e-6); // front bumper before the line at s = 95
    expect(st.s + 4.5 / 2).toBeGreaterThan(93);
  });

  it('on yellow or red, a vehicle that already has a part past the line keeps going', () => {
    for (const t of [18.5, 25]) {
      const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
      sys.lights.setTime(t);
      const id = sys.addVehicle('path-pos', 94, 'car') as number; // front at 96.25, past the line
      sys.update(3);
      expect(sys.getVehicleState(id)!.s).toBeGreaterThan(100);
    }
  });

  it('queues behind a stopped leader instead of running up to the line', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(18.2);
    const leader = sys.addVehicle('path-pos', 80, 'car') as number;
    const follower = sys.addVehicle('path-pos', 55, 'car') as number;
    sys.update(15); // light time 18.2 to 33.2: yellow, then red until 40
    const l = sys.getVehicleState(leader)!;
    const f = sys.getVehicleState(follower)!;
    expect(l.speed).toBeCloseTo(0, 6);
    expect(f.speed).toBeCloseTo(0, 6);
    expect(l.s + 4.5 / 2).toBeLessThanOrEqual(95 + 1e-6);
    expect(l.s - f.s).toBeGreaterThanOrEqual((4.5 + 4.5) / 2 + 6 - 1e-6);
  });

  it('lets a stopped vehicle go once the light turns green', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(25);
    const id = sys.addVehicle('path-pos', 50, 'car') as number;
    sys.update(10);
    expect(sys.getVehicleState(id)!.s).toBeLessThanOrEqual(95 + 1e-9);

    sys.lights.setTime(0); // north-south green
    sys.update(10);
    expect(sys.getVehicleState(id)!.s).toBeGreaterThan(95);
  });

  it('keeps the following distance behind a stopped leader', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(25);
    const leader = sys.addVehicle('path-pos', 80, 'car') as number;
    const follower = sys.addVehicle('path-pos', 60, 'car') as number;
    sys.update(15);
    const gap = sys.getVehicleState(leader)!.s - sys.getVehicleState(follower)!.s;
    expect(gap).toBeGreaterThanOrEqual((4.5 + 4.5) / 2 + 6 - 1e-6);
  });

  it('removes vehicles that reach the end of their path', () => {
    const sys = new VehicleSystem(straightLayout(), { trafficMultiplier: 4, seed: 3, edgeExtension: 0 });
    sys.lights.setTime(0);
    sys.addVehicle('path-pos', 185, 'car');
    expect(sys.count).toBe(1);
    for (let i = 0; i < 100; i++) sys.update(0.1); // 10 s at 11 m/s covers far more than 15 m
    expect(sys.count).toBe(0);
    expect(sys.getVehicles()).toHaveLength(0);
  });

  it('bounds the vehicle count by trafficMultiplier', () => {
    const layout = generateCity(settings({ trafficMultiplier: 1 }));
    const low = new VehicleSystem(layout, { trafficMultiplier: 0.5, seed: 11 });
    const high = new VehicleSystem(layout, { trafficMultiplier: 3, seed: 11 });
    expect(low.capacity).toBeLessThan(high.capacity);

    let lowMax = 0;
    let highMax = 0;
    for (let i = 0; i < 600; i++) {
      low.update(0.1);
      high.update(0.1);
      lowMax = Math.max(lowMax, low.count);
      highMax = Math.max(highMax, high.count);
    }
    expect(lowMax).toBeLessThanOrEqual(low.capacity);
    expect(highMax).toBeLessThanOrEqual(high.capacity);
    expect(highMax).toBeGreaterThan(0);

    const none = new VehicleSystem(layout, { trafficMultiplier: 0, seed: 11 });
    for (let i = 0; i < 100; i++) none.update(0.1);
    expect(none.count).toBe(0);
  });
});

describe('Pedestrians', () => {
  it('keeps every walker and dog inside the layout bounds', () => {
    const layout = generateCity(settings());
    const peds = new Pedestrians(layout, { trafficMultiplier: 2, seed: 5 });
    expect(peds.count).toBeGreaterThan(0);
    expect(peds.count).toBeLessThanOrEqual(peds.capacity);

    const b = layout.townBounds;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    const grow = (x: number, z: number): void => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    };
    for (let i = 0; i < 600; i++) {
      peds.update(0.1);
      for (const p of peds.getPedestrians()) {
        grow(p.position.x, p.position.z);
        if (p.dog) grow(p.dog.position.x, p.dog.position.z);
      }
    }
    expect(minX).toBeGreaterThanOrEqual(b.minX);
    expect(maxX).toBeLessThanOrEqual(b.maxX);
    expect(minZ).toBeGreaterThanOrEqual(b.minZ);
    expect(maxZ).toBeLessThanOrEqual(b.maxZ);
  });

  it('bounds the walker count by trafficMultiplier', () => {
    const layout = generateCity(settings());
    const low = new Pedestrians(layout, { trafficMultiplier: 0.5, seed: 5 });
    const high = new Pedestrians(layout, { trafficMultiplier: 3, seed: 5 });
    expect(low.capacity).toBeLessThan(high.capacity);
    for (let i = 0; i < 100; i++) {
      low.update(0.1);
      high.update(0.1);
      expect(low.count).toBeLessThanOrEqual(low.capacity);
      expect(high.count).toBeLessThanOrEqual(high.capacity);
    }
    expect(new Pedestrians(layout, { trafficMultiplier: 0, seed: 5 }).count).toBe(0);
  });
});
