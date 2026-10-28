// Deterministic city layout generator. Pure TypeScript, no React or Three.js.
// Same seed + settings always give the same CityLayout.
//
// v2: a jittered grid of streets with one avenue each way through the middle, perimeter blocks
// with continuous street walls (corner lots first, then 6-13 m frontages), courtyards, monument
// plazas, and street furniture data. See docs/DESIGN-3D.md section 4.

import { createRng } from '../core/rng';
import type { BlockKind, StreetClass, Vec2, WorldSettings } from '../core/types';
import { monumentLot, perimeterLots, type EdgeClasses } from './blocks';
import type {
  Block,
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

// Traffic.
const TRAFFIC_SPAWN_SPACING = 60; // metres of path per spawn point at trafficMultiplier = 1
const LANES_PER_ROAD = 2;

const LIGHT_TIMING: TrafficLightTiming = {
  cycleSeconds: 40,
  nsGreenSeconds: 18,
  ewGreenSeconds: 18,
  yellowSeconds: 2,
};

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
function spawnPointsFor(waypoints: readonly Vec2[], trafficMultiplier: number): Vec2[] {
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

  // Roads: one full-length segment per grid line.
  const roads: RoadSegment[] = [];
  xs.forEach((line, i) => {
    roads.push({
      id: `road-v-${i}`,
      orientation: 'vertical',
      start: { x: line.pos, z: zFirst },
      end: { x: line.pos, z: zLast },
      width: line.width,
      lanes: LANES_PER_ROAD,
      streetClass: line.cls,
      sidewalkWidth: line.sidewalk,
    });
  });
  zs.forEach((line, j) => {
    roads.push({
      id: `road-h-${j}`,
      orientation: 'horizontal',
      start: { x: xFirst, z: line.pos },
      end: { x: xLast, z: line.pos },
      width: line.width,
      lanes: LANES_PER_ROAD,
      streetClass: line.cls,
      sidewalkWidth: line.sidewalk,
    });
  });

  // Blocks and lots.
  const blocks: Block[] = [];
  const lots: Lot[] = [];
  const courtyards: Rect[] = [];
  const plazas: PlazaInfo[] = [];
  const inner = (line: GridLine) => line.width / 2 + line.sidewalk;

  for (let c = 0; c + 1 < xs.length; c++) {
    for (let r = 0; r + 1 < zs.length; r++) {
      const id = `block-${c}-${r}`;
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

  const { streetTrees, lamps, benches, crosswalks, intersections } = buildStreetscape({
    xs,
    zs,
    courtyards,
    plazas,
    streetTreeMultiplier,
    treeRng,
    furnitureRng,
  });

  // Fixed-timing traffic lights at every intersection.
  const trafficLights: TrafficLight[] = [];
  xs.forEach((vx, i) => {
    zs.forEach((hz, j) => {
      trafficLights.push({
        id: `light-${i}-${j}`,
        position: { x: vx.pos, z: hz.pos },
        timing: { ...LIGHT_TIMING },
      });
    });
  });

  // Traffic lanes: one path per direction along every road, lane centre at a quarter of the width.
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
    for (const direction of [1, -1] as const) {
      // Same convention as phase 1: offset = direction * width / 4.
      const offset = (direction * line.width) / 4;
      const ordered = direction === 1 ? zIdx : [...zIdx].reverse();
      const waypoints = ordered.map((j) => ({ x: line.pos + offset, z: zs[j].pos }));
      const lightIds = ordered.map((j) => `light-${i}-${j}`);
      addPath(`road-v-${i}`, direction, waypoints, lightIds);
    }
  });
  zs.forEach((line, j) => {
    for (const direction of [1, -1] as const) {
      const offset = (direction * line.width) / 4;
      const ordered = direction === 1 ? xIdx : [...xIdx].reverse();
      const waypoints = ordered.map((i) => ({ x: xs[i].pos, z: line.pos + offset }));
      const lightIds = ordered.map((i) => `light-${i}-${j}`);
      addPath(`road-h-${j}`, direction, waypoints, lightIds);
    }
  });

  return {
    seed,
    townBounds,
    blocks,
    lots,
    roads,
    streetTrees,
    trafficLights,
    trafficPaths,
    lamps,
    benches,
    crosswalks,
    intersections,
  };
}
