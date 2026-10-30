// Street decor planning (round 6, task 6.3): where the extra street furniture families go.
// Pure TypeScript (no Three.js), deterministic from layout.seed, and a pure function of the layout.
//
// Families planned here:
//   solids      bus stops (shelter + sign), kiosks, bike racks            avenue (and rack on streets) sidewalks
//   road decals manholes, patches, cracks, wheel-wear bands               lanes of every road
//   paving      slab shade variation                                      avenue sidewalks
//   curbs       tactile warning bars (kerb corners are in surfaces.ts)   crosswalk ends
//   fountain    one fountain plaza (+ benches, static pigeons)            the best free courtyard
//
// Everything solid stays inside the sidewalk strip on the building side of the pedestrian walking line,
// clear of lamps, trees, benches, bins, crossings, crossing roads' sidewalks and the carriageway
// (so parked cars and lanes are untouched). Decals are flat and sit between the lane markings.

import type { CityLayout, RoadSegment } from '../city/layout';
import { laneOffsetFor } from '../city/generate';
import { createRng } from '../core/rng';
import { KERB_RADIUS } from './surfaces';

// ---- Tunables ------------------------------------------------------------------------------------

/** Pedestrians walk along the sidewalk centre; solid furniture keeps this far from that line. */
export const WALK_CLEARANCE = 0.55;
/** Gap kept between a solid item and any obstacle (lamp, tree, bench, bin, other item). */
export const OBSTACLE_GAP = 0.15;
/** Extra distance past the crossing roads' sidewalks before solids start. */
const SOLID_EDGE = 1.0;
/** Road decals stay this far (beyond the crossing roads' sidewalk) from junctions and crossings. */
const DECAL_EDGE = 1.4;
const ROAD_CELL = 20;
const TACTILE_BARS = 3;
/** Clear space the fountain plaza keeps beyond its paved radius, from courtyard greenery. */
const GREENERY_CLEARANCE = 0.3;

/** Chance per side-segment of each family at seed-independent settings. */
export const DECOR_RATES = { busStop: 0.5, kiosk: 0.42, rackAvenue: 0.65, rackStreet: 0.3 } as const;

// Footprints (half extents in the item's local frame: x along the road, z toward the road).
export const BUS_STOP_HALF = { hx: 1.7, hz: 0.75 };
export const KIOSK_HALF = { hx: 0.85, hz: 0.65 };
export const BIKE_RACK_HALF = { hx: 1.3, hz: 0.35 };
export const BUS_SIGN_HALF = { hx: 0.2, hz: 0.2 };

// ---- Types ---------------------------------------------------------------------------------------

export type SolidKind = 'busStop' | 'busSign' | 'kiosk' | 'bikeRack';

/** An oriented rectangle on the ground. Local +z faces the road; yaw uses the layout convention. */
export interface DecorSolid {
  id: string;
  kind: SolidKind;
  x: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
  roadId: string;
  side: 1 | -1;
}

export interface Manhole { x: number; z: number; roadId: string }

export type PatchKind = 'dark' | 'light' | 'wear' | 'crack';
/** Axis-aligned road decal. */
export interface RoadPatch { kind: PatchKind; minX: number; maxX: number; minZ: number; maxZ: number; roadId: string }

export interface PavingTile { minX: number; maxX: number; minZ: number; maxZ: number; shade: 'dark' | 'light' }

/**
 * Rounded kerb corner of an intersection: (x, z) is the carriageway corner; (sx, sz) point into the sidewalk.
 * The geometry itself is built into the sidewalk surfaces (surfaces.ts); the plan keeps the list so the tactile
 * bars can be kept off the open corner.
 */
export interface KerbCorner { x: number; z: number; sx: 1 | -1; sz: 1 | -1; r: number }

/** One ground-level triangle of the courtyard greenery (hedges, beds, bushes), as XZ corners. */
export interface GreeneryTriangle { x: readonly [number, number, number]; z: readonly [number, number, number] }

/** One tactile bar: an axis-aligned rectangle at a crosswalk end. */
export interface TactileBar { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Pigeon { x: number; z: number; yaw: number; tint: number }

export interface FountainPlan {
  x: number;
  z: number;
  /** Basin outer radius. */
  basinRadius: number;
  /** Paved plaza radius around it. */
  plazaRadius: number;
  benches: { x: number; z: number; facing: number }[];
  pigeons: Pigeon[];
}

export interface DecorPlan {
  solids: DecorSolid[];
  manholes: Manhole[];
  patches: RoadPatch[];
  paving: PavingTile[];
  kerbCorners: KerbCorner[];
  tactile: TactileBar[];
  fountain: FountainPlan | null;
}

// ---- Geometry helpers ----------------------------------------------------------------------------

interface Circle { x: number; z: number; r: number }

interface Frame {
  road: RoadSegment;
  vertical: boolean;
  /** Coordinate of the centre line (x for vertical roads, z for horizontal). */
  v: number;
  u0: number;
  u1: number;
  half: number;
  sw: number;
}

function frameOf(road: RoadSegment): Frame {
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

function toWorld(f: Frame, along: number, lateral: number): { x: number; z: number } {
  return f.vertical ? { x: f.v + lateral, z: along } : { x: along, z: f.v + lateral };
}

/** Along-road ranges of `f` that are free of crossing roads plus `edge` metres beyond their sidewalks. */
function freeSegments(f: Frame, frames: readonly Frame[], edge: number): { a: number; b: number }[] {
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
function obstaclesOf(layout: CityLayout): Circle[] {
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

// ---- Planning ------------------------------------------------------------------------------------

/**
 * Plans every decor family. `greenery` is the courtyard greenery's ground triangles for the same layout (see
 * courtyardGreeneryFootprint); the fountain plaza is placed where none of them lie.
 */
export function planStreetDecor(layout: CityLayout, greenery: readonly GreeneryTriangle[]): DecorPlan {
  const rng = createRng((Math.imul(layout.seed | 0, 2654435761) ^ 0x5eed6a3) >>> 0);
  const frames = layout.roads.map(frameOf);
  const obstacles = obstaclesOf(layout);

  const plan: DecorPlan = { solids: [], manholes: [], patches: [], paving: [], kerbCorners: [], tactile: [], fountain: null };

  planSolids(frames, obstacles, rng, plan);
  planRoadDecals(frames, rng, plan);
  planPaving(frames, rng, plan);
  planKerbs(layout, frames, plan);
  plan.fountain = planFountain(layout, createRng((Math.imul(layout.seed | 0, 40503) ^ 0xf0f7a1) >>> 0), greenery);
  return plan;
}

function planSolids(frames: readonly Frame[], obstacles: Circle[], rng: () => number, plan: DecorPlan): void {
  const fits = (s: Pick<DecorSolid, 'x' | 'z' | 'yaw' | 'hx' | 'hz'>): boolean =>
    obstacles.every((c) => rectCircleDistance(s, c) >= c.r + OBSTACLE_GAP);

  for (const f of frames) {
    const avenue = f.road.streetClass === 'avenue';
    const segs = freeSegments(f, frames, SOLID_EDGE);
    for (const side of [-1, 1] as const) {
      // Facing from this sidewalk toward the road (same convention as lamps and benches).
      const yaw = f.vertical ? Math.atan2(-side, 0) : Math.atan2(0, -side);
      for (const seg of segs) {
        // Fixed number of draws per (road, side, segment) keeps the stream independent of what fits.
        const rBus = rng(), rKiosk = rng(), rRack = rng(), pBus = rng(), pKiosk = rng(), pRack = rng();

        const place = (
          kind: SolidKind,
          half: { hx: number; hz: number },
          lateralFromCurb: number,
          startRoll: number,
        ): DecorSolid | null => {
          const lo = seg.a + half.hx;
          const hi = seg.b - half.hx;
          if (hi < lo) return null;
          const n = Math.floor((hi - lo) / 0.5) + 1;
          const start = Math.floor(startRoll * n);
          for (let k = 0; k < n; k++) {
            const along = lo + ((start + k) % n) * 0.5;
            const p = toWorld(f, along, side * (f.half + lateralFromCurb));
            const cand = { x: p.x, z: p.z, yaw, hx: half.hx, hz: half.hz };
            if (!fits(cand)) continue;
            const solid: DecorSolid = { id: `decor-${kind}-${plan.solids.length}`, kind, ...cand, roadId: f.road.id, side };
            plan.solids.push(solid);
            obstacles.push({ x: solid.x, z: solid.z, r: Math.hypot(half.hx, half.hz) });
            return solid;
          }
          return null;
        };
        /** Centre offset from the curb for a depth-`hz` item pushed against the building side. */
        const backCentre = (hz: number, margin: number): number => f.sw - margin - hz;
        /** Does an item of half depth hz keep the pedestrian line clear when pushed back? */
        const keepsWalkClear = (hz: number, margin: number): boolean =>
          backCentre(hz, margin) - hz >= f.sw / 2 + WALK_CLEARANCE;

        if (avenue && rBus < DECOR_RATES.busStop && keepsWalkClear(BUS_STOP_HALF.hz, 0.12)) {
          const stop = place('busStop', BUS_STOP_HALF, backCentre(BUS_STOP_HALF.hz, 0.12), pBus);
          if (stop) {
            // Sign pole at the curb, a little beyond the shelter along the road (either end that fits).
            for (const dir of [1, -1]) {
              const along = (f.vertical ? stop.z : stop.x) + dir * (BUS_STOP_HALF.hx + 1.2);
              const p = toWorld(f, along, side * (f.half + 0.5));
              const cand = { x: p.x, z: p.z, yaw, hx: BUS_SIGN_HALF.hx, hz: BUS_SIGN_HALF.hz };
              if (along < seg.a || along > seg.b || !fits(cand)) continue;
              plan.solids.push({ id: `decor-busSign-${plan.solids.length}`, kind: 'busSign', ...cand, roadId: f.road.id, side });
              obstacles.push({ x: cand.x, z: cand.z, r: 0.3 });
              break;
            }
          }
        }
        if (avenue && rKiosk < DECOR_RATES.kiosk && keepsWalkClear(KIOSK_HALF.hz, 0.12)) {
          place('kiosk', KIOSK_HALF, backCentre(KIOSK_HALF.hz, 0.12), pKiosk);
        }
        const rackRate = avenue ? DECOR_RATES.rackAvenue : DECOR_RATES.rackStreet;
        if (rRack < rackRate && keepsWalkClear(BIKE_RACK_HALF.hz, 0.15)) {
          place('bikeRack', BIKE_RACK_HALF, backCentre(BIKE_RACK_HALF.hz, 0.15), pRack);
        }
      }
    }
  }
}

function planRoadDecals(frames: readonly Frame[], rng: () => number, plan: DecorPlan): void {
  for (const f of frames) {
    const lane0 = laneOffsetFor({ width: f.road.width, cls: f.road.streetClass });
    // Degenerate widths (test fixtures) fall back to the street rule.
    const lane = lane0 >= 1.2 ? lane0 : f.road.width / 4;
    for (const seg of freeSegments(f, frames, DECAL_EDGE)) {
      const cells = Math.floor((seg.b - seg.a) / ROAD_CELL);
      for (let c = 0; c < cells; c++) {
        const mid = seg.a + (c + 0.5) * ((seg.b - seg.a) / cells);
        // Fixed draws per cell.
        const rKind = rng(), rSide = rng(), rJit = rng(), rLen = rng(), rWid = rng(), rShade = rng();
        const sgn = rSide < 0.5 ? -1 : 1;
        const jitter = (rJit - 0.5) * 6;
        const along = mid + jitter;
        const put = (kind: PatchKind, len: number, wid: number, lateral: number) => {
          const p0 = toWorld(f, along - len / 2, lateral - wid / 2);
          const p1 = toWorld(f, along + len / 2, lateral + wid / 2);
          plan.patches.push({
            kind,
            minX: Math.min(p0.x, p1.x), maxX: Math.max(p0.x, p1.x),
            minZ: Math.min(p0.z, p1.z), maxZ: Math.max(p0.z, p1.z),
            roadId: f.road.id,
          });
        };
        if (rKind < 0.26) {
          const p = toWorld(f, along, sgn * lane);
          plan.manholes.push({ x: p.x, z: p.z, roadId: f.road.id });
        } else if (rKind < 0.5) {
          put(rShade < 0.6 ? 'dark' : 'light', 1.2 + rLen * 1.6, 0.9 + rWid * 0.6, sgn * (lane + (rJit - 0.5) * 0.3));
        } else if (rKind < 0.68) {
          // Two wheel tracks of slightly different tone.
          const len = 10 + rLen * 6;
          put('wear', len, 0.4, sgn * (lane - 0.55));
          put('wear', len, 0.4, sgn * (lane + 0.55));
        } else if (rKind < 0.78) {
          put('crack', 2.2 + rLen * 2.4, 0.06 + rWid * 0.04, sgn * (lane + (rJit - 0.5) * 0.8));
        }
      }
    }
  }
}

function planPaving(frames: readonly Frame[], rng: () => number, plan: DecorPlan): void {
  const TILE = 1.5;
  const GAP = 0.03;
  const INNER = 2.0; // beyond the tree pits (curb + 0.65 .. 1.95)
  for (const f of frames) {
    if (f.road.streetClass !== 'avenue' || f.sw < INNER + 1) continue;
    for (const seg of freeSegments(f, frames, 0.3)) {
      const cols = Math.max(1, Math.round((seg.b - seg.a) / TILE));
      const colW = (seg.b - seg.a) / cols;
      const rows = Math.max(1, Math.round((f.sw - INNER) / 1.25));
      const rowW = (f.sw - INNER) / rows;
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < cols; i++) {
          for (let j = 0; j < rows; j++) {
            const roll = rng();
            if (roll >= 0.55) continue;
            const a0 = seg.a + i * colW + GAP, a1 = seg.a + (i + 1) * colW - GAP;
            const l0 = f.half + INNER + j * rowW + GAP, l1 = f.half + INNER + (j + 1) * rowW - GAP;
            const p0 = toWorld(f, a0, side * l0);
            const p1 = toWorld(f, a1, side * l1);
            plan.paving.push({
              minX: Math.min(p0.x, p1.x), maxX: Math.max(p0.x, p1.x),
              minZ: Math.min(p0.z, p1.z), maxZ: Math.max(p0.z, p1.z),
              shade: roll < 0.3 ? 'dark' : 'light',
            });
          }
        }
      }
    }
  }
}

function planKerbs(layout: CityLayout, frames: readonly Frame[], plan: DecorPlan): void {
  const vRoads = frames.filter((f) => f.vertical);
  const hRoads = frames.filter((f) => !f.vertical);
  for (const it of layout.intersections) {
    // A grid line can be split into pieces (block merges), so each side is checked against every piece on it.
    const vs = vRoads.filter((f) => Math.abs(f.v - it.center.x) < 0.01);
    const hs = hRoads.filter((f) => Math.abs(f.v - it.center.z) < 0.01);
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        // The corner square exists when both roads continue past the junction on that side.
        let found = false;
        for (const v of vs) {
          for (const h of hs) {
            const reachX = it.center.x + sx * (v.half + v.sw);
            const reachZ = it.center.z + sz * (h.half + h.sw);
            if (reachX >= h.u0 && reachX <= h.u1 && reachZ >= v.u0 && reachZ <= v.u1) found = true;
          }
        }
        if (!found) continue;
        plan.kerbCorners.push({ x: it.center.x + sx * it.sizeX / 2, z: it.center.z + sz * it.sizeZ / 2, sx, sz, r: KERB_RADIUS });
      }
    }
  }
  for (const cw of layout.crosswalks) {
    const walkX = cw.orientation === 'horizontal';
    const across = cw.width - 0.8; // perpendicular to the walking direction
    for (const end of [-1, 1]) {
      for (let k = 0; k < TACTILE_BARS; k++) {
        const d0 = cw.length / 2 + 0.3 + k * 0.2;
        const d1 = d0 + 0.1;
        const a = end > 0 ? d0 : -d1;
        const b = end > 0 ? d1 : -d0;
        plan.tactile.push(
          walkX
            ? { minX: cw.center.x + a, maxX: cw.center.x + b, minZ: cw.center.z - across / 2, maxZ: cw.center.z + across / 2 }
            : { minX: cw.center.x - across / 2, maxX: cw.center.x + across / 2, minZ: cw.center.z + a, maxZ: cw.center.z + b },
        );
      }
    }
  }
}

/** Fountain basin and plaza radii (metres). */
export const FOUNTAIN_BASIN_RADIUS = 1.75;
export const FOUNTAIN_PLAZA_RADIUS = 3.4;

/** Distance from (px, pz) to a triangle in XZ (0 when inside). */
export function distanceToTriangle(px: number, pz: number, t: GreeneryTriangle): number {
  const { x, z } = t;
  let pos = 0, neg = 0;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const s = (x[j] - x[i]) * (pz - z[i]) - (z[j] - z[i]) * (px - x[i]);
    if (s >= 0) pos++;
    if (s <= 0) neg++;
  }
  if (pos === 3 || neg === 3) return 0;
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const ex = x[j] - x[i], ez = z[j] - z[i];
    const len2 = ex * ex + ez * ez;
    const k = len2 > 0 ? Math.max(0, Math.min(1, ((px - x[i]) * ex + (pz - z[i]) * ez) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (x[i] + ex * k), pz - (z[i] + ez * k)));
  }
  return best;
}

function planFountain(layout: CityLayout, rng: () => number, greenery: readonly GreeneryTriangle[]): FountainPlan | null {
  const need = FOUNTAIN_PLAZA_RADIUS + 0.9;
  const reach = FOUNTAIN_PLAZA_RADIUS + GREENERY_CLEARANCE;
  const trees = layout.streetTrees.filter((t) => t.setting === 'courtyard');
  const ranked = layout.blocks
    .filter((b) => b.courtyard)
    .map((b) => b.courtyard!)
    .map((c) => ({ c, area: (c.maxX - c.minX) * (c.maxZ - c.minZ) }))
    .filter(({ c }) => c.maxX - c.minX >= need * 2 + 1 && c.maxZ - c.minZ >= need * 2 + 1)
    .sort((a, b) => b.area - a.area);

  for (const { c } of ranked) {
    const cx = (c.minX + c.maxX) / 2, cz = (c.minZ + c.maxZ) / 2;
    // Greenery of this courtyard only: its triangles lie inside the courtyard rectangle.
    const local = greenery.filter((t) => {
      const xs = t.x, zs = t.z;
      return Math.max(...xs) >= c.minX - reach && Math.min(...xs) <= c.maxX + reach
        && Math.max(...zs) >= c.minZ - reach && Math.min(...zs) <= c.maxZ + reach;
    });
    let best: { x: number; z: number; d: number } | null = null;
    for (let x = c.minX + need; x <= c.maxX - need + 1e-6; x += 1) {
      for (let z = c.minZ + need; z <= c.maxZ - need + 1e-6; z += 1) {
        if (trees.some((t) => Math.hypot(t.position.x - x, t.position.z - z) < need)) continue;
        if (local.some((t) => distanceToTriangle(x, z, t) < reach)) continue;
        const d = Math.hypot(x - cx, z - cz);
        if (!best || d < best.d) best = { x, z, d };
      }
    }
    if (!best) continue;
    const { x, z } = best;
    const benches = [0, 1].map((k) => {
      const a = k * Math.PI + Math.PI / 4;
      const bx = x + Math.sin(a) * 2.85;
      const bz = z + Math.cos(a) * 2.85;
      return { x: bx, z: bz, facing: Math.atan2(x - bx, z - bz) };
    });
    const pigeons: Pigeon[] = [];
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2;
      const r = 2.1 + rng() * 0.9;
      const yaw = rng() * Math.PI * 2;
      const tint = rng();
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      // Keep birds off the benches.
      if (benches.some((b) => Math.hypot(b.x - px, b.z - pz) < 1.1)) continue;
      pigeons.push({ x: px, z: pz, yaw, tint });
    }
    return { x, z, basinRadius: FOUNTAIN_BASIN_RADIUS, plazaRadius: FOUNTAIN_PLAZA_RADIUS, benches, pigeons };
  }
  return null;
}
