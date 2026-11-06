// Street decor geometry helpers: road frames, free along-road ranges, oriented-rectangle distances, obstacles.
import type { CityLayout, RoadSegment } from '../city/layout';
import type { DecorSolid } from './decorTypes';

// ---- Geometry helpers ----------------------------------------------------------------------------

export interface Circle { x: number; z: number; r: number }

export interface Frame {
  road: RoadSegment;
  vertical: boolean;
  /** Coordinate of the centre line (x for vertical roads, z for horizontal). */
  v: number;
  u0: number;
  u1: number;
  half: number;
  sw: number;
}

export function frameOf(road: RoadSegment): Frame {
  const vertical = road.orientation === 'vertical';
  const a = vertical ? road.start.z : road.start.x;
  const b = vertical ? road.end.z : road.end.x;
  return {
    road,
    vertical,
    v: vertical ? road.start.x : road.start.z,
    u0: Math.min(a, b),
    u1: Math.max(a, b),
    half: road.width / 2,
    sw: road.sidewalkWidth,
  };
}

export function toWorld(f: Frame, along: number, lateral: number): { x: number; z: number } {
  return f.vertical ? { x: f.v + lateral, z: along } : { x: along, z: f.v + lateral };
}

/** Along-road ranges of `f` that are free of crossing roads plus `edge` metres beyond their sidewalks. */
export function freeSegments(f: Frame, frames: readonly Frame[], edge: number): { a: number; b: number }[] {
  const cuts: { a: number; b: number }[] = [];
  for (const o of frames) {
    if (o.vertical === f.vertical) continue;
    if (o.v < f.u0 - 0.01 || o.v > f.u1 + 0.01) continue;
    const reach = o.half + o.sw + edge;
    cuts.push({ a: o.v - reach, b: o.v + reach });
  }
  cuts.sort((p, q) => p.a - q.a);
  const out: { a: number; b: number }[] = [];
  let cur = f.u0;
  for (const c of cuts) {
    if (c.a > cur) out.push({ a: cur, b: c.a });
    cur = Math.max(cur, c.b);
  }
  if (f.u1 > cur) out.push({ a: cur, b: f.u1 });
  return out.filter((s) => s.b - s.a > 1);
}

/** Distance from a circle centre to an oriented rectangle (0 when inside). */
export function rectCircleDistance(s: Pick<DecorSolid, 'x' | 'z' | 'yaw' | 'hx' | 'hz'>, c: Circle): number {
  const dx = c.x - s.x, dz = c.z - s.z;
  const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  const lx = dx * cs - dz * sn;
  const lz = dx * sn + dz * cs;
  return Math.hypot(Math.max(Math.abs(lx) - s.hx, 0), Math.max(Math.abs(lz) - s.hz, 0));
}

/** The four world corners of a solid. */
export function solidCorners(s: Pick<DecorSolid, 'x' | 'z' | 'yaw' | 'hx' | 'hz'>): { x: number; z: number }[] {
  const cs = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  const out: { x: number; z: number }[] = [];
  for (const [ax, az] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const lx = ax * s.hx, lz = az * s.hz;
    out.push({ x: s.x + lx * cs + lz * sn, z: s.z - lx * sn + lz * cs });
  }
  return out;
}

/** Existing furniture the new solids must keep clear of (radii cover each object's footprint). */
export function obstaclesOf(layout: CityLayout): Circle[] {
  const out: Circle[] = [];
  layout.lamps.forEach((lamp, i) => {
    out.push({ x: lamp.position.x, z: lamp.position.z, r: 0.5 });
    // Same bin rule as furniture.ts: beside every third lamp, 1.2 m along the curb.
    if (i % 3 === 1) {
      out.push({ x: lamp.position.x + Math.cos(lamp.facing) * 1.2, z: lamp.position.z - Math.sin(lamp.facing) * 1.2, r: 0.4 });
    }
  });
  for (const t of layout.streetTrees) out.push({ x: t.position.x, z: t.position.z, r: t.setting === 'street' ? 1.0 : 0.8 });
  for (const b of layout.benches) out.push({ x: b.position.x, z: b.position.z, r: 1.0 });
  for (const cw of layout.crosswalks) {
    const walkX = cw.orientation === 'horizontal';
    for (const end of [-1, 1]) {
      for (const lat of [-1, 1]) {
        const along = end * (cw.length / 2 + 0.55);
        const across = lat * (cw.width / 2 + 0.35);
        out.push({ x: cw.center.x + (walkX ? along : across), z: cw.center.z + (walkX ? across : along), r: 0.3 });
      }
    }
  }
  return out;
}
