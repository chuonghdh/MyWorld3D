// Fixed-timing traffic lights and lane paths for the city grid. Pure: no RNG.
// Lights sit at every junction that keeps three or four arms; paths run one per direction along each road piece.
import { cityStreets } from '../config/tuning';
import type { Vec2 } from '../core/types';
import { armCount } from './junctionArms';
import { laneOffsetFor } from './gridLines';
import type { TrafficLight, TrafficLightTiming, TrafficPath } from './layout';
import { spawnPointsFor } from './spawnPoints';
import type { GridLine } from './streetscape';

const LIGHT_TIMING: TrafficLightTiming = cityStreets.lightTiming;

export interface TrafficInput {
  xs: readonly GridLine[];
  zs: readonly GridLine[];
  /** Per vertical grid line: the pieces left after block merges cut it. */
  vParts: readonly (readonly [number, number][])[];
  /** Per horizontal grid line: the pieces left after block merges cut it. */
  hParts: readonly (readonly [number, number][])[];
  /** Per vertical grid line: true when a merge cut it (road ids then carry a piece index). */
  vSplit: readonly boolean[];
  /** Per horizontal grid line: true when a merge cut it. */
  hSplit: readonly boolean[];
  hasMerges: boolean;
  removedJunction: (i: number, j: number) => boolean;
  armsAt: (x: number, z: number) => number;
  trafficMultiplier: number;
}

export function planTraffic(input: TrafficInput): { trafficLights: TrafficLight[]; trafficPaths: TrafficPath[] } {
  const { xs, zs, vParts, hParts, vSplit, hSplit, hasMerges, removedJunction, armsAt, trafficMultiplier } = input;

  // Fixed-timing traffic lights at every intersection that remains with three or four arms. A junction a merge
  // leaves with two arms (straight on or a bend) has no signal; without merges every junction has four arms.
  const trafficLights: TrafficLight[] = [];
  xs.forEach((vx, i) => {
    zs.forEach((hz, j) => {
      if (removedJunction(i, j)) return;
      if (hasMerges && armCount(armsAt(vx.pos, hz.pos)) <= 2) return;
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
    const split = vSplit[i];
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
    const split = hSplit[j];
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

  return { trafficLights, trafficPaths };
}
