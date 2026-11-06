// Road slabs, asphalt underlay, lane markings and junction slabs of the ground-level streetscape.

import type { CityLayout, Intersection, RoadSegment } from '../city/layout';
import { MeshBuilder } from './builder';
import { ASPHALT_TOP, COLORS, CURB_WIDTH, GROUND_Y, PAINT_Y, UNDERLAY_TOP } from './surfaceLevels';

const UNDERLAY_GROW = 0.06;

export type Interval = { a: number; b: number; startCut: CutKind; endCut: CutKind };
export type CutKind = 'end' | 'carriage' | 'walk';
export type Cut = { a: number; b: number; kind: CutKind };

/** Along-axis and lateral description of a road. u runs along the road, v across it. */
export interface RoadAxes {
  horizontal: boolean;
  u0: number;
  u1: number;
  v: number;
  half: number;
}

export function axes(road: RoadSegment): RoadAxes {
  const horizontal = road.orientation === 'horizontal';
  const a = horizontal ? road.start.x : road.start.z;
  const b = horizontal ? road.end.x : road.end.z;
  return {
    horizontal,
    u0: Math.min(a, b),
    u1: Math.max(a, b),
    v: horizontal ? road.start.z : road.start.x,
    half: road.width / 2,
  };
}

/** World rectangle from along/across ranges of a road. */
export function worldRect(ax: RoadAxes, u0: number, u1: number, v0: number, v1: number): [number, number, number, number] {
  return ax.horizontal ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
}

/** Removes cuts from [a, b]; remembers what kind of cut ended or started each piece. */
export function subtractIntervals(a: number, b: number, cuts: readonly Cut[]): Interval[] {
  const sorted = cuts.filter((c) => c.b > a && c.a < b).sort((x, y) => x.a - y.a);
  const out: Interval[] = [];
  let cur = a;
  let curKind: CutKind = 'end';
  for (const c of sorted) {
    if (c.a > cur) out.push({ a: cur, b: c.a, startCut: curKind, endCut: c.kind });
    if (c.b > cur) {
      cur = c.b;
      curKind = c.kind;
    }
  }
  if (b > cur) out.push({ a: cur, b, startCut: curKind, endCut: 'end' });
  return out.filter((i) => i.b - i.a > 0.05);
}

/** Intervals along the road where lane markings are left out (junctions, crossings). */
function markingCuts(ax: RoadAxes, layout: CityLayout): Cut[] {
  const cuts: Cut[] = [];
  for (const it of layout.intersections) {
    const iu = ax.horizontal ? it.center.x : it.center.z;
    const iv = ax.horizontal ? it.center.z : it.center.x;
    if (Math.abs(iv - ax.v) > ax.half + 0.01) continue;
    const along = (ax.horizontal ? it.sizeX : it.sizeZ) / 2 + 0.4;
    cuts.push({ a: iu - along, b: iu + along, kind: 'carriage' });
  }
  for (const cw of layout.crosswalks) {
    // A crossing over a horizontal road is walked along z ('vertical'), and vice versa.
    if ((cw.orientation === 'vertical') !== ax.horizontal) continue;
    const cu = ax.horizontal ? cw.center.x : cw.center.z;
    const cv = ax.horizontal ? cw.center.z : cw.center.x;
    if (Math.abs(cv - ax.v) > ax.half + 0.01) continue;
    cuts.push({ a: cu - cw.width / 2 - 0.6, b: cu + cw.width / 2 + 0.6, kind: 'carriage' });
  }
  return cuts;
}

/** Dashed or solid line along the road at lateral offset `off`. */
function paintLine(
  overlay: MeshBuilder,
  ax: RoadAxes,
  pieces: readonly Interval[],
  off: number,
  lineWidth: number,
  dash: number,
  gap: number,
): void {
  const v0 = ax.v + off - lineWidth / 2;
  const v1 = ax.v + off + lineWidth / 2;
  for (const p of pieces) {
    if (gap <= 0) {
      const r = worldRect(ax, p.a, p.b, v0, v1);
      overlay.rect(PAINT_Y, r[0], r[1], r[2], r[3], COLORS.paint);
      continue;
    }
    // Dashes are phased from the road start so neighbouring pieces line up.
    const period = dash + gap;
    let s = ax.u0 + Math.ceil((p.a - ax.u0) / period) * period;
    for (; s < p.b; s += period) {
      const e = Math.min(s + dash, p.b);
      if (e - s < 0.5) continue;
      const r = worldRect(ax, s, e, v0, v1);
      overlay.rect(PAINT_Y, r[0], r[1], r[2], r[3], COLORS.paint);
    }
  }
}

export function buildRoad(road: RoadSegment, layout: CityLayout, surf: MeshBuilder, overlay: MeshBuilder): void {
  const ax = axes(road);
  if (ax.u1 - ax.u0 <= 0.01 || road.width <= 0) return;

  // Asphalt slab.
  const r = worldRect(ax, ax.u0, ax.u1, ax.v - ax.half, ax.v + ax.half);
  surf.box(r[0], r[1], GROUND_Y, ASPHALT_TOP, r[2], r[3], COLORS.asphalt);
  surf.box(r[0] - UNDERLAY_GROW, r[1] + UNDERLAY_GROW, GROUND_Y, UNDERLAY_TOP, r[2] - UNDERLAY_GROW, r[3] + UNDERLAY_GROW, COLORS.asphalt);

  // Markings.
  const pieces = subtractIntervals(ax.u0, ax.u1, markingCuts(ax, layout));
  const avenue = road.streetClass === 'avenue';
  const edgeOff = ax.half - CURB_WIDTH - 0.35;
  paintLine(overlay, ax, pieces, -edgeOff, 0.12, 0, 0);
  paintLine(overlay, ax, pieces, edgeOff, 0.12, 0, 0);
  if (avenue) {
    // Double solid centre line, plus dashed lane dividers when there are two lanes per direction.
    paintLine(overlay, ax, pieces, -0.12, 0.1, 0, 0);
    paintLine(overlay, ax, pieces, 0.12, 0.1, 0, 0);
    if (road.lanes >= 4) {
      paintLine(overlay, ax, pieces, -ax.half / 2, 0.12, 3, 6);
      paintLine(overlay, ax, pieces, ax.half / 2, 0.12, 3, 6);
    }
  } else {
    paintLine(overlay, ax, pieces, 0, 0.12, 3, 3);
  }
}

export function buildIntersection(it: Intersection, surf: MeshBuilder): void {
  const hx = it.sizeX / 2, hz = it.sizeZ / 2;
  surf.box(it.center.x - hx, it.center.x + hx, GROUND_Y, ASPHALT_TOP, it.center.z - hz, it.center.z + hz, COLORS.asphalt);
  surf.box(it.center.x - hx - UNDERLAY_GROW, it.center.x + hx + UNDERLAY_GROW, GROUND_Y, UNDERLAY_TOP, it.center.z - hz - UNDERLAY_GROW, it.center.z + hz + UNDERLAY_GROW, COLORS.asphalt);
}
