// Real arms of a junction, from the road pieces of a layout. Pure TypeScript.
//
// Same rule as the traffic arm mask (src/traffic/vehicles.ts buildArms): an arm exists where a road piece carries on
// past the junction centre, or where it ends at the junction and that end is the edge of the map (an open end, where
// vehicles leave and enter the town). Without block merges every junction has all four arms.

import type { CityLayout } from './layout';

/** Arm bits, same as the traffic arm mask: north (+Z), east (+X), south (-Z), west (-X). */
export const ARM_N = 1;
export const ARM_E = 2;
export const ARM_S = 4;
export const ARM_W = 8;

const EPS = 0.01;

/** Number of arms in a mask. */
export function armCount(mask: number): number {
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
}

/** Returns a lookup `(x, z) => arm mask` for junction centres of `layout`. */
export function junctionArms(layout: Pick<CityLayout, 'roads'>): (x: number, z: number) => number {
  const ext = { v: { min: Infinity, max: -Infinity }, h: { min: Infinity, max: -Infinity } };
  const pieces = layout.roads.map((r) => {
    const vertical = r.orientation === 'vertical';
    const a = vertical ? Math.min(r.start.z, r.end.z) : Math.min(r.start.x, r.end.x);
    const b = vertical ? Math.max(r.start.z, r.end.z) : Math.max(r.start.x, r.end.x);
    const e = vertical ? ext.v : ext.h;
    e.min = Math.min(e.min, a);
    e.max = Math.max(e.max, b);
    return { vertical, line: vertical ? r.start.x : r.start.z, a, b };
  });
  return (x: number, z: number): number => {
    let mask = 0;
    for (const p of pieces) {
      const across = p.vertical ? x : z;
      const along = p.vertical ? z : x;
      if (Math.abs(p.line - across) > EPS || along < p.a - EPS || along > p.b + EPS) continue;
      const e = p.vertical ? ext.v : ext.h;
      const high = p.b > along + EPS || Math.abs(p.b - e.max) < EPS;
      const low = p.a < along - EPS || Math.abs(p.a - e.min) < EPS;
      if (high) mask |= p.vertical ? ARM_N : ARM_E;
      if (low) mask |= p.vertical ? ARM_S : ARM_W;
    }
    return mask;
  };
}
