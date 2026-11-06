// Deterministic city layout generator. Pure TypeScript, no React or Three.js.
// Same seed + settings always give the same CityLayout.
//
// v2: a jittered grid of streets with one avenue each way through the middle, perimeter blocks
// with continuous street walls (corner lots first, then 6-13 m frontages), courtyards, monument
// plazas, and street furniture data. See docs/DESIGN-3D.md section 4.
// Helpers live beside this file: gridLines.ts, spawnPoints.ts, monuments.ts, trafficPlan.ts.

import { createRng } from '../core/rng';
import type { BlockKind, WorldSettings } from '../core/types';
import { monumentLot, perimeterLots, type EdgeClasses } from './blocks';
import { ARM_E, ARM_N, ARM_S, ARM_W, junctionArms } from './junctionArms';
import { hashId, houseBlockId, mergedBlockId, memberIds, resolveBlockMerges, unionBounds, type MergeRect } from './merge';
import type { Block, BlockMerge, CityLayout, Lot, RoadSegment, Rect } from './layout';
import { buildStreetscape, type GridLine, type PlazaInfo } from './streetscape';
import { GRID_MARGIN, cellBounds, classifyLines, jitteredLines, splitAround } from './gridLines';
import { chooseMonuments } from './monuments';
import { planTraffic } from './trafficPlan';

export { STREET_WIDTH, STREET_SIDEWALK, AVENUE_WIDTH, AVENUE_SIDEWALK, laneOffsetFor } from './gridLines';
export { spawnPointsFor } from './spawnPoints';
export { MONUMENT_SHARE, chooseMonuments } from './monuments';

/** Blocks smaller than this in either direction are skipped. */
const MIN_BLOCK = 6;

// Independent RNG streams.
const GRID_SALT = 0x51ed270b;
const BLOCK_SALT = 0x2545f491;
const TREE_SEED_SALT = 0x9e3779b9;
const FURNITURE_SALT = 0x7f4a7c15;
const MERGE_SALT = 0x3c6ef372;
const MONUMENT_SALT = 0x6a09e667;

const LANES_PER_ROAD = 2;

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
  const monumentRng = createRng((seed ^ MONUMENT_SALT) >>> 0);
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
  // Monument blocks: exactly round(buildable / 5) of the buildable blocks (see chooseMonuments), picked by seed.
  const buildable: string[] = [];
  for (let c = 0; c + 1 < xs.length; c++) {
    for (let r = 0; r + 1 < zs.length; r++) {
      const b = cellBounds(xs, zs, c, r);
      if (b.maxX - b.minX < MIN_BLOCK || b.maxZ - b.minZ < MIN_BLOCK) continue;
      buildable.push(houseBlockId(c, r));
    }
  }
  const monumentOf = new Map(chooseMonuments(buildable.length, monumentRng).map((p) => [buildable[p.index], p.kind] as const));

  for (let c = 0; c + 1 < xs.length; c++) {
    for (let r = 0; r + 1 < zs.length; r++) {
      const id = houseBlockId(c, r);
      const monument = monumentOf.get(id);
      const kind: BlockKind = monument ? 'monument' : 'houses';

      const bounds = cellBounds(xs, zs, c, r);
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
        blocks.push({ id, kind, bounds, courtyard: null, monument });
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

  // Fixed-timing traffic lights and lane paths (trafficPlan.ts).
  const { trafficLights, trafficPaths } = planTraffic({
    xs,
    zs,
    vParts,
    hParts,
    vSplit: xs.map((_, i) => vCuts(i).length > 0),
    hSplit: zs.map((_, j) => hCuts(j).length > 0),
    hasMerges: merges.length > 0,
    removedJunction,
    armsAt,
    trafficMultiplier,
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
