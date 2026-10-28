// House layout: footprint polygon, street-facing segments, floor heights and roof height.
// Shared by buildHouse and houseHeight so both agree without building geometry.

import type { Facades, GroundFloorUse, HousePreset, HouseStyle } from '../../core/types';
import type { Frame } from './mesh';
import { SPECS, type ConcretePreset, type PresetSpec, type RoofType } from './presets';

export const MIN_FLOORS = 2;
export const MAX_FLOORS = 8;

/**
 * Used when a preset is 'as-block' and the caller has not resolved the block default.
 * The city layer should normally resolve the block default before calling buildHouse.
 */
export const FALLBACK_PRESET: ConcretePreset = 'original-feuilles';

export function resolvePreset(preset: HousePreset): ConcretePreset {
  return preset === 'as-block' || !(preset in SPECS) ? FALLBACK_PRESET : preset;
}

export type Side = 'front' | 'right' | 'back' | 'left' | 'chamfer';

export interface Edge {
  /** Outward normal in the xz plane. */
  nx: number;
  nz: number;
  /** Line: nx * x + nz * z = c. */
  c: number;
  side: Side;
  facade: boolean;
}

export interface Segment {
  index: number;
  edge: Edge;
  side: Side;
  facade: boolean;
  /** Frame with u along the segment (left to right from the street), n outward, origin at the middle. */
  frame: Frame;
  L: number;
  /** Turn angle (radians) into the neighbouring facade at u = -L/2, or null for a party wall. */
  startTurn: number | null;
  /** Turn angle into the neighbouring facade at u = +L/2, or null for a party wall. */
  endTurn: number | null;
  /** The main street front: gets the entrance, terrace and stoop. */
  main: boolean;
}

export interface HouseInput {
  preset: HousePreset;
  floors: number;
  roof: RoofType;
  style: HouseStyle;
  width?: number;
  depth?: number;
  facades?: Facades;
  groundFloor?: GroundFloorUse;
}

export interface Layout {
  preset: ConcretePreset;
  spec: PresetSpec;
  modern: boolean;
  roof: RoofType;
  floors: number;
  W: number;
  D: number;
  facades: Facades;
  ground: GroundFloorUse;
  groundH: number;
  floorY: number[];
  floorTop: number[];
  wallTop: number;
  roofH: number;
  chamfer: number;
  gableToStreet: boolean;
  /** Pitched-roof inset on facade edges (hip, low-tiled). */
  hipInset: number;
  edges: Edge[];
  segments: Segment[];
}

const FLAT_ROOFS: readonly RoofType[] = ['flat', 'parapet', 'cornice', 'terrace'];

export function isFlatRoof(roof: RoofType): boolean {
  return FLAT_ROOFS.includes(roof);
}

export const MANSARD_LOWER_H = 2.6;
export const MANSARD_LOWER_INSET = 1.0;
export const MANSARD_UPPER_H = 0.7;

function clampInt(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(v)));
}

function clampNum(v: number | undefined, fallback: number, lo: number, hi: number): number {
  if (v === undefined || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

export function computeLayout(p: HouseInput): Layout {
  const preset = resolvePreset(p.preset);
  const spec = SPECS[preset];
  const modern = p.style === 'modern';
  const roof = p.roof;
  const floors = clampInt(p.floors, MIN_FLOORS, MAX_FLOORS);
  const W = clampNum(p.width, spec.width, 3, 60);
  const D = clampNum(p.depth, spec.depth, 3, 60);
  const fac: Facades = p.facades ? { ...p.facades } : { front: true, back: true, left: false, right: false };
  if (!fac.front && !fac.back && !fac.left && !fac.right) fac.front = true;
  const ground = p.groundFloor ?? spec.defaultGround;

  // Floor heights.
  let groundH = ground === 'residential' ? 3.6 : 4.2;
  if (spec.kind === 'brownstone' && ground === 'residential' && !modern) groundH = 4.0;
  if (spec.kind === 'tower') groundH = 4.6;
  if (spec.kind === 'nordic' && ground === 'residential') groundH = 3.2;
  const floorY: number[] = [0];
  const floorTop: number[] = [groundH];
  let y = groundH;
  for (let f = 1; f < floors; f++) {
    let h = spec.floorH;
    if (spec.kind === 'haussmann' && !modern) {
      if (f === 2) h += 0.25;
      else if (f === floors - 1 && floors > 3) h -= 0.15;
    }
    floorY.push(y);
    y += h;
    floorTop.push(y);
  }
  const wallTop = y;

  const gableToStreet = roof === 'step-gable' || spec.gableToStreet || W < 7.5;
  const chamferable = spec.kind === 'haussmann' && (roof === 'mansard' || isFlatRoof(roof));
  const chamfer = chamferable ? Math.min(2.4, W * 0.22, D * 0.22) : 0;

  const edges = buildEdges(W, D, fac, chamfer);
  const segments = buildSegments(edges, fac);

  // Hip / low-tiled inset: same slope on every facade edge, limited so the top stays valid.
  const limit = (a: boolean, b: boolean, extent: number): number =>
    a && b ? extent / 2 : a || b ? extent - 1 : Infinity;
  let hipInset = Math.min(limit(fac.front, fac.back, D), limit(fac.left, fac.right, W), 6);
  if (!Number.isFinite(hipInset)) hipInset = Math.min(D / 2, 6);

  let roofH: number;
  switch (roof) {
    case 'mansard':
      roofH = MANSARD_LOWER_H + MANSARD_UPPER_H;
      break;
    case 'flat':
      roofH = 0.55;
      break;
    case 'parapet':
      roofH = 1.1;
      break;
    case 'cornice':
      roofH = 0.7;
      break;
    case 'terrace':
      roofH = 3.0;
      break;
    case 'gable':
      roofH = gableRise(spec, W, D, gableToStreet, false);
      break;
    case 'step-gable':
      roofH = gableRise(spec, W, D, true, true) + 0.6;
      break;
    case 'hip':
      roofH = hipInset * Math.tan((33 * Math.PI) / 180);
      break;
    case 'low-tiled':
      roofH = hipInset * Math.tan((20 * Math.PI) / 180);
      break;
    default:
      roofH = 0.5;
  }

  return {
    preset,
    spec,
    modern,
    roof,
    floors,
    W,
    D,
    facades: fac,
    ground,
    groundH,
    floorY,
    floorTop,
    wallTop,
    roofH,
    chamfer,
    gableToStreet,
    hipInset,
    edges,
    segments,
  };
}

/** Ridge height above the wall top for gable roofs. */
export function gableRise(spec: PresetSpec, W: number, D: number, toStreet: boolean, stepped: boolean): number {
  const span = toStreet ? W : D;
  const pitch = stepped ? Math.max(spec.pitch, 50) : spec.pitch;
  return Math.min(7.5, (span / 2) * Math.tan((pitch * Math.PI) / 180));
}

function buildEdges(W: number, D: number, fac: Facades, ch: number): Edge[] {
  const s = Math.SQRT1_2;
  const out: Edge[] = [];
  const add = (nx: number, nz: number, c: number, side: Side, facade: boolean): void => {
    out.push({ nx, nz, c, side, facade });
  };
  add(0, 1, D / 2, 'front', fac.front);
  if (ch > 0 && fac.front && fac.right) add(s, s, (W / 2 - ch + D / 2) * s, 'chamfer', true);
  add(1, 0, W / 2, 'right', fac.right);
  if (ch > 0 && fac.right && fac.back) add(s, -s, (W / 2 - ch + D / 2) * s, 'chamfer', true);
  add(0, -1, D / 2, 'back', fac.back);
  if (ch > 0 && fac.back && fac.left) add(-s, -s, (W / 2 - ch + D / 2) * s, 'chamfer', true);
  add(-1, 0, W / 2, 'left', fac.left);
  if (ch > 0 && fac.left && fac.front) add(-s, s, (W / 2 - ch + D / 2) * s, 'chamfer', true);
  return out;
}

function intersect(a: Edge, ca: number, b: Edge, cb: number): [number, number] {
  const det = a.nx * b.nz - a.nz * b.nx;
  return [(ca * b.nz - a.nz * cb) / det, (a.nx * cb - ca * b.nx) / det];
}

/**
 * Footprint polygon (x, z) with each edge moved inward by insets[i].
 * Vertex i is the end of edge i (shared with edge i + 1).
 */
export function offsetPolygon(edges: readonly Edge[], insets: readonly number[]): [number, number][] {
  const n = edges.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push(intersect(edges[i], edges[i].c - insets[i], edges[j], edges[j].c - insets[j]));
  }
  return out;
}

function buildSegments(edges: Edge[], fac: Facades): Segment[] {
  const n = edges.length;
  const poly = offsetPolygon(edges, edges.map(() => 0));
  const mainSide: Side = fac.front ? 'front' : fac.right ? 'right' : fac.left ? 'left' : 'back';
  const segs: Segment[] = [];
  for (let i = 0; i < n; i++) {
    const e = edges[i];
    const a = poly[(i - 1 + n) % n];
    const b = poly[i];
    const prev = edges[(i - 1 + n) % n];
    const next = edges[(i + 1) % n];
    const turn = (o: Edge): number => Math.acos(Math.max(-1, Math.min(1, e.nx * o.nx + e.nz * o.nz)));
    segs.push({
      index: i,
      edge: e,
      side: e.side,
      facade: e.facade,
      frame: { ox: (a[0] + b[0]) / 2, oz: (a[1] + b[1]) / 2, ux: e.nz, uz: -e.nx, nx: e.nx, nz: e.nz },
      L: Math.hypot(b[0] - a[0], b[1] - a[1]),
      startTurn: e.facade && prev.facade ? turn(prev) : null,
      endTurn: e.facade && next.facade ? turn(next) : null,
      main: e.side === mainSide,
    });
  }
  return segs;
}

/** How far a projecting element of depth `proj` must extend past the segment end to meet its neighbour. */
export function extAt(turn: number | null, proj: number): number {
  return turn === null ? 0 : proj * Math.tan(turn / 2);
}
