// Auto film path (P5): pure keyframes for the seven-step bird route (docs/feature_video_camera.md 3.3).
// Plain TypeScript: no React, no Math.random, no wall-clock time. Same layout, seed and sun/moon give the same path.
// Knots are joined by a uniform cubic B-spline (filmRoute.ts), lifted above the height floor and sampled by arc
// length, so the flight speed is the flight length over the flight time (plus a soft ease at both ends).
// Height floor: the roof top of the footprint under the point (filmPathField.ts), 0 on open ground.
// The camera never drops below floor + SKIM_HEIGHT_M. Split: filmPathField.ts (heights, clearance), filmRoute.ts (route),
// filmPathConsts.ts (constants), filmPathPlan.ts (descent road and finale search), filmPathKeys.ts (keyframes), this file (planner).
import { film } from '../config/tuning';
import { createRng } from '../core/rng';
import type { Block, CityLayout, Lot, Rect, RoadSegment } from '../city/layout';
import type { SunDirection } from '../environment/sun';
import type { V3 } from './cameraMath';
import { APPROACH_M, MONUMENT_TOP_M, WALL_CLEAR_CELLS, buildField, dilateField, floorAt, lineClear } from './filmPathField';
import { SKIM_HEIGHT_M, buildRoute, routePose, type Route } from './filmRoute';
import { buildTimeline, type Timeline } from './filmSpeed';
import { buildLookTrack } from './filmLook';
import {
  BOUNDS_MARGIN_M,
  DESCENT_POOL,
  FACADE_VIEW_M,
  FALLBACK_RING_FRACTION,
  FILM_SALT,
  FIT_STEPS,
  HIGH_ACCEL,
  HIGH_CAP_MPS,
  LOW_ACCEL,
  LOW_CAP_H_M,
  LOW_CAP_MPS,
  MIN_BEND_M,
  MIN_ORBIT_SCALE,
  ORBIT_SHRINK,
  PERCH_FACING_COS,
  PERCH_NEAR_M,
  PIN_DROP_M,
  RING_PAD_M,
  START_HEIGHT_M,
  VIEW_SAMPLES,
} from './filmPathConsts';
import { planFinale, rankDescentRoads } from './filmPathPlan';
import { buildKeys, type KeyContext } from './filmPathKeys';

export { LOW_CAP_MPS, LOW_CAP_H_M, HIGH_CAP_MPS, START_HEIGHT_M, rankDescentRoads };

export interface FilmPose {
  position: V3;
  target: V3;
}

/** A keyframe. `step` is the 3.3 step number (1 to 6); step 7 is the hold after the last key. */
export interface FilmKey extends FilmPose {
  step: number;
}

export interface FilmPathInput {
  layout: CityLayout;
  seed: number;
  sun: SunDirection;
  moon: SunDirection;
  /** Vertical field of view of the film camera, degrees. */
  fovDeg: number;
}

export interface FilmPath {
  /** Film length, real seconds (film.autoSeconds). */
  duration: number;
  /** Arc length of the flight, metres. */
  length: number;
  /** Largest camera speed on the path, metres per second. */
  peakSpeed: number;
  /** Smallest turn radius of the flight, metres (the speed follows it, see filmSpeed.ts). */
  minTurnRadius: number;
  /** Flight time the capped speed profile needs, seconds; above the flight time the caps are exceeded. */
  capSeconds: number;
  keys: readonly FilmKey[];
  /** Point the cathedral perch looks at (cathedral centre, or town centre without one). */
  focus: V3;
  /** Perch pose (step 6). */
  perch: FilmPose;
  /** Road used for the step 4 descent (nearest the town centre among the seeded pool), or null without one. */
  descentRoad: RoadSegment | null;
  /** Unit look direction of the sky tilt (step 5): toward the sun, or the moon when the sun is down. */
  skyDir: V3;
  /** Pose at film time t (seconds). Clamped to the film. Pass `out` to reuse an object per frame. */
  poseAt(t: number, out?: FilmPose): FilmPose;
}

/** Height floor query for a layout (same field as the path uses). For tests and the FilmRig checks. */
/** Route floor for a layout: the height floor dilated by the wall clearance (what the camera is lifted above). */
export function wallFloorFn(layout: CityLayout): (x: number, z: number) => number {
  const nf = dilateField(buildField(layout), WALL_CLEAR_CELLS);
  return (x, z) => floorAt(nf, x, z);
}

export function heightFloorFn(layout: CityLayout): (x: number, z: number) => number {
  const f = buildField(layout);
  return (x, z) => floorAt(f, x, z);
}

/** Builds the seven-step route. Throws on a non-finite knot so a NaN never reaches the camera. */
export function buildFilmPath(input: FilmPathInput): FilmPath {
  const { layout, seed, sun, moon, fovDeg } = input;
  const f = buildField(layout);
  const tb = layout.townBounds;
  const cx = (tb.minX + tb.maxX) / 2;
  const cz = (tb.minZ + tb.maxZ) / 2;
  const half = Math.max(tb.maxX - tb.minX, tb.maxZ - tb.minZ) / 2;
  const cruiseY = f.max + film.cruiseClearanceM;
  const limits: Rect = { minX: tb.minX + BOUNDS_MARGIN_M, maxX: tb.maxX - BOUNDS_MARGIN_M, minZ: tb.minZ + BOUNDS_MARGIN_M, maxZ: tb.maxZ - BOUNDS_MARGIN_M };
  const within = (x: number, z: number): boolean => x >= limits.minX && x <= limits.maxX && z >= limits.minZ && z <= limits.maxZ;
  const duration = film.autoSeconds;
  const flight = duration - film.perchHoldSeconds;

  // Sky look direction: moon when it is up or the sun is down, else the sun. Horizontal bearing, tilted up.
  const body = moon.altitudeDeg > 0 || sun.altitudeDeg <= 0 ? moon : sun;
  const hLen = Math.hypot(body.x, body.z);
  const hx = hLen > 1e-9 ? body.x / hLen : 0;
  const hz = hLen > 1e-9 ? body.z / hLen : 1;
  const tilt = (film.skyTiltDeg * Math.PI) / 180;
  const skyDir: V3 = [hx * Math.cos(tilt), Math.sin(tilt), hz * Math.cos(tilt)];

  const blockKind = new Map<string, Block['kind']>(layout.blocks.map((blk) => [blk.id, blk.kind]));
  const houseLots: Lot[] = layout.lots.filter((l) => blockKind.get(l.blockId) === 'houses');
  const skim = SKIM_HEIGHT_M;
  const dist2 = (x: number, z: number, p: { x: number; z: number }): number => (p.x - x) ** 2 + (p.z - z) ** 2;

  const cathedral = layout.blocks.find((blk) => blk.monument === 'gothic-cathedral');
  const cathCx = cathedral ? (cathedral.bounds.minX + cathedral.bounds.maxX) / 2 : cx;
  const cathCz = cathedral ? (cathedral.bounds.minZ + cathedral.bounds.maxZ) / 2 : cz;
  const ringR = cathedral
    ? Math.max(cathedral.bounds.maxX - cathedral.bounds.minX, cathedral.bounds.maxZ - cathedral.bounds.minZ) / 2 + RING_PAD_M
    : half * FALLBACK_RING_FRACTION;
  const focus: V3 = [cathCx, MONUMENT_TOP_M * 0.5, cathCz];
  const perchTop = (l: Lot): V3 => [l.position.x, floorAt(f, l.position.x, l.position.z) + film.cruiseClearanceM, l.position.z];

  // Perch candidates (user spec): a house roof facing the cathedral, opposite it across a street, with a clear
  // downward view of it. Facing: the lot front points at the cathedral. Opposite: the lot lies within PERCH_NEAR_M of
  // the cathedral block. View: the line from the perch to the cathedral's near facade stays above the roofs between.
  const cb = cathedral?.bounds;
  const facadeFor = (l: Lot): V3 => {
    if (!cb) return [cx, 0, cz];
    return [Math.min(cb.maxX, Math.max(cb.minX, l.position.x)), FACADE_VIEW_M, Math.min(cb.maxZ, Math.max(cb.minZ, l.position.z))];
  };
  // View line from the perch down to the facade: every sample outside the cathedral itself stays above the roofs.
  const viewClear = (a: V3, b: V3): boolean => {
    for (let k = 0; k <= VIEW_SAMPLES; k++) {
      const t = k / VIEW_SAMPLES;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[2] + (b[2] - a[2]) * t;
      if (cb && x >= cb.minX && x <= cb.maxX && z >= cb.minZ && z <= cb.maxZ) continue;
      if (a[1] + (b[1] - a[1]) * t < floorAt(f, x, z)) return false;
    }
    return true;
  };
  const facesCathedral = (l: Lot): boolean => {
    if (!cb) return false;
    const fc = facadeFor(l);
    const dx = fc[0] - l.position.x;
    const dz = fc[2] - l.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6 || d > PERCH_NEAR_M) return false;
    const front = (Math.sin(l.facing) * dx + Math.cos(l.facing) * dz) / d;
    return front >= PERCH_FACING_COS && viewClear(perchTop(l), fc);
  };
  const perchCandidates = houseLots
    .filter(facesCathedral)
    .sort((a, b) => dist2(cathCx, cathCz, a.position) - dist2(cathCx, cathCz, b.position));

  // Descent street (step 4) and finale: among the clear roads nearest the town centre (in seeded order) and both
  // directions, the plan whose two joints turn least (filmPathPlan.ts). The street ride ends before the perch, the
  // climb rises toward it at half its side offset, and the drop lands on it ahead.
  const rng = createRng((seed ^ FILM_SALT) >>> 0);
  const pool = rankDescentRoads(layout).slice(0, DESCENT_POOL);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const best = planFinale({ f, pool, perchCandidates, cathCx, cathCz, cruiseY, within, perchTop });
  // Fallback (no cathedral, or no plan): the nearest clear road, climb at its end, nearest house to the town centre.
  const road: RoadSegment | undefined = best?.road ?? pool[0];
  const rl = best ? best.rl : road ? Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z) : half;
  const sx0 = best ? best.sx0 : road ? road.start.x : cx - half * 0.5;
  const sz0 = best ? best.sz0 : road ? road.start.z : cz;
  const rx = best ? best.rx : road ? (road.end.x - road.start.x) / rl : 1;
  const rz = best ? best.rz : road ? (road.end.z - road.start.z) / rl : 0;
  const sx = sx0 + rx * APPROACH_M;
  const sz = sz0 + rz * APPROACH_M;
  const roadEndSky: V3 = [sx0 + rx * rl, cruiseY, sz0 + rz * rl];
  const approachTo = (l: Lot): V3 => {
    const ax = roadEndSky[0] - l.position.x;
    const az = roadEndSky[2] - l.position.z;
    const al = Math.hypot(ax, az) || 1;
    return [l.position.x + (ax / al) * APPROACH_M, cruiseY, l.position.z + (az / al) * APPROACH_M];
  };
  const fallbackOk = (l: Lot): boolean => within(approachTo(l)[0], approachTo(l)[2]) && lineClear(f, approachTo(l), perchTop(l), skim);
  const byCentre = houseLots.slice().sort((a, b) => dist2(cx, cz, a.position) - dist2(cx, cz, b.position));
  const perchLot = best?.perch ?? perchCandidates.find(fallbackOk) ?? byCentre.find(fallbackOk) ?? byCentre[0];
  if (!perchLot) throw new Error('filmPath: no house lot to perch on');
  const perchPos = perchTop(perchLot);
  const rideEnd = best ? best.rideEnd : rl - APPROACH_M;
  const ex = sx0 + rx * rideEnd;
  const ez = sz0 + rz * rideEnd;
  const skyPos: V3 = best ? best.sky : roadEndSky;
  const perchApproach: V3 = best ? best.approach : approachTo(perchLot);
  const arcKeys: V3[] = best ? best.arc : [];
  // Perch look target at ground level: the view tilts down from the roof onto the cathedral (geometry, not a knob).
  const perchTarget: V3 = cathedral ? [cathCx, 0, cathCz] : [perchLot.position.x, 0, perchLot.position.z];

  const ctx: KeyContext = {
    f, tb, fovDeg, cruiseY, cx, cz, half, cathCx, cathCz, ringR, limits, focus,
    sx0, sz0, sx, sz, rx, rz, ex, ez, skyPos, skyDir, arcKeys, perchApproach, perchPos, perchTarget,
  };
  const build = (scale: number): FilmKey[] => buildKeys(ctx, scale);

  let scale = 1;
  // Route floor: the roof within the wall clearance of each point, so the camera clears walls as well as roofs.
  const nearF = dilateField(f, WALL_CLEAR_CELLS);
  const floor = (x: number, z: number): number => floorAt(nearF, x, z);
  // Low flight (descent street, perch drop) keeps its line near walls: only the cruise is smoothed sideways.
  const pin = (q: V3): boolean => q[1] < cruiseY - PIN_DROP_M;
  let route = buildRoute(build(scale), floor, pin);
  // Speed follows the turn radius (filmSpeed.ts), at rest at both ends, scaled to the flight time.
  // Speed cap by height above the route floor: angular speed on screen is what reads as smooth, so the camera may fly
  // faster the higher it is (LOW_CAP_MPS at LOW_CAP_H_M or lower, rising linearly to HIGH_CAP_MPS at the start height).
  const heightOf = (q: V3): number => q[1] - floor(q[0], q[2]);
  const accelAt = (q: V3): number => LOW_ACCEL + (HIGH_ACCEL - LOW_ACCEL) * heightBand(heightOf(q));
  const timelineAt = (r: Route, lowScale: number): Timeline =>
    buildTimeline(r.pts, r.arc, flight, (q) => heightCap(heightOf(q), lowScale), accelAt);
  const timelineOf = (r: Route): Timeline => timelineAt(r, 1);
  let timeline = timelineOf(route);
  while (timeline.rawSeconds > flight && scale * ORBIT_SHRINK >= MIN_ORBIT_SCALE) {
    const nextScale = scale * ORBIT_SHRINK;
    const nextRoute = buildRoute(build(nextScale), floor, pin);
    const next = timelineOf(nextRoute);
    // Smoothness over speed: keep the larger loop when shrinking would tighten the sharpest bend below MIN_BEND_M.
    if (next.minRadius < MIN_BEND_M && next.minRadius < timeline.minRadius) break;
    scale = nextScale;
    route = nextRoute;
    timeline = next;
  }
  for (const k of route.keys) {
    for (const v of [...k.position, ...k.target]) if (!Number.isFinite(v)) throw new Error('filmPath: non-finite knot');
  }

  // Spare time goes to the slow, low parts: when the capped profile is shorter than the flight, the low band of the
  // cap is scaled down (bisection) until the profile fills the flight; the fast high opening keeps its speed.
  if (timeline.rawSeconds < flight) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < FIT_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (timelineAt(route, mid).rawSeconds > flight) lo = mid;
      else hi = mid;
    }
    timeline = timelineAt(route, hi);
  }
  const peakSpeed = timeline.peak;
  // Look direction smoothed and rate limited in film time (filmLook.ts); the position is the route itself.
  const finalRoute = route;
  const look = buildLookTrack((t, out) => routePose(finalRoute, timeline.arcAt(t), out), flight);
  const poseAt = (t: number, out: FilmPose = { position: [0, 0, 0], target: [0, 0, 0] }): FilmPose => {
    look(Math.min(Math.max(t, 0), flight), out);
    return out;
  };

  return {
    duration,
    length: route.length,
    peakSpeed,
    minTurnRadius: timeline.minRadius,
    capSeconds: timeline.rawSeconds,
    keys: route.keys,
    focus,
    perch: { position: perchPos, target: perchTarget },
    descentRoad: road ?? null,
    skyDir,
    poseAt,
  };
}

/** Speed cap at height h above the floor (see LOW_CAP_MPS). */
export function heightCap(h: number, lowScale = 1): number {
  const low = LOW_CAP_MPS * lowScale;
  return low + (HIGH_CAP_MPS - low) * heightBand(h);
}

/** 0 at or below LOW_CAP_H_M, 1 at the start height, linear between. */
function heightBand(h: number): number {
  return Math.min(1, Math.max(0, (h - LOW_CAP_H_M) / (START_HEIGHT_M - LOW_CAP_H_M)));
}
