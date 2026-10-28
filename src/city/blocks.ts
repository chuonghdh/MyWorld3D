// Perimeter-block subdivision: corner lots first, then contiguous frontages along each edge.
// Pure TypeScript. All randomness comes from the rng passed in, so results are deterministic.

import type { Facades, GroundFloorUse, StreetClass, Vec2 } from '../core/types';
import type { Lot, Rect } from './layout';

/** Frontage range for non-corner lots, metres. */
export const MIN_FRONTAGE = 6;
export const MAX_FRONTAGE = 13;
/** Lot depth range on normal blocks. */
const MIN_DEPTH = 10;
const MAX_DEPTH = 14;
/** Lower bound for the depth on small blocks. */
const SMALL_BLOCK_DEPTH = 8;
/** A courtyard narrower than this is not kept (the block reads as solid). */
const MIN_COURTYARD = 6;
/** Plaza margin around a monument, metres (capped on small blocks). */
const PLAZA_MARGIN = 5;

/** Floors per street class, inclusive. */
const FLOOR_RANGE: Record<StreetClass, [number, number]> = {
  avenue: [5, 7],
  street: [3, 6],
};

export type EdgeName = 'south' | 'north' | 'west' | 'east';

/** Outward unit direction of each block edge (toward its street). */
export const EDGE_DIR: Record<EdgeName, Vec2> = {
  south: { x: 0, z: -1 },
  north: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
  east: { x: 1, z: 0 },
};

export type EdgeClasses = Record<EdgeName, StreetClass>;

interface LotPlan {
  rect: Rect;
  front: EdgeName;
  /** Other street sides of the lot (corner side, or all sides for a lone lot). */
  sides: EdgeName[];
  corner: boolean;
  cls: StreetClass;
}

export interface BlockLots {
  lots: Lot[];
  courtyard: Rect | null;
}

type Rng = () => number;

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);

/** Exact unit vectors for a facing that is a multiple of 90 degrees. */
function axisVectors(facing: number): { front: Vec2; right: Vec2 } {
  const s = Math.round(Math.sin(facing));
  const c = Math.round(Math.cos(facing));
  // Three.js rotation about Y by `facing`: local +z -> (sin, cos), local +x -> (cos, -sin).
  return { front: { x: s, z: c }, right: { x: c, z: -s } };
}

/** Facades of a lot whose front faces `front` and that also borders the `sides` streets. */
export function facadesFor(facing: number, streetDirs: readonly Vec2[]): Facades {
  const { front, right } = axisVectors(facing);
  const hit = (v: Vec2) => streetDirs.some((d) => d.x * v.x + d.z * v.z > 0.5);
  return {
    front: hit(front),
    back: hit({ x: -front.x, z: -front.z }),
    left: hit({ x: -right.x, z: -right.z }),
    right: hit(right),
  };
}

function lotGeometry(rect: Rect, front: EdgeName): { position: Vec2; facing: number; width: number; depth: number } {
  const dir = EDGE_DIR[front];
  const ex = rect.maxX - rect.minX;
  const ez = rect.maxZ - rect.minZ;
  const alongZ = dir.x === 0; // front faces +-Z
  return {
    position: { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 },
    facing: Math.atan2(dir.x, dir.z),
    width: alongZ ? ex : ez,
    depth: alongZ ? ez : ex,
  };
}

/**
 * Splits `length` into pieces of MIN_FRONTAGE..MAX_FRONTAGE that sum exactly to it.
 * Requires length >= MIN_FRONTAGE.
 */
export function splitFrontages(length: number, rng: Rng): number[] {
  const nMin = Math.max(1, Math.ceil(length / MAX_FRONTAGE - 1e-9));
  const nMax = Math.max(nMin, Math.floor(length / MIN_FRONTAGE + 1e-9));
  const nTarget = Math.round(length / 9);
  const pick = Math.min(nMax, Math.max(nMin, nTarget + (rng() < 0.3 ? (rng() < 0.5 ? -1 : 1) : 0)));
  const raw = Array.from({ length: pick }, () => between(rng, MIN_FRONTAGE, MAX_FRONTAGE));
  const total = raw.reduce((a, b) => a + b, 0);
  let widths = raw.map((w) => (w * length) / total);
  // Clamp to range and hand the difference to pieces with slack until it balances.
  for (let iter = 0; iter < 20; iter++) {
    widths = widths.map((w) => Math.min(MAX_FRONTAGE, Math.max(MIN_FRONTAGE, w)));
    const diff = length - widths.reduce((a, b) => a + b, 0);
    if (Math.abs(diff) < 1e-9) break;
    const slack = widths.filter((w) => (diff > 0 ? w < MAX_FRONTAGE - 1e-9 : w > MIN_FRONTAGE + 1e-9));
    if (slack.length === 0) break;
    const share = diff / slack.length;
    widths = widths.map((w) =>
      (diff > 0 ? w < MAX_FRONTAGE - 1e-9 : w > MIN_FRONTAGE + 1e-9) ? w + share : w,
    );
  }
  // Absorb floating-point residue in the last piece so the edge closes exactly.
  const residue = length - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += residue;
  return widths;
}

function pickGroundFloor(rng: Rng, corner: boolean, cls: StreetClass): GroundFloorUse {
  const r = rng();
  if (corner) return r < 0.35 ? 'cafe' : r < 0.85 ? 'shop' : 'residential';
  if (cls === 'avenue') return r < 0.75 ? 'shop' : r < 0.82 ? 'cafe' : 'residential';
  return r < 0.1 ? 'shop' : r < 0.14 ? 'cafe' : 'residential';
}

/** Next floor count: a +-1 (sometimes +-2) step from the neighbour, never equal when the range allows. */
function nextFloors(rng: Rng, prev: number | null, cls: StreetClass, corner: boolean): number {
  const [lo, hi] = FLOOR_RANGE[cls];
  const r1 = rng();
  const r2 = rng();
  if (prev === null) {
    const f = lo + Math.floor(r1 * (hi - lo + 1));
    return Math.min(hi, corner ? f + 1 : f);
  }
  const step = r2 < 0.15 ? 2 : 1;
  let dir = r1 < 0.5 ? -1 : 1;
  if (corner) dir = 1; // corners like to stand a little taller
  let f = Math.min(hi, Math.max(lo, prev + dir * step));
  if (f === prev) f = Math.min(hi, Math.max(lo, prev - dir * step));
  if (f === prev && hi > lo) f = prev === hi ? hi - 1 : prev + 1;
  return f;
}

function makeSeed(rng: Rng): number {
  return 1 + Math.floor(rng() * 2147483646);
}

/**
 * Builds the lots of a perimeter block. Lots are listed in walking order around the block
 * (south-west corner, south edge, south-east corner, east edge, ...).
 */
export function perimeterLots(blockId: string, bounds: Rect, classes: EdgeClasses, rng: Rng): BlockLots {
  const bw = bounds.maxX - bounds.minX;
  const bd = bounds.maxZ - bounds.minZ;
  const minDim = Math.min(bw, bd);

  const plans: LotPlan[] = [];
  let courtyard: Rect | null = null;

  let depth = between(rng, MIN_DEPTH, MAX_DEPTH);
  depth = Math.min(depth, Math.max(SMALL_BLOCK_DEPTH, minDim * 0.3));
  depth = Math.min(depth, minDim / 2);
  const cornerFrontRolls = [rng(), rng(), rng(), rng()];

  if (depth < MIN_FRONTAGE) {
    // Tiny block: one building fills it and faces every street.
    const best = (['south', 'north', 'west', 'east'] as EdgeName[]).find((e) => classes[e] === 'avenue') ?? 'south';
    plans.push({
      rect: { ...bounds },
      front: best,
      sides: ['south', 'north', 'west', 'east'],
      corner: false,
      cls: classes[best],
    });
  } else {
    let cornerX = depth; // extent of corner lots along X
    let cornerZ = depth; // extent of corner lots along Z
    let edgeX = bw - 2 * depth;
    let edgeZ = bd - 2 * depth;
    if (edgeX < MIN_FRONTAGE) {
      cornerX = bw / 2;
      edgeX = 0;
    }
    if (edgeZ < MIN_FRONTAGE) {
      cornerZ = bd / 2;
      edgeZ = 0;
    }
    const { minX, maxX, minZ, maxZ } = bounds;

    const cornerPlan = (rect: Rect, h: EdgeName, v: EdgeName, roll: number): LotPlan => {
      let front: EdgeName;
      if (classes[h] !== classes[v]) front = classes[h] === 'avenue' ? h : v;
      else front = roll < 0.5 ? h : v;
      const side = front === h ? v : h;
      const cls: StreetClass = classes[h] === 'avenue' || classes[v] === 'avenue' ? 'avenue' : 'street';
      return { rect, front, sides: [side], corner: true, cls };
    };

    const edgePlans = (edge: EdgeName, length: number): LotPlan[] => {
      if (length <= 0) return [];
      const widths = splitFrontages(length, rng);
      const out: LotPlan[] = [];
      let t = 0;
      for (const w of widths) {
        const a = t;
        const b = t + w;
        t += w;
        let rect: Rect;
        // Each edge is walked counter-clockwise: south W->E, east S->N, north E->W, west N->S.
        if (edge === 'south') rect = { minX: minX + cornerX + a, maxX: minX + cornerX + b, minZ, maxZ: minZ + depth };
        else if (edge === 'north') rect = { minX: maxX - cornerX - b, maxX: maxX - cornerX - a, minZ: maxZ - depth, maxZ };
        else if (edge === 'east') rect = { minX: maxX - depth, maxX, minZ: minZ + cornerZ + a, maxZ: minZ + cornerZ + b };
        else rect = { minX, maxX: minX + depth, minZ: maxZ - cornerZ - b, maxZ: maxZ - cornerZ - a };
        out.push({ rect, front: edge, sides: [], corner: false, cls: classes[edge] });
      }
      // Snap the last piece onto the far corner so the street wall closes exactly.
      const last = out[out.length - 1].rect;
      if (edge === 'south') last.maxX = maxX - cornerX;
      else if (edge === 'north') last.minX = minX + cornerX;
      else if (edge === 'east') last.maxZ = maxZ - cornerZ;
      else last.minZ = minZ + cornerZ;
      return out;
    };

    plans.push(cornerPlan({ minX, maxX: minX + cornerX, minZ, maxZ: minZ + cornerZ }, 'south', 'west', cornerFrontRolls[0]));
    plans.push(...edgePlans('south', edgeX));
    plans.push(cornerPlan({ minX: maxX - cornerX, maxX, minZ, maxZ: minZ + cornerZ }, 'south', 'east', cornerFrontRolls[1]));
    plans.push(...edgePlans('east', edgeZ));
    plans.push(cornerPlan({ minX: maxX - cornerX, maxX, minZ: maxZ - cornerZ, maxZ }, 'north', 'east', cornerFrontRolls[2]));
    plans.push(...edgePlans('north', edgeX));
    plans.push(cornerPlan({ minX, maxX: minX + cornerX, minZ: maxZ - cornerZ, maxZ }, 'north', 'west', cornerFrontRolls[3]));
    plans.push(...edgePlans('west', edgeZ));

    const inner: Rect = { minX: minX + depth, maxX: maxX - depth, minZ: minZ + depth, maxZ: maxZ - depth };
    if (edgeX > 0 && edgeZ > 0 && inner.maxX - inner.minX >= MIN_COURTYARD && inner.maxZ - inner.minZ >= MIN_COURTYARD) {
      courtyard = inner;
    }
  }

  const lots: Lot[] = [];
  let prevFloors: number | null = null;
  plans.forEach((plan, k) => {
    const geo = lotGeometry(plan.rect, plan.front);
    const dirs = [EDGE_DIR[plan.front], ...plan.sides.map((s) => EDGE_DIR[s])];
    let floors = nextFloors(rng, prevFloors, plan.cls, plan.corner);
    // Close the ring: the last lot should also differ from the first.
    if (k === plans.length - 1 && plans.length > 2 && floors === lots[0].floors) {
      const [lo, hi] = FLOOR_RANGE[plan.cls];
      for (const cand of [floors + 1, floors - 1]) {
        if (cand >= lo && cand <= hi && cand !== prevFloors) {
          floors = cand;
          break;
        }
      }
    }
    prevFloors = floors;
    lots.push({
      id: `${blockId}-lot-${k}`,
      blockId,
      position: geo.position,
      facing: geo.facing,
      width: geo.width,
      depth: geo.depth,
      facades: facadesFor(geo.facing, dirs),
      corner: plan.corner,
      groundFloor: pickGroundFloor(rng, plan.corner, plan.cls),
      floors,
      seed: makeSeed(rng),
    });
  });

  return { lots, courtyard };
}

/** The single monument lot: the block inset by a plaza margin, facing the most important street. */
export function monumentLot(blockId: string, bounds: Rect, classes: EdgeClasses, rng: Rng): { lot: Lot; plaza: number } {
  const bw = bounds.maxX - bounds.minX;
  const bd = bounds.maxZ - bounds.minZ;
  const margin = Math.min(PLAZA_MARGIN, 0.15 * Math.min(bw, bd));
  const rect: Rect = {
    minX: bounds.minX + margin,
    maxX: bounds.maxX - margin,
    minZ: bounds.minZ + margin,
    maxZ: bounds.maxZ - margin,
  };
  const edges: EdgeName[] = ['south', 'north', 'west', 'east'];
  const roll = rng();
  const avenues = edges.filter((e) => classes[e] === 'avenue');
  const pool = avenues.length > 0 ? avenues : edges;
  const front = pool[Math.floor(roll * pool.length) % pool.length];
  const geo = lotGeometry(rect, front);
  return {
    plaza: margin,
    lot: {
      id: `${blockId}-lot-0`,
      blockId,
      position: geo.position,
      facing: geo.facing,
      width: geo.width,
      depth: geo.depth,
      facades: { front: true, back: true, left: true, right: true },
      corner: false,
      groundFloor: 'residential',
      floors: 3,
      seed: makeSeed(rng),
    },
  };
}
