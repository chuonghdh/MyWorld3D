// Rounded kerbs at junction corners and the raised sidewalks along each road.

import type { CityLayout, RoadSegment } from '../city/layout';
import { MeshBuilder } from './builder';
import { COLORS, CURB_WIDTH, GROUND_Y, SIDEWALK_TOP } from './surfaceLevels';
import { axes, subtractIntervals, worldRect, type Cut } from './surfaceRoads';

/** Radius of the rounded kerb at a junction corner (metres). Sidewalks are wider than this. */
export const KERB_RADIUS = 0.5;
const KERB_ARC_STEPS = 6;

/**
 * Depth of the open corner that a rounded kerb leaves, measured from the crossing carriageway edge at distance `a`
 * (0 at the edge, `radius` at the far end of the arc). Points closer to the curb face than this depth are outside
 * the kerb arc and carry no sidewalk. Zero past the arc.
 */
export function kerbVoidDepth(a: number, radius = KERB_RADIUS): number {
  if (a <= 0) return radius;
  if (a >= radius) return 0;
  const d = radius - a;
  return radius - Math.sqrt(radius * radius - d * d);
}

/** Flat triangle facing up whatever the corner order. */
function flatUpTri(surf: MeshBuilder, p: readonly [number, number, number], q: readonly [number, number, number], r: readonly [number, number, number], color: string): void {
  const cross = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
  if (cross >= 0) surf.tri(p, q, r, color);
  else surf.tri(p, r, q, color);
}

/** Quad whose stored normal points the way `out` (x, z) says. */
function quadFacing(surf: MeshBuilder, p0: readonly [number, number, number], p1: readonly [number, number, number], p2: readonly [number, number, number], p3: readonly [number, number, number], out: readonly [number, number], color: string): void {
  const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
  const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
  const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
  if (nx * out[0] + nz * out[1] >= 0) surf.quad(p0, p1, p2, p3, color);
  else surf.quad(p0, p3, p2, p1, color);
}

/**
 * Rounded kerb at a junction corner of a horizontal sidewalk strip, where the strip meets a crossing carriageway.
 * Local frame: a runs along the road from the crossing carriageway edge (`uCorner`, in direction `dirU`); b runs
 * from the curb face (`vIn`) into the sidewalk on `side`. The sidewalk is the quarter disc of radius KERB_RADIUS
 * centred at (R, R); its arc is the kerb. The corner square outside the arc is left open, so the ground shows there.
 *
 * The strip box itself starts KERB_RADIUS past the carriageway edge, so this function covers the rest:
 *   - kerb band along the arc (CURB_WIDTH wide, kerb colour), sidewalk inside it,
 *   - kerb along the carriageway edge and the sidewalk patch beside it,
 *   - the arc wall, facing the open corner, from the ground up to the kerb top.
 */
function roundedKerbCorner(surf: MeshBuilder, uCorner: number, dirU: 1 | -1, side: 1 | -1, vIn: number, sw: number): void {
  const R = KERB_RADIUS, c = CURB_WIDTH, T = SIDEWALK_TOP;
  const pt = (a: number, b: number, y: number): [number, number, number] => [uCorner + dirU * a, y, vIn + side * b];
  const arc = (rho: number, k: number): [number, number] => {
    const th = (k / KERB_ARC_STEPS) * (Math.PI / 2);
    return [R - rho * Math.cos(th), R - rho * Math.sin(th)];
  };
  for (let k = 0; k < KERB_ARC_STEPS; k++) {
    const o0 = arc(R, k), o1 = arc(R, k + 1), i0 = arc(R - c, k), i1 = arc(R - c, k + 1);
    flatUpTri(surf, pt(o0[0], o0[1], T), pt(o1[0], o1[1], T), pt(i1[0], i1[1], T), COLORS.curb);
    flatUpTri(surf, pt(o0[0], o0[1], T), pt(i1[0], i1[1], T), pt(i0[0], i0[1], T), COLORS.curb);
    flatUpTri(surf, pt(R, R, T), pt(i0[0], i0[1], T), pt(i1[0], i1[1], T), COLORS.sidewalk);
    const mid = arc(R, k + 0.5);
    const out: [number, number] = [dirU * (mid[0] - R), side * (mid[1] - R)];
    quadFacing(surf, pt(o0[0], o0[1], 0), pt(o1[0], o1[1], 0), pt(o1[0], o1[1], T), pt(o0[0], o0[1], T), out, COLORS.curb);
  }
  // Kerb along the carriageway edge, from the arc up to the sidewalk's outer edge.
  const xa = uCorner, xb = uCorner + dirU * c;
  const zLo = vIn + side * R, zHi = vIn + side * sw;
  surf.box(Math.min(xa, xb), Math.max(xa, xb), GROUND_Y, T, Math.min(zLo, zHi), Math.max(zLo, zHi), COLORS.curb);
  // Sidewalk beside that kerb, between the arc band and the strip.
  const xc = uCorner + dirU * R;
  surf.rect(T, Math.min(xb, xc), Math.max(xb, xc), Math.min(zLo, zHi), Math.max(zLo, zHi), COLORS.sidewalk);
}

/** Raised sidewalks on both sides of a road, clipped where they meet crossing roads. */
export function buildSidewalks(road: RoadSegment, layout: CityLayout, surf: MeshBuilder): void {
  const ax = axes(road);
  const sw = road.sidewalkWidth;
  if (ax.u1 - ax.u0 <= 0.01 || !(sw > 0)) return;

  for (const side of [-1, 1] as const) {
    const vIn = ax.v + side * ax.half; // curb face
    const vOut = ax.v + side * (ax.half + sw);
    const vMin = Math.min(vIn, vOut);
    const vMax = Math.max(vIn, vOut);

    // Crossing roads cut the strip. Horizontal strips own the corner squares,
    // so they are cut only by the crossing carriageway; vertical strips stop at the
    // crossing road's far sidewalk edge.
    const cuts: Cut[] = [];
    for (const other of layout.roads) {
      if (other === road || other.orientation === road.orientation) continue;
      const o = axes(other);
      if (o.u1 <= vMin + 0.01 || o.u0 >= vMax - 0.01) continue; // does not reach this strip
      const osw = other.sidewalkWidth > 0 ? other.sidewalkWidth : 0;
      if (ax.horizontal || osw === 0) cuts.push({ a: o.v - o.half, b: o.v + o.half, kind: 'carriage' });
      else cuts.push({ a: o.v - o.half - osw, b: o.v + o.half + osw, kind: 'walk' });
    }

    for (const p of subtractIntervals(ax.u0, ax.u1, cuts)) {
      const capStart = p.startCut !== 'walk';
      const capEnd = p.endCut !== 'walk';
      // A horizontal strip owns the junction corners: where it meets a crossing carriageway the outer
      // corner is rounded (see roundedKerbCorner) instead of square.
      const roundStart = ax.horizontal && p.startCut === 'carriage';
      const roundEnd = ax.horizontal && p.endCut === 'carriage';
      const c = CURB_WIDTH;
      const vCurb0 = side > 0 ? vIn : vIn - c;
      const vCurb1 = side > 0 ? vIn + c : vIn;
      const vWalk0 = side > 0 ? vIn + c : vOut;
      const vWalk1 = side > 0 ? vOut : vIn - c;

      // Curb along the carriageway; at a rounded corner it stops where the arc begins.
      let w = worldRect(ax, p.a + (roundStart ? KERB_RADIUS : 0), p.b - (roundEnd ? KERB_RADIUS : 0), vCurb0, vCurb1);
      surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.curb);
      // End curbs where the strip meets open asphalt (a rounded corner brings its own kerb).
      const ua = p.a + (roundStart ? KERB_RADIUS : capStart ? c : 0);
      const ub = p.b - (roundEnd ? KERB_RADIUS : capEnd ? c : 0);
      if (capStart && !roundStart) {
        w = worldRect(ax, p.a, p.a + c, vWalk0, vWalk1);
        surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.curb);
      }
      if (capEnd && !roundEnd) {
        w = worldRect(ax, p.b - c, p.b, vWalk0, vWalk1);
        surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.curb);
      }
      if (roundStart) roundedKerbCorner(surf, p.a, +1, side, vIn, sw);
      if (roundEnd) roundedKerbCorner(surf, p.b, -1, side, vIn, sw);
      if (ub > ua) {
        w = worldRect(ax, ua, ub, vWalk0, vWalk1);
        surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.sidewalk);
      }
    }
  }
}
