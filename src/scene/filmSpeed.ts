// Film speed profile (pure): how fast the camera moves along the sampled route. Speed follows a cap per point (the
// caller's height cap); smoothness comes from the rounded route, not from slowing in bends. It starts and ends at rest,
// ramps at the caller's acceleration per point, and is then scaled so the flight lasts exactly the flight time. No React, no randomness.
// The turn radius is still measured, for reporting.
import type { V3 } from './cameraMath';

/** Half baseline of the turn-radius estimate, metres: the turn is measured over twice this arc. */
const RADIUS_BASE_M = 2;
/** Radius reported for a straight stretch, metres. */
const STRAIGHT_RADIUS_M = 1e6;

export interface Timeline {
  /** Film seconds at each route sample (0 at the first, the flight time at the last). */
  times: Float64Array;
  /** Speed at each route sample after scaling, m/s. */
  speeds: Float64Array;
  /** Largest speed on the route, m/s. */
  peak: number;
  /** Smallest turn radius on the route, metres. */
  minRadius: number;
  /** Flight time of the capped profile before it is scaled to the flight, seconds. */
  rawSeconds: number;
  /** Route arc length (in the `arc` table passed in) at film time t, clamped to the flight. */
  arcAt(t: number): number;
}

/**
 * Builds the time table for a sampled route. `pts` are the final camera positions; `arc` is the route's own arc table
 * (the one routePose reads), used only to answer arcAt. `capAt` is the speed cap at a point (m/s). When the capped profile is shorter than the flight, it is slowed to fit; when it is longer,
 * the speeds rise above the caps (`rawSeconds` > flight tells the caller).
 */
export function buildTimeline(
  pts: readonly V3[],
  arc: Float64Array,
  flight: number,
  capAt: (p: V3) => number,
  /** Largest speed change per second at a point, m/s^2 (the start and end ramps). */
  accelAt: (p: V3) => number,
): Timeline {
  const n = pts.length;
  const ds = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    ds[i] = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const mean = n > 1 ? arc[n - 1]! / (n - 1) : 1;
  const m = Math.max(1, Math.round(RADIUS_BASE_M / (mean || 1)));

  // Turn radius from the angle between the chords before and after each sample.
  const radius = new Float64Array(n).fill(STRAIGHT_RADIUS_M);
  let minRadius = STRAIGHT_RADIUS_M;
  for (let i = m; i < n - m; i++) {
    const p = pts[i]!;
    const a = pts[i - m]!;
    const b = pts[i + m]!;
    const ux = p[0] - a[0];
    const uy = p[1] - a[1];
    const uz = p[2] - a[2];
    const vx = b[0] - p[0];
    const vy = b[1] - p[1];
    const vz = b[2] - p[2];
    const lu = Math.hypot(ux, uy, uz);
    const lv = Math.hypot(vx, vy, vz);
    if (lu < 1e-9 || lv < 1e-9) continue;
    const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy + uz * vz) / (lu * lv)));
    const ang = Math.acos(cos);
    if (ang < 1e-9) continue;
    const r = (lu + lv) / 2 / ang;
    radius[i] = r;
    if (r < minRadius) minRadius = r;
  }

  // Speed limits: the cap, then ramps (forward and backward passes), at rest at both ends.
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = capAt(pts[i]!);
  v[0] = 0;
  v[n - 1] = 0;
  for (let i = 1; i < n; i++) v[i] = Math.min(v[i]!, Math.sqrt(v[i - 1]! ** 2 + 2 * accelAt(pts[i]!) * ds[i]!));
  for (let i = n - 2; i >= 0; i--) v[i] = Math.min(v[i]!, Math.sqrt(v[i + 1]! ** 2 + 2 * accelAt(pts[i]!) * ds[i + 1]!));

  const times = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const sum = v[i - 1]! + v[i]!;
    times[i] = times[i - 1]! + (sum > 1e-12 ? (2 * ds[i]!) / sum : 0);
  }
  const raw = times[n - 1]! || 1;
  const k = raw / flight;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    times[i] = times[i]! / k;
    v[i] = v[i]! * k;
    if (v[i]! > peak) peak = v[i]!;
  }
  times[n - 1] = flight;

  const arcAt = (t: number): number => {
    if (t <= 0) return 0;
    if (t >= flight) return arc[n - 1]!;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! <= t) lo = mid;
      else hi = mid;
    }
    const span = times[hi]! - times[lo]!;
    const f = span > 0 ? (t - times[lo]!) / span : 0;
    return arc[lo]! + (arc[hi]! - arc[lo]!) * f;
  };

  return { times, speeds: v, peak, minRadius, rawSeconds: raw, arcAt };
}
