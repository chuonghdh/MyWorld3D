// Ground-level streetscape: grass and town edge, asphalt, sidewalks with curbs,
// block slabs, courtyards, monument plazas, and the painted overlay
// (lane markings, zebra crossings, tree pits, paths, paving bands).

import type { Block, CityLayout, Crosswalk, Intersection, RoadSegment } from '../city/layout';
import { MeshBuilder } from './builder';

// Heights (metres). Every overlay sits a little above the surface it decorates and is
// drawn with polygonOffset as well, so nothing z-fights at the default camera distance.
export const GROUND_Y = 0;
export const ASPHALT_TOP = 0.04;
export const PAINT_Y = ASPHALT_TOP + 0.02;
export const SIDEWALK_TOP = 0.15;
export const SIDEWALK_OVERLAY_Y = SIDEWALK_TOP + 0.015;
export const CURB_WIDTH = 0.22;
export const TREE_PIT_SIZE = 1.3;

export const COLORS = {
  grass: '#8c9a6a',
  courtyardGrass: '#86a05e',
  townBase: '#cbbfa8',
  townEdge: '#bfb8aa',
  asphalt: '#4a4a50',
  paint: '#efeee8',
  sidewalk: '#ddd6c8',
  sidewalkBand: '#cfc6b4',
  curb: '#bfb8aa',
  plazaLight: '#d9cfbd',
  plazaDark: '#c9bda6',
  plazaBorder: '#b9ab92',
  gravel: '#d8ccae',
  treePit: '#3b3228',
  treePitEdge: '#8e877b',
} as const;

const OUTSIDE_GRASS = 150;
const EDGE_WIDTH = 0.8;

type Interval = { a: number; b: number; startCut: CutKind; endCut: CutKind };
type CutKind = 'end' | 'carriage' | 'walk';
type Cut = { a: number; b: number; kind: CutKind };

/** Along-axis and lateral description of a road. u runs along the road, v across it. */
interface RoadAxes {
  horizontal: boolean;
  u0: number;
  u1: number;
  v: number;
  half: number;
}

function axes(road: RoadSegment): RoadAxes {
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
function worldRect(ax: RoadAxes, u0: number, u1: number, v0: number, v1: number): [number, number, number, number] {
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

function buildRoad(road: RoadSegment, layout: CityLayout, surf: MeshBuilder, overlay: MeshBuilder): void {
  const ax = axes(road);
  if (ax.u1 - ax.u0 <= 0.01 || road.width <= 0) return;

  // Asphalt slab.
  const r = worldRect(ax, ax.u0, ax.u1, ax.v - ax.half, ax.v + ax.half);
  surf.box(r[0], r[1], GROUND_Y, ASPHALT_TOP, r[2], r[3], COLORS.asphalt);

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

/** Raised sidewalks on both sides of a road, clipped where they meet crossing roads. */
function buildSidewalks(road: RoadSegment, layout: CityLayout, surf: MeshBuilder, overlay: MeshBuilder): void {
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
      const c = CURB_WIDTH;
      const vCurb0 = side > 0 ? vIn : vIn - c;
      const vCurb1 = side > 0 ? vIn + c : vIn;
      const vWalk0 = side > 0 ? vIn + c : vOut;
      const vWalk1 = side > 0 ? vOut : vIn - c;

      // Curb along the carriageway.
      let w = worldRect(ax, p.a, p.b, vCurb0, vCurb1);
      surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.curb);
      // End curbs where the strip meets open asphalt.
      const ua = p.a + (capStart ? c : 0);
      const ub = p.b - (capEnd ? c : 0);
      if (capStart) {
        w = worldRect(ax, p.a, p.a + c, vWalk0, vWalk1);
        surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.curb);
      }
      if (capEnd) {
        w = worldRect(ax, p.b - c, p.b, vWalk0, vWalk1);
        surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.curb);
      }
      if (ub > ua) {
        w = worldRect(ax, ua, ub, vWalk0, vWalk1);
        surf.box(w[0], w[1], GROUND_Y, SIDEWALK_TOP, w[2], w[3], COLORS.sidewalk);
        // Furniture zone: a slightly darker paving band beside the curb.
        const band = Math.min(road.streetClass === 'avenue' ? 1.4 : 0.9, (vWalk1 - vWalk0) * 0.45);
        const b0 = side > 0 ? vWalk0 : vWalk1 - band;
        const b1 = side > 0 ? vWalk0 + band : vWalk1;
        // Leave holes for tree pits so the two decals never overlap.
        const pitCuts: Cut[] = [];
        for (const tree of layout.streetTrees) {
          if (tree.setting !== 'street') continue;
          const tu = ax.horizontal ? tree.position.x : tree.position.z;
          const tv = ax.horizontal ? tree.position.z : tree.position.x;
          if (tv + TREE_PIT_SIZE / 2 <= b0 || tv - TREE_PIT_SIZE / 2 >= b1) continue;
          pitCuts.push({ a: tu - TREE_PIT_SIZE / 2, b: tu + TREE_PIT_SIZE / 2, kind: 'walk' });
        }
        for (const bp of subtractIntervals(ua, ub, pitCuts)) {
          w = worldRect(ax, bp.a, bp.b, b0, b1);
          overlay.rect(SIDEWALK_OVERLAY_Y, w[0], w[1], w[2], w[3], COLORS.sidewalkBand);
        }
      }
    }
  }
}

function buildIntersection(it: Intersection, surf: MeshBuilder): void {
  const hx = it.sizeX / 2, hz = it.sizeZ / 2;
  surf.box(it.center.x - hx, it.center.x + hx, GROUND_Y, ASPHALT_TOP, it.center.z - hz, it.center.z + hz, COLORS.asphalt);
}

/** Zebra crossing: stripes run along the traffic, repeated across the road. */
function buildCrosswalk(cw: Crosswalk, overlay: MeshBuilder): void {
  const stripe = 0.5;
  const gap = 0.5;
  const usable = cw.length - 0.6;
  const n = Math.max(1, Math.floor((usable + gap) / (stripe + gap)));
  const total = n * stripe + (n - 1) * gap;
  const walkX = cw.orientation === 'horizontal';
  const y = PAINT_Y + 0.004;
  for (let i = 0; i < n; i++) {
    const s = -total / 2 + i * (stripe + gap) + stripe / 2;
    if (walkX) {
      overlay.rect(y, cw.center.x + s - stripe / 2, cw.center.x + s + stripe / 2, cw.center.z - cw.width / 2, cw.center.z + cw.width / 2, COLORS.paint);
    } else {
      overlay.rect(y, cw.center.x - cw.width / 2, cw.center.x + cw.width / 2, cw.center.z + s - stripe / 2, cw.center.z + s + stripe / 2, COLORS.paint);
    }
  }
}

/** Grass courtyard with gravel paths (a cross, plus a loop in large courtyards). */
function buildCourtyard(block: Block, surf: MeshBuilder, overlay: MeshBuilder): void {
  const b = block.bounds;
  const c = block.courtyard;
  if (!c) {
    surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, b.minZ, b.maxZ, COLORS.sidewalk);
    return;
  }
  // Paved ring under the houses (abutting, not overlapping, the courtyard).
  surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, b.minZ, c.minZ, COLORS.sidewalk);
  surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, c.maxZ, b.maxZ, COLORS.sidewalk);
  surf.box(b.minX, c.minX, GROUND_Y, SIDEWALK_TOP, c.minZ, c.maxZ, COLORS.sidewalk);
  surf.box(c.maxX, b.maxX, GROUND_Y, SIDEWALK_TOP, c.minZ, c.maxZ, COLORS.sidewalk);
  surf.box(c.minX, c.maxX, GROUND_Y, SIDEWALK_TOP, c.minZ, c.maxZ, COLORS.courtyardGrass);

  const w = c.maxX - c.minX;
  const d = c.maxZ - c.minZ;
  if (w < 4 || d < 4) return;
  const cx = (c.minX + c.maxX) / 2;
  const cz = (c.minZ + c.maxZ) / 2;
  const pw = Math.min(1.4, Math.min(w, d) * 0.12);
  const y = SIDEWALK_OVERLAY_Y;
  // Cross.
  overlay.rect(y, c.minX, c.maxX, cz - pw / 2, cz + pw / 2, COLORS.gravel);
  overlay.rect(y, cx - pw / 2, cx + pw / 2, c.minZ, cz - pw / 2, COLORS.gravel);
  overlay.rect(y, cx - pw / 2, cx + pw / 2, cz + pw / 2, c.maxZ, COLORS.gravel);
  // Loop in larger courtyards, leaving lawn beds for hedges and trees on both sides.
  if (w >= 14 && d >= 14) {
    const ix = w * 0.27, iz = d * 0.27;
    const x0 = c.minX + ix, x1 = c.maxX - ix, z0 = c.minZ + iz, z1 = c.maxZ - iz;
    overlay.rect(y, x0, x1, z0, z0 + pw, COLORS.gravel);
    overlay.rect(y, x0, x1, z1 - pw, z1, COLORS.gravel);
    overlay.rect(y, x0, x0 + pw, z0 + pw, z1 - pw, COLORS.gravel);
    overlay.rect(y, x1 - pw, x1, z0 + pw, z1 - pw, COLORS.gravel);
  }
}

/** Monument block: paved plaza with a border band and a two-tone checker of stone slabs. */
function buildPlaza(block: Block, surf: MeshBuilder, overlay: MeshBuilder): void {
  const b = block.bounds;
  surf.box(b.minX, b.maxX, GROUND_Y, SIDEWALK_TOP, b.minZ, b.maxZ, COLORS.plazaLight);
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const border = Math.min(1, Math.min(w, d) * 0.06);
  const y = SIDEWALK_OVERLAY_Y;
  overlay.rect(y, b.minX, b.maxX, b.minZ, b.minZ + border, COLORS.plazaBorder);
  overlay.rect(y, b.minX, b.maxX, b.maxZ - border, b.maxZ, COLORS.plazaBorder);
  overlay.rect(y, b.minX, b.minX + border, b.minZ + border, b.maxZ - border, COLORS.plazaBorder);
  overlay.rect(y, b.maxX - border, b.maxX, b.minZ + border, b.maxZ - border, COLORS.plazaBorder);

  const x0 = b.minX + border, x1 = b.maxX - border, z0 = b.minZ + border, z1 = b.maxZ - border;
  const tile = 3;
  const nx = Math.max(1, Math.round((x1 - x0) / tile));
  const nz = Math.max(1, Math.round((z1 - z0) / tile));
  const tx = (x1 - x0) / nx, tz = (z1 - z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if ((i + j) % 2 === 0) continue;
      overlay.rect(y, x0 + i * tx, x0 + (i + 1) * tx, z0 + j * tz, z0 + (j + 1) * tz, COLORS.plazaDark);
    }
  }
}

/** Grass around the town, a stone edge on the town boundary and a paved base inside it. */
function buildGround(layout: CityLayout, surf: MeshBuilder): void {
  const t = layout.townBounds;
  const e = EDGE_WIDTH;
  const g = OUTSIDE_GRASS;
  // Paved base for any gap not covered by roads, sidewalks or blocks.
  surf.rect(GROUND_Y, t.minX, t.maxX, t.minZ, t.maxZ, COLORS.townBase);
  // Stone edge.
  surf.box(t.minX - e, t.maxX + e, -0.1, 0.12, t.minZ - e, t.minZ, COLORS.townEdge);
  surf.box(t.minX - e, t.maxX + e, -0.1, 0.12, t.maxZ, t.maxZ + e, COLORS.townEdge);
  surf.box(t.minX - e, t.minX, -0.1, 0.12, t.minZ, t.maxZ, COLORS.townEdge);
  surf.box(t.maxX, t.maxX + e, -0.1, 0.12, t.minZ, t.maxZ, COLORS.townEdge);
  // Grass ring (no overlap with the town, so nothing fights).
  const ox0 = t.minX - e, ox1 = t.maxX + e, oz0 = t.minZ - e, oz1 = t.maxZ + e;
  surf.rect(GROUND_Y, ox0 - g, ox1 + g, oz1, oz1 + g, COLORS.grass);
  surf.rect(GROUND_Y, ox0 - g, ox1 + g, oz0 - g, oz0, COLORS.grass);
  surf.rect(GROUND_Y, ox0 - g, ox0, oz0, oz1, COLORS.grass);
  surf.rect(GROUND_Y, ox1, ox1 + g, oz0, oz1, COLORS.grass);
}

function buildTreePits(layout: CityLayout, overlay: MeshBuilder): void {
  const rim = 0.1;
  for (const tree of layout.streetTrees) {
    if (tree.setting !== 'street') continue;
    const { x, z } = tree.position;
    const h = TREE_PIT_SIZE / 2;
    const y = SIDEWALK_OVERLAY_Y;
    overlay.rect(y, x - h, x + h, z - h, z - h + rim, COLORS.treePitEdge);
    overlay.rect(y, x - h, x + h, z + h - rim, z + h, COLORS.treePitEdge);
    overlay.rect(y, x - h, x - h + rim, z - h + rim, z + h - rim, COLORS.treePitEdge);
    overlay.rect(y, x + h - rim, x + h, z - h + rim, z + h - rim, COLORS.treePitEdge);
    overlay.rect(y, x - h + rim, x + h - rim, z - h + rim, z + h - rim, COLORS.treePit);
  }
}

/** Fills `surf` (opaque ground surfaces) and `overlay` (paint and decals) for the whole layout. */
export function buildSurfaces(layout: CityLayout, surf: MeshBuilder, overlay: MeshBuilder): void {
  buildGround(layout, surf);
  for (const it of layout.intersections) buildIntersection(it, surf);
  for (const road of layout.roads) {
    buildRoad(road, layout, surf, overlay);
    buildSidewalks(road, layout, surf, overlay);
  }
  for (const cw of layout.crosswalks) buildCrosswalk(cw, overlay);
  for (const block of layout.blocks) {
    if (block.kind === 'monument') buildPlaza(block, surf, overlay);
    else buildCourtyard(block, surf, overlay);
  }
  buildTreePits(layout, overlay);
}
