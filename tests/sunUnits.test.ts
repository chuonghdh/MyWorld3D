import { describe, expect, it } from 'vitest';
import { getSkyState, getSunDirection } from '../src/environment/sun';

// Guard: suncalc v2 returns degrees with azimuth from north. A stale v1 install
// (radians, azimuth from south) silently turns midnight into dusk.
const MSG = 'suncalc returned v1 units - run npm install';

describe('suncalc units guard (Hanoi, spring equinox)', () => {
  it('midnight is deep night', () => {
    const sun = getSunDirection(0);
    expect(sun.altitudeDeg, MSG).toBeLessThan(-45);
    expect(getSkyState(sun.altitudeDeg).phase, MSG).toBe('night');
  });

  it('noon is high day', () => {
    expect(getSunDirection(12).altitudeDeg, MSG).toBeGreaterThan(45);
  });

  it('morning sun is east, evening sun is west', () => {
    expect(Math.abs(getSunDirection(6).azimuthDeg - 90), MSG).toBeLessThan(20);
    expect(Math.abs(getSunDirection(18).azimuthDeg - 270), MSG).toBeLessThan(20);
  });
});
