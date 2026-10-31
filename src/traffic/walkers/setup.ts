// Set-up of the pedestrian system from the layout: walking graph, benches, walkers and dogs.

import type { CityLayout } from '../../city/layout';
import { createRng } from '../../core/rng';
import { MAX_WALKERS, MAX_DOGS, SIDEWALK_Y } from './constants';
import type { PedestriansOptions } from './types';
import { crowdDensityAt } from './density';
import { buildRoadRects, buildGraph } from './graph';
import { createPeople } from './looks';
import { setCap, populateInitial } from './movement';
import type { Pedestrians } from '../pedestrians';

export function setupSystem(sys: Pedestrians, layout: CityLayout, options: PedestriansOptions) {
  sys.layout = layout;
  sys.multiplier = Math.max(0, options.trafficMultiplier);
  sys.rng = createRng(options.seed ?? 7);
  sys.lights = options.lights ?? null;
  sys.rects = buildRoadRects(layout);
  sys.g = buildGraph(layout, sys.rects);
  sys.density = crowdDensityAt(options.timeOfDay ?? 12);
  const tb = layout.townBounds;
  sys.boundMinX = tb.minX + 0.08;
  sys.boundMaxX = tb.maxX - 0.08;
  sys.boundMinZ = tb.minZ + 0.08;
  sys.boundMaxZ = tb.maxZ - 0.08;

  const B = layout.benches.length;
  sys.benchX = new Float32Array(B);
  sys.benchZ = new Float32Array(B);
  sys.benchF = new Float32Array(B);
  sys.benchOcc = new Int16Array(B).fill(-1);
  layout.benches.forEach((b, i) => {
    sys.benchX[i] = b.position.x;
    sys.benchZ[i] = b.position.z;
    sys.benchF[i] = b.facing;
  });

  sys.leader.fill(-1);
  sys.follower.fill(-1);
  sys.dogIndex.fill(-1);
  sys.bench.fill(-1);
  for (let i = 0; i < MAX_WALKERS; i++) {
    sys.pool.push({
      id: 0,
      position: { x: 0, z: 0 },
      y: SIDEWALK_Y,
      heading: 0,
      dog: null,
      body: 0,
      female: 0,
      hairStyle: 0,
      top: 0,
      pants: 0,
      hair: 0,
      skin: 0,
      accent: 0,
      traits: 0,
      pose: 0,
      speed: 0,
      phase: 0,
      umbrellaRank: 0,
      scale: 1,
    });
  }
  sys.dogPool = [];
  for (let i = 0; i < MAX_DOGS; i++) {
    sys.dogPool.push({ position: { x: 0, z: 0 }, heading: 0, phase: 0, speed: 0, coat: 0, leashHand: { x: 0, z: 0 } });
  }

  if (sys.g.edgeCount > 0 && sys.g.spawnTotal > 0) {
    createPeople(sys);
    setCap(sys);
    populateInitial(sys);
  }
}
