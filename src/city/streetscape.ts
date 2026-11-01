// Street furniture, markings and trees for the perimeter-block city.
// Pure TypeScript and deterministic: tree draws come from their own rng stream, and each tree slot
// always consumes the same number of draws, so a higher streetTreeMultiplier gives a superset.

import type { StreetClass, TreeSpecies, Vec2 } from '../core/types';
import { cityStreets } from '../config/tuning';
import type { Bench, Crosswalk, Intersection, Rect, StreetLamp, StreetTree } from './layout';

/** One road centre line of the jittered grid. */
export interface GridLine {
  pos: number;
  width: number;
  sidewalk: number;
  cls: StreetClass;
}

export interface PlazaInfo {
  bounds: Rect;
  margin: number;
}

export interface StreetscapeInput {
  xs: readonly GridLine[];
  zs: readonly GridLine[];
  courtyards: readonly Rect[];
  plazas: readonly PlazaInfo[];
  streetTreeMultiplier: number;
  treeRng: () => number;
  furnitureRng: () => number;
}

export interface Streetscape {
  streetTrees: StreetTree[];
  lamps: StreetLamp[];
  benches: Bench[];
  crosswalks: Crosswalk[];
  intersections: Intersection[];
}

/** Footprint radius of a courtyard tree (times its scale), used as an obstacle for courtyard greenery. */
export const COURTYARD_TREE_RADIUS = cityStreets.courtyardTreeRadius;

/** Courtyard trees as greenery obstacles: the list Scene and the fountain footprint both pass to the greenery. */
export function courtyardTreeObstacles(trees: readonly StreetTree[]): { x: number; z: number; r: number }[] {
  return trees
    .filter((t) => t.setting === 'courtyard')
    .map((t) => ({ x: t.position.x, z: t.position.z, r: COURTYARD_TREE_RADIUS * t.scale }));
}

const TREE_SPECIES: readonly TreeSpecies[] = ['maple', 'oak', 'birch', 'ginkgo'];

/** Lamp spacing along one sidewalk; the two sides are staggered by half of it. */
export const LAMP_SPACING = cityStreets.streetLampSpacing;
/** Tree slot spacing; slots sit halfway between lamps and lamp-to-lamp midpoints. */
export const TREE_SPACING = LAMP_SPACING / 2;
/** Lamp pole distance from the curb. */
const LAMP_INSET = 0.6;
/** Chance a tree slot is planted at streetTreeMultiplier = 1. */
const TREE_RATE: Record<StreetClass, number> = cityStreets.treeRate;
const COURTYARD_TREE_MIN = cityStreets.courtyardTreeMin;
const COURTYARD_TREE_MAX = cityStreets.courtyardTreeMax;
/** Slots per courtyard; covers COURTYARD_TREE_MAX at multiplier 2. */
const COURTYARD_SLOTS = 12;
const COURTYARD_TREE_GAP = 4;
const COURTYARD_INSET = 2;
const PLAZA_TREE_SPACING = cityStreets.plazaTreeSpacing;
const PLAZA_TREE_RATE = cityStreets.plazaTreeRate;
/** Width of a zebra crossing band. */
export const CROSSWALK_WIDTH = 3;
/** Extra clearance after the crossing road's sidewalk before furniture starts. */
const CORNER_CLEARANCE = 1;
const BENCH_CHANCE = cityStreets.benchChance;

/** Distance from a crossing line's centre beyond which furniture may stand on the roads it crosses. */
export function cornerClearance(line: GridLine): number {
  return line.width / 2 + line.sidewalk + CORNER_CLEARANCE;
}

/** Distance from the crossing line's centre to the centre of a crosswalk on the roads it crosses. */
export function crosswalkOffset(line: GridLine): number {
  return line.width / 2 + line.sidewalk / 2;
}

function treeLateral(line: GridLine): number {
  return line.width / 2 + Math.min(1.3, line.sidewalk * 0.4);
}

export function buildStreetscape(input: StreetscapeInput): Streetscape {
  const { xs, zs, courtyards, plazas, treeRng, furnitureRng } = input;
  const m = Math.max(0, input.streetTreeMultiplier);

  const streetTrees: StreetTree[] = [];
  const lamps: StreetLamp[] = [];
  const benches: Bench[] = [];
  const crosswalks: Crosswalk[] = [];
  const intersections: Intersection[] = [];

  const speciesOf = (r: number) => TREE_SPECIES[Math.floor(r * TREE_SPECIES.length) % TREE_SPECIES.length];
  const plant = (position: Vec2, species: TreeSpecies, scaleRoll: number, setting: StreetTree['setting']) => {
    streetTrees.push({
      id: `tree-${streetTrees.length}`,
      position,
      species,
      scale: 0.85 + scaleRoll * 0.3,
      setting,
    });
  };

  // ---- Intersections and crosswalks ---------------------------------------------------------
  xs.forEach((vx, i) => {
    zs.forEach((hz, j) => {
      intersections.push({
        id: `intersection-${i}-${j}`,
        center: { x: vx.pos, z: hz.pos },
        sizeX: vx.width,
        sizeZ: hz.width,
      });
      // Arms of the vertical road (north and south): pedestrians walk across it along X.
      for (const dir of [-1, 1] as const) {
        const exists = dir === 1 ? j < zs.length - 1 : j > 0;
        if (!exists) continue;
        crosswalks.push({
          id: `crosswalk-${crosswalks.length}`,
          center: { x: vx.pos, z: hz.pos + dir * crosswalkOffset(hz) },
          orientation: 'horizontal',
          length: vx.width,
          width: CROSSWALK_WIDTH,
        });
      }
      // Arms of the horizontal road (east and west): pedestrians walk across it along Z.
      for (const dir of [-1, 1] as const) {
        const exists = dir === 1 ? i < xs.length - 1 : i > 0;
        if (!exists) continue;
        crosswalks.push({
          id: `crosswalk-${crosswalks.length}`,
          center: { x: vx.pos + dir * crosswalkOffset(vx), z: hz.pos },
          orientation: 'vertical',
          length: hz.width,
          width: CROSSWALK_WIDTH,
        });
      }
    });
  });

  // ---- Sidewalk furniture and street trees, segment by segment ------------------------------
  const roads: { line: GridLine; vertical: boolean; crossing: readonly GridLine[] }[] = [
    ...xs.map((line) => ({ line, vertical: true, crossing: zs })),
    ...zs.map((line) => ({ line, vertical: false, crossing: xs })),
  ];

  for (const { line, vertical, crossing } of roads) {
    const toWorld = (along: number, lateral: number): Vec2 =>
      vertical ? { x: line.pos + lateral, z: along } : { x: along, z: line.pos + lateral };
    const roadSpecies = speciesOf(treeRng());
    const rate = TREE_RATE[line.cls];

    for (let k = 0; k + 1 < crossing.length; k++) {
      const start = crossing[k].pos + cornerClearance(crossing[k]);
      const end = crossing[k + 1].pos - cornerClearance(crossing[k + 1]);
      if (end - start < 2) continue;

      for (const side of [-1, 1] as const) {
        // Facing toward the road from this sidewalk.
        const toRoad = vertical ? Math.atan2(-side, 0) : Math.atan2(0, -side);
        const phase = side === -1 ? 2 : 2 + LAMP_SPACING / 2;

        for (let s = start + phase; s <= end; s += LAMP_SPACING) {
          lamps.push({
            id: `lamp-${lamps.length}`,
            position: toWorld(s, side * (line.width / 2 + LAMP_INSET)),
            facing: toRoad,
          });
          // Benches on avenues, halfway to the next lamp (between two trees).
          if (line.cls === 'avenue') {
            const b = s + LAMP_SPACING / 2;
            const roll = furnitureRng();
            if (b <= end - 1 && roll < BENCH_CHANCE) {
              benches.push({
                id: `bench-${benches.length}`,
                position: toWorld(b, side * (line.width / 2 + line.sidewalk * 0.6)),
                facing: toRoad,
              });
            }
          }
        }

        // Tree slots sit halfway between lamp positions (4.5 m clear of every lamp).
        const first = start + ((phase + TREE_SPACING / 2) % TREE_SPACING);
        for (let s = first; s <= end; s += TREE_SPACING) {
          const roll = treeRng();
          const speciesRoll = treeRng();
          const scaleRoll = treeRng();
          if (m <= 0 || roll >= Math.min(1, rate * m)) continue;
          const species = speciesRoll < 0.85 ? roadSpecies : speciesOf(speciesRoll);
          plant(toWorld(s, side * treeLateral(line)), species, scaleRoll, 'street');
        }
      }
    }
  }

  // ---- Courtyard trees -----------------------------------------------------------------------
  for (const rect of courtyards) {
    const wanted = COURTYARD_TREE_MIN + Math.floor(treeRng() * (COURTYARD_TREE_MAX - COURTYARD_TREE_MIN + 1));
    const limit = Math.min(COURTYARD_SLOTS, Math.round(wanted * m));
    const placed: Vec2[] = [];
    const inner: Rect = {
      minX: rect.minX + COURTYARD_INSET,
      maxX: rect.maxX - COURTYARD_INSET,
      minZ: rect.minZ + COURTYARD_INSET,
      maxZ: rect.maxZ - COURTYARD_INSET,
    };
    const usable = inner.maxX > inner.minX && inner.maxZ > inner.minZ;
    for (let k = 0; k < COURTYARD_SLOTS; k++) {
      const rx = treeRng();
      const rz = treeRng();
      const speciesRoll = treeRng();
      const scaleRoll = treeRng();
      if (!usable) continue;
      const p = { x: inner.minX + rx * (inner.maxX - inner.minX), z: inner.minZ + rz * (inner.maxZ - inner.minZ) };
      // Spacing is checked against every earlier slot, planted or not, so the result is a superset.
      const crowded = placed.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < COURTYARD_TREE_GAP);
      placed.push(p);
      if (crowded || k >= limit) continue;
      plant(p, speciesOf(speciesRoll), scaleRoll, 'courtyard');
    }
  }

  // ---- Plazas around monuments ---------------------------------------------------------------
  for (const { bounds, margin } of plazas) {
    const ring = margin / 2;
    const r: Rect = {
      minX: bounds.minX + ring,
      maxX: bounds.maxX - ring,
      minZ: bounds.minZ + ring,
      maxZ: bounds.maxZ - ring,
    };
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cz = (bounds.minZ + bounds.maxZ) / 2;
    // One bench in the middle of each plaza side, looking at the monument.
    const plazaBenches: Vec2[] = [
      { x: cx, z: r.minZ },
      { x: cx, z: r.maxZ },
      { x: r.minX, z: cz },
      { x: r.maxX, z: cz },
    ];
    for (const p of plazaBenches) {
      benches.push({ id: `bench-${benches.length}`, position: p, facing: Math.atan2(cx - p.x, cz - p.z) });
    }
    // Trees along the ring, evenly spaced on each side.
    const sides: [Vec2, Vec2][] = [
      [{ x: r.minX, z: r.minZ }, { x: r.maxX, z: r.minZ }],
      [{ x: r.maxX, z: r.minZ }, { x: r.maxX, z: r.maxZ }],
      [{ x: r.maxX, z: r.maxZ }, { x: r.minX, z: r.maxZ }],
      [{ x: r.minX, z: r.maxZ }, { x: r.minX, z: r.minZ }],
    ];
    for (const [a, b] of sides) {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const n = Math.max(1, Math.floor(len / PLAZA_TREE_SPACING));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const roll = treeRng();
        const speciesRoll = treeRng();
        const scaleRoll = treeRng();
        if (plazaBenches.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 2.5)) continue;
        if (m <= 0 || roll >= Math.min(1, PLAZA_TREE_RATE * m)) continue;
        plant(p, speciesOf(speciesRoll), scaleRoll, 'plaza');
      }
    }
  }

  return { streetTrees, lamps, benches, crosswalks, intersections };
}
