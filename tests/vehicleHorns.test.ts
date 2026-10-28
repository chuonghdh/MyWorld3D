import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { VehicleSystem } from '../src/traffic/vehicles';

const city = generateCity({ ...DEFAULT_SETTINGS, seed: 4242 });

interface Internals {
  hornClock: number;
  hornRng: () => number;
  tryHorn(v: FakeVehicle): void;
}
interface FakeVehicle {
  x: number;
  z: number;
  cls: 'car' | 'bus' | 'truck' | 'motorbike';
  lastHornAt: number;
}

const fake = (x = 1, z = 2, cls: FakeVehicle['cls'] = 'car'): FakeVehicle => ({ x, z, cls, lastHornAt: -Infinity });

describe('VehicleSystem horn queue', () => {
  it('queues a horn at the vehicle position and clears the queue on read', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 1 });
    const priv = sys as unknown as Internals;
    priv.hornRng = () => 0; // always honk
    priv.tryHorn(fake(5, 6, 'bus'));
    const a = sys.takeHorns();
    expect(a).toEqual([{ x: 5, z: 6, cls: 'bus' }]);
    expect(sys.takeHorns().length).toBe(0);
    // The returned array is reused between calls.
    expect(sys.takeHorns()).toBe(a);
  });

  it('applies a 45 s per-vehicle cooldown', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 1 });
    const priv = sys as unknown as Internals;
    priv.hornRng = () => 0;
    const v = fake();
    priv.hornClock = 100;
    priv.tryHorn(v);
    expect(sys.takeHorns().length).toBe(1);
    priv.hornClock = 144;
    priv.tryHorn(v);
    expect(sys.takeHorns().length).toBe(0);
    priv.hornClock = 145.1;
    priv.tryHorn(v);
    expect(sys.takeHorns().length).toBe(1);
  });

  it('allows one horn per 6 s across the whole city', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 1 });
    const priv = sys as unknown as Internals;
    priv.hornRng = () => 0;
    priv.hornClock = 50;
    for (let i = 0; i < 6; i++) priv.tryHorn(fake(i, 0));
    expect(sys.takeHorns().length).toBe(1);
    priv.hornClock = 55;
    for (let i = 0; i < 6; i++) priv.tryHorn(fake(i, 1));
    expect(sys.takeHorns().length).toBe(0);
    priv.hornClock = 56.1;
    for (let i = 0; i < 6; i++) priv.tryHorn(fake(i, 2));
    expect(sys.takeHorns().length).toBe(1);
  });

  it('only half of the honk-worthy moments end in a horn', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 1 });
    const priv = sys as unknown as Internals;
    let honks = 0;
    for (let i = 0; i < 400; i++) {
      priv.hornClock = i * 100; // far apart: no cooldown or gap in the way
      priv.tryHorn(fake(i, 0));
      honks += sys.takeHorns().length;
    }
    expect(honks).toBeGreaterThan(140);
    expect(honks).toBeLessThan(260);
  });

  it('honks when a pedestrian holds vehicles on a green light, never faster than the limits', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 2, seed: 12 });
    // A pedestrian stands on every crosswalk for the whole run.
    const peds = city.crosswalks.map((c) => ({ position: { x: c.center.x, z: c.center.z } }));
    sys.setPedestrianSource(() => peds);
    const times: number[] = [];
    let t = 0;
    let total = 0;
    for (let i = 0; i < 6000; i++) {
      sys.update(0.05);
      t += 0.05;
      const h = sys.takeHorns();
      for (let k = 0; k < h.length; k++) {
        expect(Number.isFinite(h[k].x) && Number.isFinite(h[k].z)).toBe(true);
        times.push(t);
      }
      total += h.length;
    }
    expect(total).toBeGreaterThan(0);
    // Never closer than the 6 s city-wide gap (and 300 s of traffic is not a constant din).
    for (let i = 0; i + 1 < times.length; i++) expect(times[i + 1] - times[i]).toBeGreaterThanOrEqual(5.9);
    expect(total).toBeLessThanOrEqual(Math.ceil(300 / 6));
  });

  it('stays quiet without pedestrians on a quiet road (no jam, no walkers)', () => {
    const sys = new VehicleSystem(city, { trafficMultiplier: 0.3, seed: 3 });
    let total = 0;
    for (let i = 0; i < 1200; i++) {
      sys.update(0.05);
      total += sys.takeHorns().length;
    }
    // Hard braking is rare and random: a handful at most in one minute.
    expect(total).toBeLessThan(6);
  });

  it('does not change the main simulation: same seed, same vehicles with or without reading horns', () => {
    const run = (read: boolean) => {
      const sys = new VehicleSystem(city, { trafficMultiplier: 1.5, seed: 77 });
      const out: number[] = [];
      for (let i = 0; i < 400; i++) {
        sys.update(0.05);
        if (read) sys.takeHorns();
        if (i % 20 === 0) for (const v of sys.getVehicles()) out.push(v.id, v.position.x, v.position.z, v.speed);
      }
      return out;
    };
    expect(run(true)).toEqual(run(false));
  });
});
