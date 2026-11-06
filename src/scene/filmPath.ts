// Auto film path (P5): pure keyframes for the seven-step bird route (docs/feature_video_camera.md 3.3).
// Plain TypeScript: no React, no Math.random, no wall-clock time. Same layout, seed and sun/moon give the same path.
// Knots are joined by a uniform cubic B-spline (filmRoute.ts), lifted above the height floor and sampled by arc
// length, so the flight speed is the flight length over the flight time (plus a soft ease at both ends).
// Height floor: the roof top of the footprint under the point (filmPathField.ts), 0 on open ground.
// The camera never drops below floor + SKIM_HEIGHT_M. Split: filmPathField.ts (heights, clearance), filmRoute.ts (route), this file (planner).
import { film } from '../config/tuning';
import { createRng } from '../core/rng';
import { CLOUD_TOP_MAX } from '../environment/cloudSprites';
import { ALTITUDE_MAX, CAMERA_SAFETY_MARGIN } from '../aircraft/schedule';
import type { Block, CityLayout, Lot, Rect, RoadSegment } from '../city/layout';
import type { SunDirection } from '../environment/sun';
import { clampToBounds, wholeMapFraming, type V3 } from './cameraMath';
import { APPROACH_M, MONUMENT_TOP_M, WALL_CLEAR_CELLS, buildField, dilateField, floorAt, lineClear, roadIsClear } from './filmPathField';
import { SKIM_HEIGHT_M, buildRoute, routePose, type Route } from './filmRoute';
import { buildTimeline, type Timeline } from './filmSpeed';
import { buildLookTrack } from './filmLook';

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

// Geometry and algorithm constants (not designer knobs; see docs/TUNING.md "not yet tunable").
const FILM_SALT = 0x5f11d;
/** Descent candidates: the seeded pick is made among this many clear roads nearest the town centre. */
const DESCENT_POOL = 3;
/** Ring radius around the cathedral: half the block plus this pad, metres. */
const RING_PAD_M = 15;
/** Ring radius without a cathedral, as a fraction of the town half size. */
const FALLBACK_RING_FRACTION = 0.3;
/** Town orbit radius as a fraction of the town half size (shrunk when the speed cap needs it). */
const ORBIT_FRACTION = 0.6;
/** Sweep of the town orbit, radians (a half turn). */
const ORBIT_SWEEP = Math.PI;
/** Speed cap by height above the floor (m/s at metres): LOW at or below LOW_H, rising linearly to HIGH at the start
 * height (a fast opening descent). The town orbit shrinks while the capped profile does not fit the flight. Not designer knobs. */
export const LOW_CAP_MPS = 28;
export const LOW_CAP_H_M = 30;
export const HIGH_CAP_MPS = 120;
/** Speed ramp (m/s^2) at or below LOW_CAP_H_M and at the start height, linear between: a fast opening descent. */
const LOW_ACCEL = 2;
const HIGH_ACCEL = 12;
/** Low-band cap scale search: bisection steps when the capped profile is shorter than the flight. */
const FIT_STEPS = 14;
const MIN_ORBIT_SCALE = 0.3;
const MIN_RING_SCALE = 0.6;
/** Shrinking stops before it makes the tightest bend smaller than this radius, metres. */
const MIN_BEND_M = 15;
const ORBIT_SHRINK = 0.9;
/** Camera margin inside the town bounds, metres. */
const BOUNDS_MARGIN_M = 2;
/** Overview start height as a multiple of the cruise height. */
const OVERVIEW_Y_FACTOR = 2;
/** Distance of the sky and descent look targets, metres. */
const LOOK_DIST_M = 300;
const DESCENT_LOOK_M = 60;
/** Ring exit search: sweep angles tried on the cathedral ring. */
const RING_SWEEP_SAMPLES = 72;
/** Forward finale (steps 5 and 6), metres along the road: climb point this far before the perch, street ride ending
 * and a ride of at least this length. */
const CLIMB_RUN_M = APPROACH_M * 0.75;
const MIN_RIDE_M = APPROACH_M / 2;
/** Perch spec: lot within this distance of the cathedral block, front within acos(PERCH_FACING_COS) of it, and the
 * facade point it looks at this high (metres). */
const PERCH_NEAR_M = 45;
const PERCH_FACING_COS = 0.5;
const FACADE_VIEW_M = 8;
const VIEW_SAMPLES = 32;
/** Wide climbing turn before the perch (user spec: 60 m or more), metres; samples and key spacing (rad) of its sweep,
 * and the largest angle between its exit heading and the line to the perch (rad). Ride end search step, metres. */
const TURN_RADIUS_M = 60;
const ARC_SAMPLES = 144;
const ARC_KEY_STEP = Math.PI / 4;
const ARC_FIRST_STEP = Math.PI / 12;
const ARC_EXIT_TOL = Math.PI / 12;
const RIDE_STEP_M = 5;
/** Arc exit at least this many approach lengths from the perch (room for the straight approach and the drop). */
const ARC_EXIT_GAP = 1.25;
/** Film start height: above the cloud tops and the highest aircraft, by the aircraft's own camera margin. */
export const START_HEIGHT_M = Math.max(CLOUD_TOP_MAX, ALTITUDE_MAX) + CAMERA_SAFETY_MARGIN;
/** Route samples this far below cruise height keep their line (descent street, perch drop): not smoothed sideways. */
const PIN_DROP_M = 10;
const TAU = 2 * Math.PI;

function circlePos(cx: number, cz: number, r: number, a: number, y: number): V3 {
  return [cx + r * Math.sin(a), y, cz + r * Math.cos(a)];
}

/**
 * Roads usable for the step 4 descent, nearest the town centre first (ties keep layout order). A road is usable when
 * it is clear of buildings along its length and its approach lines stay above the roofs (same test as the planner).
 */
export function rankDescentRoads(layout: CityLayout): RoadSegment[] {
  const f = buildField(layout);
  const tb = layout.townBounds;
  const cx = (tb.minX + tb.maxX) / 2;
  const cz = (tb.minZ + tb.maxZ) / 2;
  const cruiseY = f.max + film.cruiseClearanceM;
  const skim = SKIM_HEIGHT_M;
  const limits: Rect = { minX: tb.minX + BOUNDS_MARGIN_M, maxX: tb.maxX - BOUNDS_MARGIN_M, minZ: tb.minZ + BOUNDS_MARGIN_M, maxZ: tb.maxZ - BOUNDS_MARGIN_M };
  const within = (x: number, z: number): boolean => x >= limits.minX && x <= limits.maxX && z >= limits.minZ && z <= limits.maxZ;
  const roadOk = (r: RoadSegment): boolean => {
    if (!roadIsClear(f, r, film.streetClearanceM)) return false;
    const len = Math.hypot(r.end.x - r.start.x, r.end.z - r.start.z);
    const ux = (r.end.x - r.start.x) / len;
    const uz = (r.end.z - r.start.z) / len;
    const sx = r.start.x + ux * APPROACH_M;
    const sz = r.start.z + uz * APPROACH_M;
    const ex = r.end.x - ux * APPROACH_M;
    const ez = r.end.z - uz * APPROACH_M;
    return (
      within(r.start.x, r.start.z) &&
      within(r.end.x, r.end.z) &&
      lineClear(f, [r.start.x, cruiseY, r.start.z], [sx, skim, sz], skim) &&
      lineClear(f, [ex, skim, ez], [r.end.x, cruiseY, r.end.z], skim)
    );
  };

  const usable = layout.roads.filter(roadOk);
  const mid = (r: RoadSegment): number => Math.hypot((r.start.x + r.end.x) / 2 - cx, (r.start.z + r.end.z) / 2 - cz);
  return usable.map((r) => ({ r, d: mid(r) })).sort((a, b) => a.d - b.d).map((e) => e.r);
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
  // directions, the plan whose two joints turn least. Joint 1: from the ring (near the cathedral) out to the road
  // start, into the road heading. Joint 2: from the road heading toward the perch at the climb point. The street ride
  // ends before the perch, the climb rises toward it at half its side offset, and the drop lands on it ahead.
  const rng = createRng((seed ^ FILM_SALT) >>> 0);
  const pool = rankDescentRoads(layout).slice(0, DESCENT_POOL);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  interface Plan {
    road: RoadSegment;
    sx0: number;
    sz0: number;
    rx: number;
    rz: number;
    rl: number;
    perch: Lot;
    rideEnd: number;
    sky: V3;
    turn: number;
    arc: V3[];
    approach: V3;
  }
  const angleBetween = (ax: number, az: number, bx: number, bz: number): number => {
    const d = Math.hypot(ax, az) * Math.hypot(bx, bz);
    return d > 1e-9 ? Math.acos(Math.min(1, Math.max(-1, (ax * bx + az * bz) / d))) : Math.PI;
  };
  // Wide climbing turn (user spec): from the climb point, swing round a circle of TURN_RADIUS_M at cruise height until
  // the heading points at the perch, then a straight approach and the drop onto the roof. Null when the exit is too
  // close to the perch for the approach or the drop line is blocked.
  const arcToward = (sky: V3, ox: number, oz: number, hx: number, hz: number, l: Lot): { keys: V3[]; approach: V3 } | null => {
    const th0 = Math.atan2(sky[0] - ox, sky[2] - oz);
    const d = Math.cos(th0) * hx - Math.sin(th0) * hz >= 0 ? 1 : -1;
    let bestPhi = -1;
    let bestAlign = -Infinity;
    for (let i = 1; i <= ARC_SAMPLES; i++) {
      const phi = (i / ARC_SAMPLES) * TAU;
      const th = th0 + d * phi;
      const px = ox + TURN_RADIUS_M * Math.sin(th);
      const pz = oz + TURN_RADIUS_M * Math.sin(th + Math.PI / 2);
      // The swept part of the arc must stay inside the town; stop the sweep where it would leave.
      if (!within(px, pz)) break;
      const lx = l.position.x - px;
      const lz = l.position.z - pz;
      const ll = Math.hypot(lx, lz);
      if (ll < APPROACH_M * ARC_EXIT_GAP) continue;
      const align = (d * Math.cos(th) * lx - d * Math.sin(th) * lz) / ll;
      if (align > bestAlign) {
        bestAlign = align;
        bestPhi = phi;
      }
    }
    if (bestPhi < 0 || bestAlign < Math.cos(ARC_EXIT_TOL)) return null;
    // First arc key close after the climb point: it turns the look back down to the town soon after the brief
    // sky tilt (step 5). The rest of the sweep is spaced at most ARC_KEY_STEP.
    const first = Math.min(ARC_FIRST_STEP, bestPhi);
    const rest = bestPhi - first;
    const n = rest > 1e-6 ? Math.max(1, Math.ceil(rest / ARC_KEY_STEP)) : 0;
    const keys: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const th = th0 + d * (first + (n > 0 ? (rest * i) / n : 0));
      keys.push([ox + TURN_RADIUS_M * Math.sin(th), cruiseY, oz + TURN_RADIUS_M * Math.cos(th)]);
    }
    const e = keys[keys.length - 1]!;
    const ax = e[0] - l.position.x;
    const az = e[2] - l.position.z;
    const al = Math.hypot(ax, az) || 1;
    const approach: V3 = [l.position.x + (ax / al) * APPROACH_M, cruiseY, l.position.z + (az / al) * APPROACH_M];
    if (!lineClear(f, approach, perchTop(l), skim)) return null;
    return { keys, approach };
  };
  let best: Plan | null = null;
  for (const r of pool) {
    for (const flip of [false, true]) {
      const a0 = flip ? r.end : r.start;
      const a1 = flip ? r.start : r.end;
      const rl = Math.hypot(a1.x - a0.x, a1.z - a0.z);
      const rx = (a1.x - a0.x) / rl;
      const rz = (a1.z - a0.z) / rl;
      const joint1 = angleBetween(a0.x - cathCx, a0.z - cathCz, rx, rz);
      for (const l of perchCandidates) {
        const sd = (l.position.x - a0.x) * -rz + (l.position.z - a0.z) * rx;
        const side = sd >= 0 ? 1 : -1;
        // Longest street ride whose climb point and wide arc stay inside the town.
        for (let rideEnd = rl - APPROACH_M; rideEnd >= APPROACH_M + MIN_RIDE_M; rideEnd -= RIDE_STEP_M) {
          const aSky = rideEnd + CLIMB_RUN_M;
          const sky: V3 = [a0.x + rx * aSky, cruiseY, a0.z + rz * aSky];
          const ox = sky[0] - rz * side * TURN_RADIUS_M;
          const oz = sky[2] + rx * side * TURN_RADIUS_M;
          if (!within(sky[0], sky[2])) continue;
          const arc = arcToward(sky, ox, oz, rx, rz, l);
          if (!arc) continue;
          // Prefer the smaller entry turn, then the longer ride.
          const score = joint1 - rideEnd * 1e-6;
          if (!best || score < best.turn) best = { road: r, sx0: a0.x, sz0: a0.z, rx, rz, rl, perch: l, rideEnd, sky, turn: score, arc: arc.keys, approach: arc.approach };
          break;
        }
      }
    }
  }
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

  const build = (scale: number): FilmKey[] => {
    const orbitR = half * ORBIT_FRACTION * scale;
    const keys: FilmKey[] = [];
    const framing = wholeMapFraming({ townSize: 2 * half, fovDeg, viewW: film.width1080, viewH: film.height1080, rightInset: 0 });
    const over = clampedXZ([...framing.position] as V3, tb);
    // Opening: at rest high above the clouds and the aircraft, then down into the overview.
    keys.push({ step: 1, position: [over[0], START_HEIGHT_M, over[2]], target: [...framing.target] as V3 });
    keys.push({ step: 1, position: [over[0], cruiseY * OVERVIEW_Y_FACTOR, over[2]], target: [...framing.target] as V3 });
    // Step 2: town orbit, a half turn at cruise height, entered on the tangent that continues the overview heading
    // (from the overview point toward the town centre). Side: the one whose half turn ends nearer the cathedral.
    const townTarget: V3 = [cx, 0, cz];
    const ohx = cx - over[0];
    const ohz = cz - over[2];
    const ohl = Math.hypot(ohx, ohz) || 1;
    const h0x = ohx / ohl;
    const h0z = ohz / ohl;
    const entryAngle = (d: number, hx: number, hz: number): number => (d > 0 ? Math.atan2(-hz, hx) : Math.atan2(hz, -hx));
    const orbitEndFor = (d: number): V3 => circlePos(cx, cz, orbitR, entryAngle(d, h0x, h0z) + d * ORBIT_SWEEP, cruiseY);
    const od = Math.hypot(orbitEndFor(1)[0] - cathCx, orbitEndFor(1)[2] - cathCz) <= Math.hypot(orbitEndFor(-1)[0] - cathCx, orbitEndFor(-1)[2] - cathCz) ? 1 : -1;
    const a0 = entryAngle(od, h0x, h0z);
    for (const a of [a0, a0 + (od * ORBIT_SWEEP) / 2, a0 + od * ORBIT_SWEEP]) {
      keys.push({ step: 2, position: clampedXZ(circlePos(cx, cz, orbitR, a, cruiseY), tb), target: townTarget });
    }
    // Step 3: cathedral ring at cruise height. Entered on the tangent that continues the orbit's exit heading (the
    // candidate entry point most ahead with the least side offset), then swept until the ring heading points at the
    // road entry and that line runs on into the road. The ring shrinks with the orbit, down to MIN_RING_SCALE (it
    // flies above every roof, so a smaller ring cannot clip).
    const orbitEnd = keys[keys.length - 1]!.position;
    const aOut = a0 + od * ORBIT_SWEEP;
    const hx = od * Math.cos(aOut);
    const hz = -od * Math.sin(aOut);
    const rr = ringR * Math.max(MIN_RING_SCALE, scale);
    // Ring centre moved inward when the ring would leave the town (clamping keys bent it into a tight kink).
    const rcx = Math.min(limits.maxX - rr, Math.max(limits.minX + rr, cathCx));
    const rcz = Math.min(limits.maxZ - rr, Math.max(limits.minZ + rr, cathCz));
    const ringAt = (ang: number): V3 => circlePos(rcx, rcz, rr, ang, cruiseY);
    const entryScore = (d: number): number => {
      const q = ringAt(entryAngle(d, hx, hz));
      const dx = q[0] - orbitEnd[0];
      const dz = q[2] - orbitEnd[2];
      const fwd = dx * hx + dz * hz;
      const side = Math.abs(dx * hz - dz * hx);
      return (fwd > 0 ? 0 : -1e6 + fwd) - side;
    };
    const rd = entryScore(1) >= entryScore(-1) ? 1 : -1;
    const aR = entryAngle(rd, hx, hz);
    const qx = sx0;
    const qz = sz0;
    let sweep = Math.PI;
    let bestSweep = -Infinity;
    for (let i = 1; i < RING_SWEEP_SAMPLES; i++) {
      const phi = (i / RING_SWEEP_SAMPLES) * TAU;
      const ang = aR + rd * phi;
      const xp = ringAt(ang);
      const ex0 = rd * Math.cos(ang);
      const ez0 = -rd * Math.sin(ang);
      const lx = qx - xp[0];
      const lz = qz - xp[2];
      const ll = Math.hypot(lx, lz) || 1;
      const score = (ex0 * lx + ez0 * lz) / ll + (lx * rx + lz * rz) / ll;
      if (score > bestSweep) {
        bestSweep = score;
        sweep = phi;
      }
    }
    const ringKeys = Math.max(2, Math.ceil(sweep / (Math.PI / 2)));
    for (let i = 0; i <= ringKeys; i++) {
      keys.push({ step: 3, position: ringAt(aR + (rd * sweep * i) / ringKeys), target: focus });
    }
    // Step 4: cruise to the approach point, drop onto the street, ride to the far end.
    keys.push({ step: 4, position: [sx - rx * APPROACH_M, cruiseY, sz - rz * APPROACH_M], target: [ex, skim * 0.5, ez] });
    keys.push({ step: 4, position: [sx, skim, sz], target: [ex, skim * 0.5, ez] });
    keys.push({ step: 4, position: [ex, skim, ez], target: [ex + rx * DESCENT_LOOK_M, skim * 0.5, ez + rz * DESCENT_LOOK_M] });
    // Step 5: climb and tilt toward the sun or moon. A mid-climb key still looks level along the road, so the sky
    // tilt is a brief peak at the climb point rather than the whole climb.
    const midY = (skim + skyPos[1]) / 2;
    keys.push({ step: 5, position: [(ex + skyPos[0]) / 2, midY, (ez + skyPos[2]) / 2], target: [skyPos[0] + rx * DESCENT_LOOK_M, midY, skyPos[2] + rz * DESCENT_LOOK_M] });
    keys.push({ step: 5, position: skyPos, target: [skyPos[0] + skyDir[0] * LOOK_DIST_M, cruiseY + skyDir[1] * LOOK_DIST_M, skyPos[2] + skyDir[2] * LOOK_DIST_M] });
    // Step 6: cruise over to the perch approach, descend onto the roof.
    for (const q of arcKeys) keys.push({ step: 5, position: q, target: perchTarget });
    keys.push({ step: 6, position: perchApproach, target: perchTarget });
    // Midpoint of the final drop: the spline bulges between the approach and the perch, so the knot keeps
    // the bulge above the roofs beside the perch (the height lift would otherwise move the perch itself).
    const from = perchApproach;
    const mx = (from[0] + perchPos[0]) / 2;
    const mz = (from[2] + perchPos[2]) / 2;
    const my = Math.max((from[1] + perchPos[1]) / 2, floorAt(f, mx, mz) + SKIM_HEIGHT_M);
    keys.push({ step: 6, position: [mx, my, mz], target: perchTarget });
    keys.push({ step: 6, position: perchPos, target: perchTarget });
    return keys;
  };

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

function clampedXZ(p: V3, b: Rect): V3 {
  const c = clampToBounds(p[0], p[2], b, BOUNDS_MARGIN_M);
  return [c.x, p[1], c.z];
}
