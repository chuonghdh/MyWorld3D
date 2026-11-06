// Descent road ranking and the finale plan of the auto film path: which clear road the film drops onto, which house
// roof it perches on, and the wide climbing arc between them (steps 4 to 6). Pure geometry, no randomness.
import { film } from '../config/tuning';
import type { CityLayout, Lot, Rect, RoadSegment } from '../city/layout';
import type { V3 } from './cameraMath';
import { APPROACH_M, buildField, lineClear, roadIsClear, type HeightField } from './filmPathField';
import { SKIM_HEIGHT_M } from './filmRoute';
import {
  ARC_EXIT_GAP,
  ARC_EXIT_TOL,
  ARC_FIRST_STEP,
  ARC_KEY_STEP,
  ARC_SAMPLES,
  BOUNDS_MARGIN_M,
  CLIMB_RUN_M,
  MIN_RIDE_M,
  RIDE_STEP_M,
  TAU,
  TURN_RADIUS_M,
} from './filmPathConsts';

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

/** One candidate finale: descent road, climb point, perch lot and the arc flown between them. */
export interface Plan {
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

export interface PlanInput {
  f: HeightField;
  /** Descent roads to try (already shuffled by the seed). */
  pool: readonly RoadSegment[];
  perchCandidates: readonly Lot[];
  cathCx: number;
  cathCz: number;
  cruiseY: number;
  within: (x: number, z: number) => boolean;
  /** Roof-top point above a lot (the perch pose). */
  perchTop: (l: Lot) => V3;
}

/**
 * Searches the descent road, direction, perch and street ride end. The plan whose two joints turn least wins.
 * Returns null when no combination fits; the caller then uses its fallback.
 */
export function planFinale(p: PlanInput): Plan | null {
  const { f, pool, perchCandidates, cathCx, cathCz, cruiseY, within, perchTop } = p;
  const skim = SKIM_HEIGHT_M;
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
  return best;
}
