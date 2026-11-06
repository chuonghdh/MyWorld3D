// Film look track and clip planes (pure). The look direction of the auto film is smoothed and rate limited in film
// time, so the view never swings faster than MAX_LOOK_DEG_PER_S (a fast pan reads as a jolt on screen). The camera
// position is untouched. No React, no randomness, no wall-clock time.
import { trafficLife } from '../config/tuning';
import { clipPlanes, type V3 } from './cameraMath';
import type { FilmPose } from './filmPath';

/** Fastest turn of the film look direction, degrees per second. Geometry constant, not a designer knob. */
export const MAX_LOOK_DEG_PER_S = 30;
/** Grid rate of the look track, samples per film second. */
const LOOK_RATE_HZ = 120;
/** Box smoothing window of the look direction, film seconds, and its passes. */
const LOOK_SMOOTH_S = 1;
const LOOK_SMOOTH_PASSES = 2;

function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-12 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, -1];
}

/** Turns unit vector a toward unit vector b by at most maxRad (spherical interpolation). */
function rotateTowards(a: V3, b: V3, maxRad: number): V3 {
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const ang = Math.acos(dot);
  if (ang <= maxRad || ang < 1e-9) return [b[0], b[1], b[2]];
  const s = Math.sin(ang);
  const wa = Math.sin(ang - maxRad) / s;
  const wb = Math.sin(maxRad) / s;
  return normalize([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]);
}

/**
 * Wraps a raw pose sampler with a smoothed, rate-limited look direction. The returned sampler gives the same
 * position, and a target at the same distance whose direction turns at most MAX_LOOK_DEG_PER_S. The first and last
 * poses keep their raw target exactly (the smoothing fades out at both ends; the limiter is anchored at the end).
 */
export function buildLookTrack(raw: (t: number, out: FilmPose) => void, flight: number): (t: number, out: FilmPose) => void {
  const n = Math.max(2, Math.ceil(flight * LOOK_RATE_HZ) + 1);
  const dt = flight / (n - 1);
  const pose: FilmPose = { position: [0, 0, 0], target: [0, 0, 0] };
  const rawDir: V3[] = [];
  for (let i = 0; i < n; i++) {
    raw(i * dt, pose);
    const p = pose.position;
    const g = pose.target;
    rawDir.push(normalize([g[0] - p[0], g[1] - p[1], g[2] - p[2]]));
  }

  // Box smoothing with weights that fade to zero at both ends (the ends keep their raw look).
  const h = Math.max(1, Math.round(LOOK_SMOOTH_S / 2 / dt));
  let cur = rawDir.map((d) => [d[0], d[1], d[2]] as V3);
  for (let pass = 0; pass < LOOK_SMOOTH_PASSES; pass++) {
    const next: V3[] = [];
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let j = i - h; j <= i + h; j++) {
        const d = cur[Math.min(n - 1, Math.max(0, j))]!;
        sx += d[0];
        sy += d[1];
        sz += d[2];
      }
      const avg = normalize([sx, sy, sz]);
      const r = Math.min(1, Math.min(i, n - 1 - i) / (2 * h));
      const w = r * r * (3 - 2 * r);
      const c = cur[i]!;
      next.push(normalize([c[0] + (avg[0] - c[0]) * w, c[1] + (avg[1] - c[1]) * w, c[2] + (avg[2] - c[2]) * w]));
    }
    cur = next;
  }

  // Rate limit: forward from the start, then backward from the raw end look, so every step turns at most maxStep.
  const maxStep = ((MAX_LOOK_DEG_PER_S * Math.PI) / 180) * dt;
  const fwd: V3[] = [cur[0]!];
  for (let i = 1; i < n; i++) fwd.push(rotateTowards(fwd[i - 1]!, cur[i]!, maxStep));
  const look: V3[] = new Array<V3>(n);
  look[n - 1] = rawDir[n - 1]!;
  for (let i = n - 2; i >= 0; i--) look[i] = rotateTowards(look[i + 1]!, fwd[i]!, maxStep);

  return (t: number, out: FilmPose): void => {
    raw(t, out);
    const f = Math.min(n - 1, Math.max(0, t / dt));
    const i = Math.min(n - 2, Math.floor(f));
    const u = f - i;
    const a = look[i]!;
    const b = look[i + 1]!;
    const d = normalize([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]);
    const p = out.position;
    const g = out.target;
    const dist = Math.hypot(g[0] - p[0], g[1] - p[1], g[2] - p[2]);
    const ra = rawDir[i]!;
    const rb = rawDir[i + 1]!;
    const r = normalize([ra[0] + (rb[0] - ra[0]) * u, ra[1] + (rb[1] - ra[1]) * u, ra[2] + (rb[2] - ra[2]) * u]);
    // Offset from the raw target, so the ends (where look = raw) keep their raw target exactly.
    g[0] += dist * (d[0] - r[0]);
    g[1] += dist * (d[1] - r[1]);
    g[2] += dist * (d[2] - r[2]);
  };
}

/**
 * Film clip planes from the camera height above the route floor (risk 15): near from the nearest surface (the orbit
 * rule applied to that height), capped at half the carrier bird's closest distance so the bird is never clipped;
 * far from the same rule, at least 1200 m.
 */
export function filmClipPlanes(heightAboveFloor: number): { near: number; far: number } {
  const c = clipPlanes(Math.max(0, heightAboveFloor));
  return { near: Math.min(c.near, trafficLife.filmBirdMinDistanceM / 2), far: c.far };
}
