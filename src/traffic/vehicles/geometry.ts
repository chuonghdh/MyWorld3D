// Pure geometry for lane paths: fillets, extension, arc length, poses, junction arms. No state.

import type { CityLayout, TrafficPath } from '../../city/layout';
import type { Vec2 } from '../../core/types';
import type { PathModel, Pose } from './types';
import { FILLET_MAX, FILLET_STEPS } from './constants';

/**
 * Rounds the corners of a waypoint polyline with quadratic arcs so vehicles can turn smoothly.
 * Straight runs are returned unchanged. cornerIdx lists the middle sample of each arc.
 */
export function filletPath(wp: readonly Vec2[]): { points: Vec2[]; cornerIdx: { index: number; angle: number }[] } {
  const points: Vec2[] = [{ x: wp[0].x, z: wp[0].z }];
  const cornerIdx: { index: number; angle: number }[] = [];
  for (let i = 1; i < wp.length - 1; i++) {
    const a = wp[i - 1];
    const p = wp[i];
    const b = wp[i + 1];
    const d1 = Math.hypot(p.x - a.x, p.z - a.z);
    const d2 = Math.hypot(b.x - p.x, b.z - p.z);
    if (d1 < 1e-6 || d2 < 1e-6) continue;
    const u1x = (p.x - a.x) / d1, u1z = (p.z - a.z) / d1;
    const u2x = (b.x - p.x) / d2, u2z = (b.z - p.z) / d2;
    const cosA = Math.min(1, Math.max(-1, u1x * u2x + u1z * u2z));
    const angle = Math.acos(cosA);
    if (angle < 0.12) {
      points.push({ x: p.x, z: p.z });
      continue;
    }
    const t = Math.min(FILLET_MAX, Math.min(d1, d2) * 0.45);
    const q0x = p.x - u1x * t, q0z = p.z - u1z * t;
    const q1x = p.x + u2x * t, q1z = p.z + u2z * t;
    for (let k = 0; k <= FILLET_STEPS; k++) {
      const f = k / FILLET_STEPS;
      const w0 = (1 - f) * (1 - f), w1 = 2 * f * (1 - f), w2 = f * f;
      if (k === FILLET_STEPS / 2) cornerIdx.push({ index: points.length, angle });
      points.push({ x: w0 * q0x + w1 * p.x + w2 * q1x, z: w0 * q0z + w1 * p.z + w2 * q1z });
    }
  }
  const last = wp[wp.length - 1];
  points.push({ x: last.x, z: last.z });
  return { points, cornerIdx };
}

/** Arc length along the polyline of the point closest to p. */
/** Adds a point `ext` metres beyond each end of the polyline, in the direction the path is heading. */
/** Extends a polyline by extStart before its first point and extEnd after its last (0 leaves that end as is). */
export function extendWaypoints(w: readonly Vec2[], extStart: number, extEnd: number): Vec2[] {
  if (w.length < 2 || (!(extStart > 0) && !(extEnd > 0))) return w.slice();
  const first = w[0];
  const second = w[1];
  const last = w[w.length - 1];
  const before = w[w.length - 2];
  const l0 = Math.hypot(first.x - second.x, first.z - second.z) || 1;
  const l1 = Math.hypot(last.x - before.x, last.z - before.z) || 1;
  const out: Vec2[] = [];
  if (extStart > 0) out.push({ x: first.x + ((first.x - second.x) / l0) * extStart, z: first.z + ((first.z - second.z) / l0) * extStart });
  out.push(...w);
  if (extEnd > 0) out.push({ x: last.x + ((last.x - before.x) / l1) * extEnd, z: last.z + ((last.z - before.z) / l1) * extEnd });
  return out;
}

/**
 * Which ends of each lane path are open. An end is open when it lies on the outermost junction of its line (the
 * town grid's first or last cross street), so the road goes on to the map edge. A block merge cuts a street at an
 * inner junction: that end is closed. Without merges every end is open.
 */
export function pathOpenness(layout: CityLayout, orientation: ReadonlyMap<string, 'horizontal' | 'vertical'>): Map<TrafficPath, { start: boolean; end: boolean }> {
  const ext = { vertical: { min: Infinity, max: -Infinity }, horizontal: { min: Infinity, max: -Infinity } };
  const along = (p: Vec2, o: 'horizontal' | 'vertical'): number => (o === 'vertical' ? p.z : p.x);
  for (const path of layout.trafficPaths) {
    if (path.waypoints.length < 2) continue;
    const o = orientation.get(path.roadId) ?? 'vertical';
    for (const p of [path.waypoints[0], path.waypoints[path.waypoints.length - 1]]) {
      ext[o].min = Math.min(ext[o].min, along(p, o));
      ext[o].max = Math.max(ext[o].max, along(p, o));
    }
  }
  const out = new Map<TrafficPath, { start: boolean; end: boolean }>();
  for (const path of layout.trafficPaths) {
    if (path.waypoints.length < 2) continue;
    const o = orientation.get(path.roadId) ?? 'vertical';
    const atEdge = (p: Vec2): boolean => Math.abs(along(p, o) - ext[o].min) < 1e-6 || Math.abs(along(p, o) - ext[o].max) < 1e-6;
    out.set(path, { start: atEdge(path.waypoints[0]), end: atEdge(path.waypoints[path.waypoints.length - 1]) });
  }
  return out;
}

/** Arm bit for a heading (atan2(dirX, dirZ), 0 = +Z): 1 north (+Z), 2 east (+X), 4 south, 8 west. */
export function armBit(heading: number): number {
  const h = wrapAngle(heading);
  if (Math.abs(h) <= Math.PI / 4) return 1;
  if (h > Math.PI / 4 && h < (3 * Math.PI) / 4) return 2;
  if (h < -Math.PI / 4 && h > (-3 * Math.PI) / 4) return 8;
  return 4;
}

export function projectArc(points: readonly Vec2[], cum: readonly number[], p: Vec2): number {
  return projectArcDist(points, cum, p).s;
}

/** Arc length of the point on the polyline nearest to p, and the distance from p to that point. */
export function projectArcDist(points: readonly Vec2[], cum: readonly number[], p: Vec2): { s: number; d: number } {
  let best = Infinity;
  let bestS = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const len2 = abx * abx + abz * abz;
    const t = len2 > 0 ? clamp01(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2) : 0;
    const qx = a.x + abx * t;
    const qz = a.z + abz * t;
    const d2 = (p.x - qx) * (p.x - qx) + (p.z - qz) * (p.z - qz);
    if (d2 < best) {
      best = d2;
      bestS = cum[i - 1] + Math.sqrt(len2) * t;
    }
  }
  return { s: bestS, d: Math.sqrt(best) };
}

export function poseAt(pm: PathModel, s: number, out: Pose): void {
  const x = Math.min(Math.max(s, 0), pm.length);
  let i = 1;
  while (i < pm.cum.length - 1 && pm.cum[i] < x) i++;
  const a = pm.points[i - 1];
  const b = pm.points[i];
  const segLen = pm.cum[i] - pm.cum[i - 1];
  const t = segLen > 0 ? (x - pm.cum[i - 1]) / segLen : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  out.x = a.x + dx * t;
  out.z = a.z + dz * t;
  out.heading = Math.atan2(dx, dz);
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
