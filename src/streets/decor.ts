// Street decor planning (round 6, task 6.3): where the extra street furniture families go.
// Pure TypeScript (no Three.js), deterministic from layout.seed, and a pure function of the layout.
//
// Families planned here:
//   solids      bus stops (shelter + sign), kiosks, bike racks            avenue (and rack on streets) sidewalks
//   road decals manholes, patches, cracks, wheel-wear bands               lanes of every road
//   curbs       tactile warning bars (kerb corners are in surfaces.ts)   crosswalk ends
//   fountain    one fountain plaza (+ benches, static pigeons)            the best free courtyard
//
// Everything solid stays inside the sidewalk strip on the building side of the pedestrian walking line,
// clear of lamps, trees, benches, bins, crossings, crossing roads' sidewalks and the carriageway
// (so parked cars and lanes are untouched). Decals are flat and sit between the lane markings.

import type { CityLayout } from '../city/layout';
import { createRng } from '../core/rng';
import { frameOf, obstaclesOf } from './decorFrames';
import type { DecorPlan, GreeneryTriangle } from './decorTypes';
import { planSolids } from './decorSolids';
import { planKerbs, planRoadDecals } from './decorRoads';
import { planFountain } from './decorFountain';

export * from './decorTypes';
export * from './decorFrames';
export * from './decorFountain';

// ---- Planning ------------------------------------------------------------------------------------

/**
 * Plans every decor family. `greenery` is the courtyard greenery's ground triangles for the same layout (see
 * courtyardGreeneryFootprint); the fountain plaza is placed where none of them lie.
 */
export function planStreetDecor(layout: CityLayout, greenery: readonly GreeneryTriangle[]): DecorPlan {
  const rng = createRng((Math.imul(layout.seed | 0, 2654435761) ^ 0x5eed6a3) >>> 0);
  const frames = layout.roads.map(frameOf);
  const obstacles = obstaclesOf(layout);

  const plan: DecorPlan = { solids: [], manholes: [], patches: [], kerbCorners: [], tactile: [], fountain: null };

  planSolids(frames, obstacles, rng, plan);
  planRoadDecals(frames, rng, plan);
  planKerbs(layout, frames, plan);
  plan.fountain = planFountain(layout, createRng((Math.imul(layout.seed | 0, 40503) ^ 0xf0f7a1) >>> 0), greenery);
  return plan;
}
