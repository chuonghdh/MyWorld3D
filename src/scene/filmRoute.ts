import type { FilmKey, FilmPose } from './filmPath';
import type { V3 } from './cameraMath';

// Route sampling (pure): uniform cubic B-spline through the keys, lifted above the height floor, and arc-length lookup.

/** Camera height above the height floor (road or roof top), metres. Clears buses (3.0 m), trucks (3.22 m) and vans (2.45 m) at street level. Not a designer knob. */
export const SKIM_HEIGHT_M = 3.5;
const SPLINE_STEPS = 400;
/** Height lift is spread over this path length either side, metres. */
const LIFT_SPREAD_M = 20;
/** Horizontal smoothing window (arc length, metres) and pass count: no bend tighter than about 10 m radius. */
const SMOOTH_WINDOW_M = 15;
const SMOOTH_PASSES = 3;
/** Even sample spacing of the route polyline, metres. */
const RESAMPLE_M = 0.25;
/** Arc length over which the lift fades to the bare need before the last key, metres. */
const END_TAPER_M = 10;

export interface Route {
  keys: FilmKey[];
  /** Sampled camera path (after the height limiter) and its look targets, one per sample. */
  pts: V3[];
  tgts: V3[];
  /** Arc length at each sample, metres. */
  arc: Float64Array;
  length: number;
}

/** Two copies of the first and last key on each end, so the B-spline starts and ends exactly on them. */
function padControls(P: readonly V3[]): V3[] {
  const first = P[0]!;
  const last = P[P.length - 1]!;
  return [first, first, ...P, last, last];
}

/** Uniform cubic B-spline segment j (controls j..j+3) at u in [0, 1]. */
function bsplinePoint(C: readonly V3[], j: number, u: number, out: V3): void {
  const u2 = u * u;
  const u3 = u2 * u;
  const w0 = ((1 - u) * (1 - u) * (1 - u)) / 6;
  const w1 = (3 * u3 - 6 * u2 + 4) / 6;
  const w2 = (-3 * u3 + 3 * u2 + 3 * u + 1) / 6;
  const w3 = u3 / 6;
  const a = C[j]!;
  const b = C[j + 1]!;
  const c = C[j + 2]!;
  const d = C[j + 3]!;
  out[0] = w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * d[0];
  out[1] = w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * d[1];
  out[2] = w0 * a[2] + w1 * b[2] + w2 * c[2] + w3 * d[2];
}

/**
 * Samples the B-spline through the keys, then lifts it above the height floor. The lift is the shortfall
 * (floor of the point and its neighbours + skim height, minus the sample height), spread by a max filter and a box
 * blur, so the height never steps and never drops below the floor. Lifts only raise the path.
 */
export function buildRoute(
  keys: FilmKey[],
  floor: (x: number, z: number) => number,
  /** Samples that keep their horizontal position (descent street, low flight near walls). Endpoints are always kept. */
  pinned: (p: V3) => boolean = () => false,
): Route {
  const cp = padControls(keys.map((k) => k.position));
  // Look: spline yaw, pitch and look distance as numbers (yaw unwrapped), then rebuild the target. A spline of target
  // points lets a far target (the sky look, 300 m out) drag the view; a spline of unit vectors points straight up when
  // two keys look in nearly opposite directions.
  const angles: V3[] = [];
  for (const k of keys) {
    const dx = k.target[0] - k.position[0];
    const dy = k.target[1] - k.position[1];
    const dz = k.target[2] - k.position[2];
    const dist = Math.hypot(dx, dy, dz) || 1;
    let yaw = Math.atan2(dx, dz);
    const prev = angles[angles.length - 1];
    if (prev) while (yaw - prev[0] > Math.PI) yaw -= 2 * Math.PI;
    if (prev) while (yaw - prev[0] < -Math.PI) yaw += 2 * Math.PI;
    angles.push([yaw, Math.asin(Math.max(-1, Math.min(1, dy / dist))), dist]);
  }
  const ca = padControls(angles);
  const segs = cp.length - 3;
  const pts: V3[] = [];
  const tgts: V3[] = [];
  for (let seg = 0; seg < segs; seg++) {
    for (let k = 0; k <= SPLINE_STEPS; k++) {
      if (seg > 0 && k === 0) continue; // shared with the previous segment's last sample
      const u = k / SPLINE_STEPS;
      const p: V3 = [0, 0, 0];
      const a: V3 = [0, 0, 0];
      bsplinePoint(cp, seg, u, p);
      bsplinePoint(ca, seg, u, a);
      const cpch = Math.cos(a[1]);
      pts.push(p);
      tgts.push([p[0] + Math.sin(a[0]) * cpch * a[2], p[1] + Math.sin(a[1]) * a[2], p[2] + Math.cos(a[0]) * cpch * a[2]]);
    }
  }
  // Drop repeated samples (collapsed end segments from the padded controls): zero-length steps give a random heading.
  {
    let w = 1;
    for (let i = 1; i < pts.length; i++) {
      const q = pts[w - 1]!;
      const c = pts[i]!;
      if (Math.hypot(c[0] - q[0], c[1] - q[1], c[2] - q[2]) > 1e-6) {
        pts[w] = c;
        tgts[w] = tgts[i]!;
        w++;
      }
    }
    pts.length = w;
    tgts.length = w;
  }
  const even = resampleUniform(pts, tgts, RESAMPLE_M);
  pts.length = 0;
  tgts.length = 0;
  pts.push(...even.pts);
  tgts.push(...even.tgts);
  smoothHorizontal(pts, pinned, RESAMPLE_M);
  const n = pts.length;
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    arc[i] = arc[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const length = arc[n - 1]!;
  // Shortfall per sample, against the floor of the point and of its neighbours.
  const need = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (let j = Math.max(0, i - 1); j <= Math.min(n - 1, i + 1); j++) h = Math.max(h, floor(pts[j]![0], pts[j]![2]));
    need[i] = Math.max(0, h + SKIM_HEIGHT_M - pts[i]![1]);
  }
  const spacing = length / Math.max(1, n - 1) || 1;
  const k = Math.max(1, Math.ceil(LIFT_SPREAD_M / spacing));
  // Max filter (radius 3k), then three box blurs (radius k): the lift is C1 (no slope steps) and never below need.
  let lift = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = Math.max(0, i - 3 * k); j <= Math.min(n - 1, i + 3 * k); j++) m = Math.max(m, need[j]!);
    lift[i] = m;
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float64Array(n);
    const prefix = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + lift[i]!;
    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - k);
      const hi = Math.min(n - 1, i + k);
      next[i] = (prefix[hi + 1]! - prefix[lo]!) / (hi - lo + 1);
    }
    lift = next;
  }


  // Near the end the spread lift fades to the bare need (0 at the perch, which clears its roof by design), so the
  // path ends on the last key; the lift never drops below the need.
  for (let i = 0; i < n; i++) {
    const d = length - arc[i]!;
    if (d >= END_TAPER_M) continue;
    const r = d / END_TAPER_M;
    lift[i] = Math.max(need[i]!, lift[i]! * r * r * (3 - 2 * r));
  }
  for (let i = 0; i < n; i++) pts[i]![1] += lift[i]!;
  return { keys, pts, tgts, arc, length };
}

/** Resamples the polyline (and its look targets) at a uniform arc spacing, so filters see evenly spaced samples. */
function resampleUniform(pts: V3[], tgts: V3[], step: number): { pts: V3[]; tgts: V3[] } {
  const n = pts.length;
  const arc = new Float64Array(n);
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
  const total = arc[n - 1]!;
  const m = Math.max(2, Math.ceil(total / step) + 1);
  const outP: V3[] = [];
  const outT: V3[] = [];
  let j = 0;
  for (let i = 0; i < m; i++) {
    const sArc = (total * i) / (m - 1);
    while (j < n - 2 && arc[j + 1]! < sArc) j++;
    const span = arc[j + 1]! - arc[j]!;
    const t = span > 0 ? Math.min(1, Math.max(0, (sArc - arc[j]!) / span)) : 0;
    const a = pts[j]!;
    const b = pts[j + 1]!;
    const ta = tgts[j]!;
    const tb = tgts[j + 1]!;
    outP.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    outT.push([ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t, ta[2] + (tb[2] - ta[2]) * t]);
  }
  outP[m - 1] = [...pts[n - 1]!] as V3;
  outT[m - 1] = [...tgts[n - 1]!] as V3;
  return { pts: outP, tgts: outT };
}

/**
 * Box filter of x and z over SMOOTH_WINDOW_M of arc (evenly spaced samples), SMOOTH_PASSES times, before the lift.
 * Rounds tight hooks the spline makes where the control polygon turns sharply. Pinned samples and both endpoints
 * keep their position; the window repeats the edge sample at the ends.
 */
function smoothHorizontal(pts: V3[], pinned: (p: V3) => boolean, step: number): void {
  const n = pts.length;
  if (n < 3) return;
  const keep = new Uint8Array(n);
  for (let i = 0; i < n; i++) keep[i] = pinned(pts[i]!) ? 1 : 0;
  keep[0] = 1;
  keep[n - 1] = 1;
  const h = Math.max(1, Math.round(SMOOTH_WINDOW_M / 2 / step));
  // Weight ramps from 0 at a kept sample to 1 one window away, so the smoothed line joins the kept one without a kink.
  const span = 2 * h;
  const dist = new Float64Array(n).fill(Infinity);
  for (let i = 0, last = -Infinity; i < n; i++) {
    if (keep[i]) last = i;
    dist[i] = i - last;
  }
  for (let i = n - 1, next = Infinity; i >= 0; i--) {
    if (keep[i]) next = i;
    dist[i] = Math.min(dist[i]!, next - i);
  }
  const weight = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const r = Math.min(1, dist[i]! / span);
    weight[i] = r * r * (3 - 2 * r);
  }
  const xs = new Float64Array(n);
  const zs = new Float64Array(n);
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    for (let i = 0; i < n; i++) {
      xs[i] = pts[i]![0];
      zs[i] = pts[i]![2];
    }
    let sx = 0;
    let sz = 0;
    for (let j = -h; j <= h; j++) {
      const c = Math.min(n - 1, Math.max(0, j));
      sx += xs[c]!;
      sz += zs[c]!;
    }
    for (let i = 0; i < n; i++) {
      const w = weight[i]!;
      if (w > 0) {
        pts[i]![0] = xs[i]! + (sx / (2 * h + 1) - xs[i]!) * w;
        pts[i]![2] = zs[i]! + (sz / (2 * h + 1) - zs[i]!) * w;
      }
      const out = Math.min(n - 1, Math.max(0, i - h));
      const inn = Math.min(n - 1, Math.max(0, i + h + 1));
      sx += xs[inn]! - xs[out]!;
      sz += zs[inn]! - zs[out]!;
    }
  }
}

/** Fractional sample index f for arc length s (binary search in the arc table). */
function sampleAt(arc: Float64Array, s: number): number {
  let lo = 0;
  let hi = arc.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const span = arc[hi]! - arc[lo]!;
  return span > 0 ? lo + (s - arc[lo]!) / span : lo;
}

export function routePose(r: Route, s: number, out: FilmPose): void {
  const f = sampleAt(r.arc, Math.min(Math.max(s, 0), r.length));
  const i = Math.min(r.pts.length - 2, Math.max(0, Math.floor(f)));
  const t = Math.min(1, Math.max(0, f - i));
  const a = r.pts[i]!;
  const b = r.pts[i + 1]!;
  const ta = r.tgts[i]!;
  const tb = r.tgts[i + 1]!;
  for (let k = 0; k < 3; k++) {
    out.position[k] = a[k]! + (b[k]! - a[k]!) * t;
    out.target[k] = ta[k]! + (tb[k]! - ta[k]!) * t;
  }
}

