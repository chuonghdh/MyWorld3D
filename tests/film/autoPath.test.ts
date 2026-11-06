import { describe, expect, it } from 'vitest';
import { film } from '../../src/config/tuning';
import type { Rect } from '../../src/city/layout';
import { autoFrameCount, autoPoseAt, dryRun, gameMinutesPerFrame, type DrySample } from '../../src/film/autoPath';

const TOWNS: Rect[] = [
  { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  { minX: -400, maxX: 300, minZ: -150, maxZ: 120 },
  { minX: 0, maxX: 40, minZ: 10, maxZ: 25 },
  { minX: -1000, maxX: 1000, minZ: -800, maxZ: 800 },
];
const FOVS = [35, 45, 60];

function poseSample(town: Rect, fov: number): (t: number) => DrySample {
  return (t) => {
    const p = autoPoseAt(t, town, fov);
    return { metres: [p.x, p.y, p.z, p.tx, p.ty, p.tz] };
  };
}

describe('autoPath frame clock', () => {
  it('frame count equals autoSeconds x fps', () => {
    expect(autoFrameCount()).toBe(film.autoSeconds * film.fps);
  });

  it('game minutes summed over all frames equal autoVirtualMinutes', () => {
    const total = gameMinutesPerFrame() * autoFrameCount();
    expect(total).toBeCloseTo(film.autoVirtualMinutes, 9);
  });
});

describe('autoPoseAt', () => {
  it('has no NaN across towns and fov values, for every frame', () => {
    for (const town of TOWNS) {
      for (const fov of FOVS) {
        for (let i = 0; i < autoFrameCount(); i++) {
          const p = autoPoseAt(i / film.fps, town, fov);
          for (const v of [p.x, p.y, p.z, p.tx, p.ty, p.tz]) {
            expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    }
  });

  it('is a closed loop: the pose at t = 0 equals the pose at t = autoSeconds', () => {
    for (const town of TOWNS) {
      const a = autoPoseAt(0, town, 45);
      const b = autoPoseAt(film.autoSeconds, town, 45);
      for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz'] as const) {
        expect(b[k]).toBeCloseTo(a[k], 6);
      }
    }
  });

  it('keeps the camera at overview height and looks at the town centre', () => {
    const town = TOWNS[0]!;
    const p = autoPoseAt(3, town, 45);
    expect(p.y).toBeGreaterThan(0);
    expect(p.tx).toBeCloseTo(0, 6);
    expect(p.tz).toBeCloseTo(0, 6);
  });
});

describe('dryRun', () => {
  it('returns the frame count it was asked for', () => {
    const r = dryRun(autoFrameCount(), poseSample(TOWNS[0]!, 45));
    expect(r.count).toBe(autoFrameCount());
  });

  it('two runs with the same input give the same hash', () => {
    for (const town of TOWNS) {
      const a = dryRun(autoFrameCount(), poseSample(town, 45));
      const b = dryRun(autoFrameCount(), poseSample(town, 45));
      expect(b.hash).toBe(a.hash);
    }
  });

  it('a different town gives a different hash', () => {
    const a = dryRun(autoFrameCount(), poseSample(TOWNS[0]!, 45));
    const b = dryRun(autoFrameCount(), poseSample(TOWNS[1]!, 45));
    expect(b.hash).not.toBe(a.hash);
  });

  it('hashes angles at x10000 precision as well as metres', () => {
    const base = dryRun(2, () => ({ metres: [1, 2, 3] }));
    const withAngle = dryRun(2, () => ({ metres: [1, 2, 3], angles: [0.5] }));
    expect(withAngle.hash).not.toBe(base.hash);
  });

  it('throws on a non-finite value instead of hashing it', () => {
    expect(() => dryRun(1, () => ({ metres: [Number.NaN] }))).toThrow();
  });
});
