// Deterministic city layout generator. Pure TypeScript, no React or Three.js.
// Same seed + settings always give the same CityLayout.
//
// v2: a jittered grid of streets with one avenue each way through the middle, perimeter blocks
// with continuous street walls (corner lots first, then 6-13 m frontages), courtyards, monument
// plazas, and street furniture data. See docs/DESIGN-3D.md section 4.

import { createRng } from '../core/rng';
import type { BlockKind, StreetClass, Vec2, WorldSettings } from '../core/types';
import { monumentLot, perimeterLots, type EdgeClasses } from './blocks';
import { ARM_E, ARM_N, ARM_S, ARM_W, armCount, junctionArms } from './junctionArms';
import { hashId, houseBlockId, mergedBlockId, memberIds, resolveBlockMerges, unionBounds, type MergeRect } from './merge';
import type {
  Block,
  BlockMerge,
  CityLayout,
  Lot,
  RoadSegment,
  Rect,
  TrafficLight,
  TrafficLightTiming,
  TrafficPath,
} from './layout';
import { buildStreetscape, type GridLine, type PlazaInfo } from './streetscape';

// Geometry constants (metres).
export const STREET_WIDTH = 8;
export const STREET_SIDEWALK = 3;
export const AVENUE_WIDTH = 11;
export const AVENUE_SIDEWALK = 4.5;
/** Keeps road centre lines (and the street sidewalks on outer roads) inside the town bounds. */
const GRID_MARGIN = 6;
/** Target and allowed distance between road centre lines. */
const CELL_TARGET = 50;
const CELL_MIN = 40;
const CELL_MAX = 60;
/** Blocks smaller than this in either direction are skipped. */
const MIN_BLOCK = 6;

// Block kind.
export const MONUMENT_CHANCE = 0.1;

// Independent RNG streams.
const GRID_SALT = 0x51ed270b;
const BLOCK_SALT = 0x2545f491;
const TREE_SEED_SALT = 0x9e3779b9;
const FURNITURE_SALT = 0x7f4a7c15;
const MERGE_SALT = 0x3c6ef372;

// Traffic.
const TRAFFIC_SPAWN_SPACING = 60; // metres of path per spawn point at trafficMultiplier = 1
const LANES_PER_ROAD = 2;

const LIGHT_TIMING: TrafficLightTiming = {
  cycleSeconds: 40,
  nsGreenSeconds: 16,
  ewGreenSeconds: 16,
  yellowSeconds: 2,
  allRedSeconds: 2,
};

/**
 * Distance from an avenue's centre line to its lane centres. Avenues have parked cars along both
 * kerbs (up to about 3.15 m from the centre line at their inner side); a bus (half width 1.25 m) plus
 * 0.15 m of clearance must fit between that and the lane centre, so lane centre = half width - 3.75.
 * Streets have no parking and keep a quarter of the width.
 */
export function laneOffsetFor(line: { width: number; cls: string }): number {
  return line.cls === 'avenue' ? line.width / 2 - 3.75 : line.width / 4;
}

/**
 * Jittered road centre lines from `min` to `max` inclusive. Gaps stay within CELL_MIN..CELL_MAX
 * whenever the span allows it. The number of draws depends only on the span.
 */
function jitteredLines(min: number, max: number, rng: () => number): number[] {
  const span = max - min;
  const n = Math.max(1, Math.round(span / CELL_TARGET));
  const mean = span / n;
  const lo = Math.min(CELL_MIN, mean);
  const hi = Math.max(CELL_MAX, mean);
  let gaps = Array.from({ length: n }, () => mean * (1 + (rng() - 0.5) * 0.36));
  const sum0 = gaps.reduce((a, b) => a + b, 0);
  gaps = gaps.map((g) => (g * span) / sum0);
  for (let iter = 0; iter < 20; iter++) {
    gaps = gaps.map((g) => Math.min(hi, Math.max(lo, g)));
    const diff = span - gaps.reduce((a, b) => a + b, 0);
    if (Math.abs(diff) < 1e-9) break;
    const free = gaps.map((g) => (diff > 0 ? g < hi - 1e-9 : g > lo + 1e-9));
    const count = free.filter(Boolean).length;
    if (count === 0) break;
    gaps = gaps.map((g, k) => (free[k] ? g + diff / count : g));
  }
  const lines = [min];
  let acc = min;
  for (let k = 0; k < n - 1; k++) {
    acc += gaps[k];
    lines.push(acc);
  }
  lines.push(max);
  return lines;
}

/** Grid lines with their street class: the interior line nearest the centre is the avenue. */
function classifyLines(positions: number[]): GridLine[] {
  let avenue = -1;
  let best = Infinity;
  for (let k = 1; k < positions.length - 1; k++) {
    if (Math.abs(positions[k]) < best) {
      best = Math.abs(positions[k]);
      avenue = k;
    }
  }
  return positions.map((pos, k) => {
    const cls: StreetClass = k === avenue ? 'avenue' : 'street';
    return {
      pos,
      cls,
      width: cls === 'avenue' ? AVENUE_WIDTH : STREET_WIDTH,
      sidewalk: cls === 'avenue' ? AVENUE_SIDEWALK : STREET_SIDEWALK,
    };
  });
}

function polylineLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    total += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return total;
}

/** Evenly spaced spawn points along a path; count scales with trafficMultiplier. */
export function spawnPointsFor(waypoints: readonly Vec2[], trafficMultiplier: number): Vec2[] {
  const length = polylineLength(waypoints);
  const count = Math.max(0, Math.round((trafficMultiplier * length) / TRAFFIC_SPAWN_SPACING));
  if (count === 0 || waypoints.length < 2) return [];

  const spawns: Vec2[] = [];
  for (let k = 0; k < count; k++) {
    const target = (k / count) * length;
    let walked = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (target <= walked + segLen || i === waypoints.length - 1) {
        const t = segLen > 0 ? Math.min(1, (target - walked) / segLen) : 0;
        spawns.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
        break;
      }
      walked += segLen;
    }
  }
  return spawns;
}

/** Splits [lo, hi] around the cut intervals and returns the pieces that remain (longer than a micron). */
function splitAround(lo: number, hi: number, cuts: readonly { a: number; b: number }[]): [number, number][] {
  const out: [number, number][] = [];
  let cur = lo;
  for (const c of [...cuts].sort((p, q) => p.a - q.a)) {
    if (c.a > cur) out.push([cur, c.a]);
    cur = Math.max(cur, c.b);
  }
  if (hi > cur) out.push([cur, hi]);
  return out.filter(([a, b]) => b - a > 1e-6);
}

export function generateCity(settings: WorldSettings): CityLayout {
  const { seed, townWidth, townDepth, streetTreeMultiplier, trafficMultiplier } = settings;
  const townBounds: Rect = {
    minX: -townWidth / 2,
    maxX: townWidth / 2,
    minZ: -townDepth / 2,
    maxZ: townDepth / 2,
  };

  // Separate RNG streams: the grid, the buildings, the trees and the furniture never influence
  // each other, so changing streetTreeMultiplier leaves every building untouched.
  const gridRng = createRng((seed ^ GRID_SALT) >>> 0);
  const blockRng = createRng((seed ^ BLOCK_SALT) >>> 0);
  const kindRng = createRng(seed);
  const treeRng = createRng((seed ^ TREE_SEED_SALT) >>> 0);
  const furnitureRng = createRng((seed ^ FURNITURE_SALT) >>> 0);

  const spanX = townWidth - 2 * GRID_MARGIN;
  const spanZ = townDepth - 2 * GRID_MARGIN;
  if (spanX <= 0 || spanZ <= 0) {
    return {
      seed,
      townBounds,
      blocks: [],
      lots: [],
      roads: [],
      streetTrees: [],
      trafficLights: [],
      trafficPaths: [],
      lamps: [],
      benches: [],
      crosswalks: [],
      intersections: [],
    };
  }

  const xs = classifyLines(jitteredLines(-townWidth / 2 + GRID_MARGIN, townWidth / 2 - GRID_MARGIN, gridRng));
  const zs = classifyLines(jitteredLines(-townDepth / 2 + GRID_MARGIN, townDepth / 2 - GRID_MARGIN, gridRng));
  const zFirst = zs[0].pos;
  const zLast = zs[zs.length - 1].pos;
  const xFirst = xs[0].pos;
  const xLast = xs[xs.length - 1].pos;

  // Blocks and lots. Every cell is drawn, merged or not, so the random streams of the other blocks never move.
  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const courtyards: Rect[] = [];
  const plazas: PlazaInfo[] = [];
  const inner = (line: GridLine) => line.width / 2 + line.sidewalk;

  for (let c = 0; c + 1 < xs.length; c++) {
    for (let r = 0; r + 1 < zs.length; r++) {
      const id = houseBlockId(c, r);
      // Drawn for every cell so the stream stays deterministic.
      const kind: BlockKind = kindRng() < MONUMENT_CHANCE ? 'monument' : 'houses';

      const bounds: Rect = {
        minX: xs[c].pos + inner(xs[c]),
        maxX: xs[c + 1].pos - inner(xs[c + 1]),
        minZ: zs[r].pos + inner(zs[r]),
        maxZ: zs[r + 1].pos - inner(zs[r + 1]),
      };
      const bw = bounds.maxX - bounds.minX;
      const bd = bounds.maxZ - bounds.minZ;
      if (bw < MIN_BLOCK || bd < MIN_BLOCK) continue;

      const classes: EdgeClasses = {
        south: zs[r].cls,
        north: zs[r + 1].cls,
        west: xs[c].cls,
        east: xs[c + 1].cls,
      };
      // Each block draws from its own sub-stream so blocks do not shift each other's details.
      const rng = createRng((blockRng() * 4294967296) >>> 0);

      if (kind === 'monument') {
        const { lot, plaza } = monumentLot(id, bounds, classes, rng);
        blocks.push({ id, kind, bounds, courtyard: null });
        lots.push(lot);
        plazas.push({ bounds, margin: plaza });
        continue;
      }

      const result = perimeterLots(id, bounds, classes, rng);
      blocks.push({ id, kind, bounds, courtyard: result.courtyard });
      lots.push(...result.lots);
      if (result.courtyard) courtyards.push(result.courtyard);
    }
  }

  // Block merges. Each accepted group replaces its member blocks by one block: bounds = union of the members,
  // lots = the perimeter of the merged block (so only the outer edges carry houses), courtyard = its interior.
  const { accepted: merges } = resolveBlockMerges(
    settings.blockMerges ?? [],
    new Set(blocks.filter((b) => b.kind === 'houses').map((b) => b.id)),
  );
  const mergeRecords: BlockMerge[] = [];
  let outBlocks = blocks;
  let outLots = lots;
  let outCourtyards = courtyards;
  if (merges.length > 0) {
    const memberOf = new Map<string, MergeRect>();
    for (const m of merges) for (const id of memberIds(m)) memberOf.set(id, m);
    const blockById = new Map(blocks.map((b) => [b.id, b] as const));
    const emitted = new Set<MergeRect>();
    outBlocks = [];
    const mergedLots: Lot[] = [];
    for (const b of blocks) {
      const m = memberOf.get(b.id);
      if (!m) {
        outBlocks.push(b);
        continue;
      }
      if (emitted.has(m)) continue;
      emitted.add(m);
      const id = mergedBlockId(m);
      const members = memberIds(m);
      const bounds = unionBounds(members.map((mid) => blockById.get(mid)!.bounds));
      const classes: EdgeClasses = {
        south: zs[m.r0].cls,
        north: zs[m.r1 + 1].cls,
        west: xs[m.c0].cls,
        east: xs[m.c1 + 1].cls,
      };
      // Own random stream per merged block (keyed by its id), so no other block is affected.
      const rng = createRng((seed ^ MERGE_SALT ^ hashId(id)) >>> 0);
      const built = perimeterLots(id, bounds, classes, rng);
      outBlocks.push({ id, kind: 'houses', bounds, courtyard: built.courtyard ? { ...built.courtyard, merged: true } : null });
      mergedLots.push(...built.lots);
      mergeRecords.push({ id, members, bounds });
    }
    outLots = lots.filter((l) => !memberOf.has(l.blockId)).concat(mergedLots);
    outCourtyards = outBlocks.flatMap((b) => (b.courtyard ? [b.courtyard] : []));
  }

  // A street between two merged blocks disappears: a grid line inside a merge is cut between the two outer
  // streets that bound it. Lines without cuts keep their id and their whole length.
  const vCuts = (i: number) => merges.filter((m) => m.c0 < i && i <= m.c1).map((m) => ({ a: zs[m.r0].pos, b: zs[m.r1 + 1].pos }));
  const hCuts = (j: number) => merges.filter((m) => m.r0 < j && j <= m.r1).map((m) => ({ a: xs[m.c0].pos, b: xs[m.c1 + 1].pos }));
  const vParts = xs.map((_, i) => splitAround(zFirst, zLast, vCuts(i)));
  const hParts = zs.map((_, j) => splitAround(xFirst, xLast, hCuts(j)));

  // Roads: one full-length segment per grid line, or the pieces that remain.
  const roads: RoadSegment[] = [];
  xs.forEach((line, i) => {
    const split = vCuts(i).length > 0;
    vParts[i].forEach(([a, b], k) => {
      roads.push({
        id: split ? `road-v-${i}-${k}` : `road-v-${i}`,
        orientation: 'vertical',
        start: { x: line.pos, z: a },
        end: { x: line.pos, z: b },
        width: line.width,
        lanes: LANES_PER_ROAD,
        streetClass: line.cls,
        sidewalkWidth: line.sidewalk,
      });
    });
  });
  zs.forEach((line, j) => {
    const split = hCuts(j).length > 0;
    hParts[j].forEach(([a, b], k) => {
      roads.push({
        id: split ? `road-h-${j}-${k}` : `road-h-${j}`,
        orientation: 'horizontal',
        start: { x: a, z: line.pos },
        end: { x: b, z: line.pos },
        width: line.width,
        lanes: LANES_PER_ROAD,
        streetClass: line.cls,
        sidewalkWidth: line.sidewalk,
      });
    });
  });

  const streetscape = buildStreetscape({
    xs,
    zs,
    courtyards: outCourtyards,
    plazas,
    streetTreeMultiplier,
    treeRng,
    furnitureRng,
  });

  // Street furniture and junctions that stand where a merged block's inner streets were are dropped.
  const inMerged = (x: number, z: number) =>
    mergeRecords.some((mr) => x > mr.bounds.minX && x < mr.bounds.maxX && z > mr.bounds.minZ && z < mr.bounds.maxZ);
  const removedJunction = (i: number, j: number) => merges.some((m) => m.c0 < i && i <= m.c1 && m.r0 < j && j <= m.r1);
  const vStreetGone = (i: number, z: number) => merges.some((m) => m.c0 < i && i <= m.c1 && zs[m.r0].pos < z && z < zs[m.r1 + 1].pos);
  const hStreetGone = (j: number, x: number) => merges.some((m) => m.r0 < j && j <= m.r1 && xs[m.c0].pos < x && x < xs[m.c1 + 1].pos);
  const streetTrees = streetscape.streetTrees.filter((t) => !(t.setting === 'street' && inMerged(t.position.x, t.position.z)));
  const lamps = streetscape.lamps.filter((l) => !inMerged(l.position.x, l.position.z));
  const benches = streetscape.benches.filter((b) => !inMerged(b.position.x, b.position.z));
  // Real arms of every junction (city/junctionArms.ts). Without merges every junction has four.
  const armsAt = junctionArms({ roads });
  const nearestLine = (lines: readonly GridLine[], v: number) =>
    lines.reduce((best, l, k) => (Math.abs(l.pos - v) < Math.abs(lines[best].pos - v) ? k : best), 0);
  // A crossing joins the two sidewalk corners on either side of the street it crosses. Those corners exist only
  // where the perpendicular street carries on: a crossing whose far end would meet a merged block's house wall
  // (the perpendicular arm is gone) is dropped, and its tactile bars with it (they derive from crosswalks).
  const crosswalks = streetscape.crosswalks.filter((cw) => {
    if (cw.orientation === 'horizontal') {
      const i = xs.findIndex((l) => Math.abs(l.pos - cw.center.x) < 1e-9);
      if (i >= 0 && vStreetGone(i, cw.center.z)) return false;
      if (merges.length === 0 || i < 0) return true;
      const arms = armsAt(xs[i].pos, zs[nearestLine(zs, cw.center.z)].pos);
      return (arms & ARM_E) !== 0 && (arms & ARM_W) !== 0;
    }
    const j = zs.findIndex((l) => Math.abs(l.pos - cw.center.z) < 1e-9);
    if (j >= 0 && hStreetGone(j, cw.center.x)) return false;
    if (merges.length === 0 || j < 0) return true;
    const arms = armsAt(xs[nearestLine(xs, cw.center.x)].pos, zs[j].pos);
    return (arms & ARM_N) !== 0 && (arms & ARM_S) !== 0;
  });
  const intersections = streetscape.intersections.filter((it) => {
    const m = /-(\d+)-(\d+)$/.exec(it.id);
    return !(m && removedJunction(Number(m[1]), Number(m[2])));
  });

  // Fixed-timing traffic lights at every intersection that remains with three or four arms. A junction a merge
  // leaves with two arms (straight on or a bend) has no signal; without merges every junction has four arms.
  const trafficLights: TrafficLight[] = [];
  xs.forEach((vx, i) => {
    zs.forEach((hz, j) => {
      if (removedJunction(i, j)) return;
      if (merges.length > 0 && armCount(armsAt(vx.pos, hz.pos)) <= 2) return;
      trafficLights.push({
        id: `light-${i}-${j}`,
        position: { x: vx.pos, z: hz.pos },
        timing: { ...LIGHT_TIMING },
      });
    });
  });

  // Traffic lanes: one path per direction along every road piece, lane centre at a quarter of the width.
  const trafficPaths: TrafficPath[] = [];
  const addPath = (roadId: string, direction: 1 | -1, waypoints: Vec2[], lightIds: string[]) => {
    trafficPaths.push({
      id: `path-${roadId}-${direction === 1 ? 'pos' : 'neg'}`,
      roadId,
      direction,
      lane: direction === 1 ? 0 : 1,
      waypoints,
      spawnPoints: spawnPointsFor(waypoints, trafficMultiplier),
      trafficLightIds: lightIds,
    });
  };

  const zIdx = zs.map((_, j) => j);
  const xIdx = xs.map((_, i) => i);
  xs.forEach((line, i) => {
    const split = vCuts(i).length > 0;
    vParts[i].forEach(([a, b], k) => {
      const roadId = split ? `road-v-${i}-${k}` : `road-v-${i}`;
      const idx = zIdx.filter((j) => zs[j].pos >= a - 1e-9 && zs[j].pos <= b + 1e-9);
      for (const direction of [1, -1] as const) {
        // Offset = direction * lane offset (a quarter of the width on streets, clear of parked cars on avenues).
        const offset = direction * laneOffsetFor(line);
        const ordered = direction === 1 ? idx : [...idx].reverse();
        const waypoints = ordered.map((j) => ({ x: line.pos + offset, z: zs[j].pos }));
        const lightIds = ordered.map((j) => `light-${i}-${j}`);
        if (waypoints.length >= 2) addPath(roadId, direction, waypoints, lightIds);
      }
    });
  });
  zs.forEach((line, j) => {
    const split = hCuts(j).length > 0;
    hParts[j].forEach(([a, b], k) => {
      const roadId = split ? `road-h-${j}-${k}` : `road-h-${j}`;
      const idx = xIdx.filter((i) => xs[i].pos >= a - 1e-9 && xs[i].pos <= b + 1e-9);
      for (const direction of [1, -1] as const) {
        const offset = direction * laneOffsetFor(line);
        const ordered = direction === 1 ? idx : [...idx].reverse();
        const waypoints = ordered.map((i) => ({ x: xs[i].pos, z: line.pos + offset }));
        const lightIds = ordered.map((i) => `light-${i}-${j}`);
        if (waypoints.length >= 2) addPath(roadId, direction, waypoints, lightIds);
      }
    });
  });

  return {
    seed,
    townBounds,
    blocks: outBlocks,
    lots: outLots,
    roads,
    streetTrees,
    trafficLights,
    trafficPaths,
    lamps,
    benches,
    crosswalks,
    intersections,
    // Only present when a merge is in force, so a town without merges serialises exactly as before.
    ...(mergeRecords.length > 0 ? { merges: mergeRecords } : {}),
  };
}
