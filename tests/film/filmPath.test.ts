import { describe, expect, it } from 'vitest';
import { film, trafficLife } from '../../src/config/tuning';
import { MAX_LOOK_DEG_PER_S, filmClipPlanes } from '../../src/scene/filmLook';
import { CELL_M, WALL_CLEAR_CELLS, buildField } from '../../src/scene/filmPathField';
import { generateCity } from '../../src/city';
import { DEFAULT_SETTINGS } from '../../src/store/model';
import {
  HIGH_CAP_MPS,
  LOW_CAP_H_M,
  LOW_CAP_MPS,
  START_HEIGHT_M,
  buildFilmPath,
  heightCap,
  heightFloorFn,
  rankDescentRoads,
  wallFloorFn,
  type FilmPath,
} from '../../src/scene/filmPath';
import { CLOUD_TOP_MAX } from '../../src/environment/cloudSprites';
import { ALTITUDE_MAX } from '../../src/aircraft/schedule';
import { SKIM_HEIGHT_M } from '../../src/scene/filmRoute';
import type { SunDirection } from '../../src/environment/sun';

const SEEDS = [1, 7, 42, 1234, 99991];
const EPS = 1e-6;
const MARGIN_M = 2;
const FRAMES = Math.round(film.autoSeconds * film.fps);
const FLIGHT_S = film.autoSeconds - film.perchHoldSeconds;

function sun(alt: number, x: number, z: number): SunDirection {
  return { x, y: Math.sin((alt * Math.PI) / 180), z, altitudeDeg: alt, azimuthDeg: 0 };
}
const DAY = { sun: sun(55, 0.4, 0.5), moon: sun(-30, -0.3, -0.2) };
const FOV = 45;

function pathFor(seed: number, over: Partial<{ sun: SunDirection; moon: SunDirection }> = {}): FilmPath {
  const layout = generateCity({ ...DEFAULT_SETTINGS, seed });
  return buildFilmPath({ layout, seed, sun: over.sun ?? DAY.sun, moon: over.moon ?? DAY.moon, fovDeg: FOV });
}

function layoutOf(seed: number) {
  return generateCity({ ...DEFAULT_SETTINGS, seed });
}

describe('auto film path (video P5)', () => {
  it('has no NaN and finite keys across seeds', () => {
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      for (const k of p.keys) {
        for (const v of [...k.position, ...k.target]) expect(Number.isFinite(v)).toBe(true);
      }
      for (let i = 0; i < FRAMES; i++) {
        const pose = p.poseAt(i / film.fps);
        for (const v of [...pose.position, ...pose.target]) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('starts at the first key and ends at the last key, then holds', () => {
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      const first = p.keys[0]!;
      const last = p.keys[p.keys.length - 1]!;
      const start = p.poseAt(0);
      // Float tolerance: the route is resampled and smoothed (endpoints pinned), which can round the last bit.
      for (let k = 0; k < 3; k++) expect(start.position[k]).toBeCloseTo(first.position[k]!, 6);
      const end = p.poseAt(FLIGHT_S);
      // Position allows 0.2 m: the wall clearance lifts the perch by up to about 12 cm where a taller roof stands within
      // about 20 m. The perch is on a roof, so that lift is not visible.
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(end.position[k]! - last.position[k]!)).toBeLessThan(0.2);
        expect(end.target[k]).toBeCloseTo(last.target[k]!, 6);
      }
      const hold = p.poseAt(film.autoSeconds);
      expect(hold.position).toEqual(end.position);
    }
  });

  it('keeps the camera inside the town bounds minus a margin', () => {
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const b = layout.townBounds;
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      for (let i = 0; i < FRAMES; i++) {
        const { position } = p.poseAt(i / film.fps);
        expect(position[0]).toBeGreaterThanOrEqual(b.minX + MARGIN_M - EPS);
        expect(position[0]).toBeLessThanOrEqual(b.maxX - MARGIN_M + EPS);
        expect(position[2]).toBeGreaterThanOrEqual(b.minZ + MARGIN_M - EPS);
        expect(position[2]).toBeLessThanOrEqual(b.maxZ - MARGIN_M + EPS);
      }
    }
  });

  it('keeps the height at or above floor + skim height (the roof floor under the camera)', () => {
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const floor = heightFloorFn(layout);
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      for (let i = 0; i < FRAMES; i++) {
        const { position } = p.poseAt(i / film.fps);
        const minY = floor(position[0], position[2]) + SKIM_HEIGHT_M;
        expect(position[1]).toBeGreaterThanOrEqual(minY - 1e-3);
      }
    }
  });

  it('per-frame step is at most peak speed times dt', () => {
    const dt = 1 / film.fps;
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      let prev = p.poseAt(0).position.slice();
      for (let i = 1; i < FRAMES; i++) {
        const cur = p.poseAt(i / film.fps).position;
        const step = Math.hypot(cur[0] - prev[0]!, cur[1] - prev[1]!, cur[2] - prev[2]!);
        // 0.1% covers the chord error of the arc-length table.
        expect(step).toBeLessThanOrEqual(p.peakSpeed * dt * 1.001 + EPS);
        prev = cur.slice();
      }
      expect(p.peakSpeed).toBeLessThanOrEqual(HIGH_CAP_MPS + EPS);
    }
  });

  it('speed follows the height cap: 28 m/s near the ground, rising to 80 m/s at the start height', () => {
    expect(heightCap(0)).toBe(LOW_CAP_MPS);
    expect(heightCap(LOW_CAP_H_M)).toBe(LOW_CAP_MPS);
    expect(heightCap(START_HEIGHT_M)).toBe(HIGH_CAP_MPS);
    const dt = 1 / film.fps;
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const wall = wallFloorFn(layout);
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      // The capped profile fits the flight, so no speed is scaled above its cap.
      expect(p.capSeconds).toBeLessThanOrEqual(FLIGHT_S + EPS);
      let prev = p.poseAt(0).position.slice();
      for (let i = 1; i < FRAMES; i++) {
        const cur = p.poseAt(i / film.fps).position;
        const speed = Math.hypot(cur[0] - prev[0]!, cur[1] - prev[1]!, cur[2] - prev[2]!) / dt;
        // The cap is set per route sample; over one frame the lower of the two end heights bounds the step (+2%).
        const h = Math.min(prev[1]! - wall(prev[0]!, prev[2]!), cur[1] - wall(cur[0], cur[2]));
        expect(speed).toBeLessThanOrEqual(heightCap(h) * 1.02 + EPS);
        prev = cur.slice();
      }
    }
  });

  it('is tangent-continuous: the velocity direction turns smoothly', () => {
    const h = 1 / 600;
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      const vel = (t: number): number[] => {
        const a = p.poseAt(t).position;
        const b = p.poseAt(t + h).position;
        return [(b[0]! - a[0]!) / h, (b[1]! - a[1]!) / h, (b[2]! - a[2]!) / h];
      };
      let prev = vel(0);
      for (let t = h; t < FLIGHT_S - h; t += h) {
        const cur = vel(t);
        const dot = prev[0]! * cur[0]! + prev[1]! * cur[1]! + prev[2]! * cur[2]!;
        const n = Math.hypot(...prev) * Math.hypot(...cur);
        if (n > 1e-6) {
          const angle = (Math.acos(Math.min(1, Math.max(-1, dot / n))) * 180) / Math.PI;
          expect(angle).toBeLessThan(5);
        }
        prev = cur;
      }
    }
  });

  it('is deterministic: same layout, seed and sun give identical poses', () => {
    for (const seed of SEEDS) {
      const a = pathFor(seed);
      const b = pathFor(seed);
      expect(a.keys).toEqual(b.keys);
      for (let i = 0; i < FRAMES; i += 15) {
        expect(a.poseAt(i / film.fps)).toEqual(b.poseAt(i / film.fps));
      }
    }
  });

  it('perches on a roof with the cathedral as the look target', () => {
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const floor = heightFloorFn(layout);
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      const cath = layout.blocks.find((b) => b.monument === 'gothic-cathedral');
      expect(cath).toBeDefined();
      // Look target at ground level under the cathedral: the view tilts down onto it.
      expect(p.perch.target[1]).toBe(0);
      expect(p.perch.target[0]).toBeCloseTo(p.focus[0], 6);
      expect(p.perch.target[2]).toBeCloseTo(p.focus[2], 6);
      const { position } = p.perch;
      expect(position[1] - floor(position[0], position[2])).toBeCloseTo(film.cruiseClearanceM, 3);
      // The perch is the last flight key, and the hold keeps it.
      const last = p.keys[p.keys.length - 1]!;
      expect(last.position).toEqual(position);
    }
  });

  it('looks at the moon when the sun is below the horizon', () => {
    const moonHigh = sun(40, 0, 1);
    const sunDown = sun(-20, 1, 0);
    const p = pathFor(7, { sun: sunDown, moon: moonHigh });
    expect(Math.abs(p.skyDir[0])).toBeLessThan(1e-9);
    expect(p.skyDir[2]).toBeGreaterThan(0);
    expect(p.skyDir[1]).toBeCloseTo(Math.sin((film.skyTiltDeg * Math.PI) / 180), 9);
  });

  it('looks at the sun when it is up and the moon is down', () => {
    const p = pathFor(7, { sun: sun(40, 1, 0), moon: sun(-10, 0, 1) });
    expect(Math.abs(p.skyDir[2])).toBeLessThan(1e-9);
    expect(p.skyDir[0]).toBeGreaterThan(0);
  });

  it('film length matches the knob', () => {
    const p = pathFor(1);
    expect(p.duration).toBe(film.autoSeconds);
    expect(p.length).toBeGreaterThan(0);
  });
});

describe('auto film path round 3', () => {
  it('perch look direction tilts down (negative pitch) and reports it in degrees', () => {
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      const [px, py, pz] = p.perch.position;
      const [tx, ty, tz] = p.perch.target;
      const pitchDeg = (Math.atan2(ty - py, Math.hypot(tx - px, tz - pz)) * 180) / Math.PI;
      expect(pitchDeg).toBeLessThan(0);
    }
  });

  it('starts at rest above the cloud tops and the highest aircraft', () => {
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      const at0 = p.poseAt(0);
      expect(at0.position[1]).toBeCloseTo(START_HEIGHT_M, 6);
      expect(START_HEIGHT_M).toBeGreaterThan(Math.max(CLOUD_TOP_MAX, ALTITUDE_MAX));
      const next = p.poseAt(1 / 600);
      // At rest: speed over the first 1/600 s is below 2 m/s (the profile starts from 0 and ramps up).
      expect(Math.hypot(next.position[0] - at0.position[0], next.position[1] - at0.position[1], next.position[2] - at0.position[2]) * 600).toBeLessThan(2);
    }
  });

  it('descent road is among the three clear roads nearest the town centre, in distance order', () => {
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const tb = layout.townBounds;
      const cx = (tb.minX + tb.maxX) / 2;
      const cz = (tb.minZ + tb.maxZ) / 2;
      const ranked = rankDescentRoads(layout);
      const dist = (r: { start: { x: number; z: number }; end: { x: number; z: number } }) =>
        Math.hypot((r.start.x + r.end.x) / 2 - cx, (r.start.z + r.end.z) / 2 - cz);
      for (let i = 1; i < ranked.length; i++) expect(dist(ranked[i]!)).toBeGreaterThanOrEqual(dist(ranked[i - 1]!));
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      if (ranked.length === 0) continue;
      expect(p.descentRoad).not.toBeNull();
      expect(ranked.slice(0, 3)).toContain(p.descentRoad);
    }
  });

  it('keeps the camera above the route floor (roofs within the wall clearance) along the flight', () => {
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const wall = wallFloorFn(layout);
      const p = buildFilmPath({ layout, seed, sun: DAY.sun, moon: DAY.moon, fovDeg: FOV });
      for (let i = 0; i < FRAMES; i++) {
        const t = i / film.fps;
        if (t > FLIGHT_S) break;
        const { position } = p.poseAt(t);
        expect(position[1]).toBeGreaterThanOrEqual(wall(position[0], position[2]) + SKIM_HEIGHT_M - 1e-6);
      }
    }
  });
});

describe('auto film path round 4', () => {
  const lookDir = (q: { position: readonly number[]; target: readonly number[] }): number[] => {
    const d = [q.target[0]! - q.position[0]!, q.target[1]! - q.position[1]!, q.target[2]! - q.position[2]!];
    const l = Math.hypot(d[0]!, d[1]!, d[2]!);
    return d.map((v) => v / l);
  };

  it('look direction turns at most MAX_LOOK_DEG_PER_S per second (per frame bound)', () => {
    const bound = (MAX_LOOK_DEG_PER_S / film.fps) * 1.05;
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      let prev = lookDir(p.poseAt(0));
      for (let i = 1; i < FRAMES; i++) {
        const cur = lookDir(p.poseAt(i / film.fps));
        const dot = Math.min(1, Math.max(-1, prev[0]! * cur[0]! + prev[1]! * cur[1]! + prev[2]! * cur[2]!));
        expect((Math.acos(dot) * 180) / Math.PI).toBeLessThanOrEqual(bound);
        prev = cur;
      }
    }
  });

  it('shows only sky briefly: at most 2 s with the whole view above the horizon (step 5 tilt)', () => {
    // Whole view above the horizon: the look pitch exceeds half the vertical field of view.
    const onlySky = Math.sin(((FOV / 2) * Math.PI) / 180);
    for (const seed of SEEDS) {
      const p = pathFor(seed);
      let up = 0;
      for (let i = 0; i < FRAMES; i++) if (lookDir(p.poseAt(i / film.fps))[1]! > onlySky) up++;
      expect(up / film.fps).toBeLessThanOrEqual(2);
    }
  });

  it('keeps every building footprint at least the wall clearance away horizontally when below its roof', () => {
    const clearance = WALL_CLEAR_CELLS * CELL_M;
    for (const seed of SEEDS) {
      const layout = layoutOf(seed);
      const field = buildField(layout);
      const p = pathFor(seed);
      for (let i = 0; i < FRAMES; i++) {
        const [x, y, z] = p.poseAt(i / film.fps).position as [number, number, number];
        const ci = Math.floor((x - field.x0) / CELL_M);
        const cj = Math.floor((z - field.z0) / CELL_M);
        for (let j = cj - 2; j <= cj + 2; j++) {
          for (let k = ci - 2; k <= ci + 2; k++) {
            if (k < 0 || j < 0 || k >= field.nx || j >= field.nz) continue;
            const top = field.top[j * field.nx + k]!;
            if (top <= y) continue;
            const d = Math.hypot(field.x0 + (k + 0.5) * CELL_M - x, field.z0 + (j + 0.5) * CELL_M - z);
            expect(d).toBeGreaterThan(clearance);
          }
        }
      }
    }
  });

  it('film clip planes: near within the wall clearance and the bird distance, far at least 1200 m (risk 15)', () => {
    for (const h of [0, 1.7, SKIM_HEIGHT_M, 30, 120, START_HEIGHT_M]) {
      const c = filmClipPlanes(h);
      expect(c.near).toBeLessThan(WALL_CLEAR_CELLS * CELL_M);
      expect(c.near).toBeLessThanOrEqual(trafficLife.filmBirdMinDistanceM / 2);
      expect(c.far).toBeGreaterThanOrEqual(1200);
    }
  });
});
