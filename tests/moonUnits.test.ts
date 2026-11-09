import { describe, expect, it } from 'vitest';
import { getMoonDirection, getMoonPhase, getNightMoonDirection, getSunDirection } from '../src/environment/sun';

// Guard: suncalc v2 moon output is degrees, azimuth from north (same frame as the sun).
const MSG = 'suncalc returned v1 units - run npm install';
const HOURS = Array.from({ length: 48 }, (_, i) => i * 0.5);

describe('suncalc moon units guard (Hanoi, spring equinox)', () => {
  it('moon altitude/azimuth are degrees', () => {
    const dirs = HOURS.map((h) => getMoonDirection(h));
    for (const d of dirs) {
      expect(d.altitudeDeg, MSG).toBeGreaterThanOrEqual(-90);
      expect(d.altitudeDeg, MSG).toBeLessThanOrEqual(90);
      expect(d.azimuthDeg, MSG).toBeGreaterThanOrEqual(0);
      expect(d.azimuthDeg, MSG).toBeLessThan(360);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
    }
    expect(Math.max(...dirs.map((d) => Math.abs(d.altitudeDeg))), MSG).toBeGreaterThan(2 * Math.PI);
  });

  it('moon rises in the east (same azimuth frame as the sun)', () => {
    const rise = HOURS.slice(1).find((h) => getMoonDirection(h - 0.5).altitudeDeg < 0 && getMoonDirection(h).altitudeDeg >= 0);
    expect(rise, 'no moonrise found').toBeDefined();
    expect(getMoonDirection(rise!).x, MSG).toBeGreaterThan(0);
  });

  it('night moon sits opposite the sun and is high at midnight', () => {
    const sun = getSunDirection(0);
    const moon = getNightMoonDirection(0);
    expect(moon.x).toBeCloseTo(-sun.x, 9);
    expect(moon.y).toBeCloseTo(-sun.y, 9);
    expect(moon.z).toBeCloseTo(-sun.z, 9);
    expect(moon.altitudeDeg, MSG).toBeGreaterThan(45);
  });

  it('moon phase is in [0,1) and near new moon on the default date', () => {
    const p = getMoonPhase(0);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(1);
    expect(p).toBeCloseTo(0.02, 1);
  });
});
