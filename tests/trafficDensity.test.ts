// The shared time-of-day density curve, and that vehicle spawning follows it.
import { describe, expect, it } from 'vitest';
import { generateCity } from '../src/city';
import { DEFAULT_SETTINGS } from '../src/store/model';
import { trafficDensityAt, TRAFFIC_DENSITY_FLOOR } from '../src/traffic/trafficDensity';
import { VehicleSystem } from '../src/traffic/vehicles';

describe('traffic density curve', () => {
  it('peaks at 11:00 and 19:00', () => {
    expect(trafficDensityAt(11)).toBe(1);
    expect(trafficDensityAt(19)).toBe(1);
    for (let h = 0; h <= 24; h += 0.25) expect(trafficDensityAt(h)).toBeLessThanOrEqual(1);
  });

  it('dips between the peaks, around 15:00, but stays above the floor', () => {
    expect(trafficDensityAt(15)).toBeLessThan(trafficDensityAt(11));
    expect(trafficDensityAt(15)).toBeLessThan(trafficDensityAt(19));
    expect(trafficDensityAt(15)).toBeGreaterThan(0.6);
  });

  it('holds the quiet floor from 23:00 through 05:00, and it is not zero', () => {
    expect(TRAFFIC_DENSITY_FLOOR).toBeGreaterThanOrEqual(0.15);
    expect(TRAFFIC_DENSITY_FLOOR).toBeLessThanOrEqual(0.25);
    for (const h of [23, 23.5, 0, 1, 2.5, 3, 4, 5]) {
      expect(trafficDensityAt(h)).toBeCloseTo(TRAFFIC_DENSITY_FLOOR, 9);
    }
  });

  it('rises monotonically from 05:00 to the 11:00 peak', () => {
    let prev = -Infinity;
    for (let h = 5; h <= 11; h += 0.05) {
      const d = trafficDensityAt(h);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = d;
    }
  });

  it('falls monotonically from the 19:00 peak to the floor at 23:00', () => {
    let prev = Infinity;
    for (let h = 19; h <= 23; h += 0.05) {
      const d = trafficDensityAt(h);
      expect(d).toBeLessThanOrEqual(prev + 1e-12);
      prev = d;
    }
  });

  it('wraps the hour and is a pure function of it', () => {
    expect(trafficDensityAt(-1)).toBeCloseTo(trafficDensityAt(23), 9);
    expect(trafficDensityAt(25)).toBeCloseTo(trafficDensityAt(1), 9);
    expect(trafficDensityAt(13.37)).toBe(trafficDensityAt(13.37));
  });
});

describe('vehicle spawning follows the clock', () => {
  const city = generateCity({ ...DEFAULT_SETTINGS, seed: 4242 });

  function activeAfter(hour: number): number {
    const sys = new VehicleSystem(city, { trafficMultiplier: 1, seed: 11 });
    for (let i = 0; i < 2400; i++) sys.update(0.25, { timeOfDay: hour });
    return sys.count;
  }

  it('spawns far fewer vehicles at 03:00 than at 11:00', () => {
    const night = activeAfter(3);
    const morning = activeAfter(11);
    expect(morning).toBeGreaterThan(0);
    expect(night).toBeLessThan(morning * 0.5);
  });
});
