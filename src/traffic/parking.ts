// Parked car placement along curbs. Pure function of the layout and a seed; no Three.js.
// Cars park parallel to the road in the curb lane, facing the direction of that side's traffic lane.
// Only avenues are used: on 8 m streets the driving lanes (centre at width/4) leave no room for a parked car.

import type { CityLayout, RoadSegment } from '../city/layout';
import { createRng } from '../core/rng';
import { PASSENGER_VARIANTS } from './vehicles/variants';

export interface ParkingSpot {
  x: number;
  z: number;
  /** Yaw, same convention as the layout (0 faces +Z). */
  heading: number;
  /** Passenger variant index 0-5 (see vehicles/variants.ts). */
  variant: number;
  /** Random 0..1 for the paint colour. */
  tint: number;
  roadId: string;
  /** +1 on the positive-coordinate side of the road (east or south of its axis), -1 on the other. */
  side: 1 | -1;
}

/** Length and half width of each passenger variant, metres (matches the models). */
export const PARKED_SIZE: { length: number; half: number }[] = [
  { length: 3.95, half: 0.86 },
  { length: 4.65, half: 0.9 },
  { length: 4.5, half: 0.94 },
  { length: 4.3, half: 0.9 },
  { length: 4.65, half: 0.9 },
  { length: 5.3, half: 1.0 },
];

/** Parked cars keep at least this far from an intersection centre, measured along the road. */
export const PARKING_MIN_FROM_INTERSECTION = 12;
/** Parked cars keep this far from both ends of a road. */
export const PARKING_ROAD_END_MARGIN = 12;

const VARIANT_WEIGHTS = [0.3, 0.25, 0.18, 0.12, 0.03, 0.12];

export interface ParkingOptions {
  seed?: number;
  /** Probability of leaving a slot empty. */
  emptyChance?: number;
}

export function computeParkingSpots(layout: CityLayout, options: ParkingOptions = {}): ParkingSpot[] {
  const rng = createRng((options.seed ?? layout.seed ?? 1) * 7919 + 13);
  const emptyChance = options.emptyChance ?? 0.18;
  const spots: ParkingSpot[] = [];

  const roads = [...layout.roads].filter((r) => r.streetClass === 'avenue');

  for (const road of roads) {
    const vertical = road.orientation === 'vertical';
    const axis = vertical ? road.start.x : road.start.z; // lateral position of the centre line
    const a0 = vertical ? Math.min(road.start.z, road.end.z) : Math.min(road.start.x, road.end.x);
    const a1 = vertical ? Math.max(road.start.z, road.end.z) : Math.max(road.start.x, road.end.x);

    // Intersections on this road, as [alongCentre, clearance] sorted along the road.
    const cuts: { c: number; clear: number }[] = [];
    for (const it of layout.intersections) {
      const lateral = vertical ? it.center.x : it.center.z;
      if (Math.abs(lateral - axis) > 1) continue;
      const along = vertical ? it.center.z : it.center.x;
      const half = (vertical ? it.sizeZ : it.sizeX) / 2;
      cuts.push({ c: along, clear: Math.max(PARKING_MIN_FROM_INTERSECTION, half + 9) });
    }
    cuts.sort((p, q) => p.c - q.c);

    const spans: [number, number][] = [];
    let prev: { c: number; clear: number } = { c: a0, clear: -PARKING_ROAD_END_MARGIN };
    const bounds = [...cuts, { c: a1, clear: -PARKING_ROAD_END_MARGIN }];
    for (const next of bounds) {
      const lo = prev.c + Math.max(prev.clear, 0) + (prev.clear < 0 ? PARKING_ROAD_END_MARGIN : 0);
      const hi = next.c - Math.max(next.clear, 0) - (next.clear < 0 ? PARKING_ROAD_END_MARGIN : 0);
      if (hi - lo > 4) spans.push([lo, hi]);
      prev = next;
    }

    for (const side of [1, -1] as const) {
      for (const [lo, hi] of spans) {
        let cursor = lo + 0.4 + rng() * 1.5;
        while (cursor < hi) {
          if (rng() < emptyChance) {
            cursor += 4.5 + rng() * 3;
            continue;
          }
          const variant = pickVariant(rng());
          const size = PARKED_SIZE[variant];
          const centre = cursor + size.length / 2;
          if (centre + size.length / 2 > hi) break;

          const inward = rng() * 0.1; // jitter only toward the road centre so no car crosses the curb
          const lateral = side * (road.width / 2 - size.half - 0.04 - inward);
          const rawYaw = rng() < 0.15 ? (rng() - 0.5) * 0.18 : (rng() - 0.5) * 0.04;
          // Keep the corners of a slightly skewed car within 0.1 m of its straight footprint, so the
          // clearance driving lanes were laid out with (see laneOffsetFor) holds for every parked car.
          const maxYaw = 0.1 / (size.length / 2);
          const yawJitter = Math.max(-maxYaw, Math.min(maxYaw, rawYaw));
          const tint = rng();
          const baseHeading = vertical ? (side === 1 ? 0 : Math.PI) : side === 1 ? Math.PI / 2 : -Math.PI / 2;
          const x = vertical ? axis + lateral : centre;
          const z = vertical ? centre : axis + lateral;
          if (!clearOfLamps(layout, x, z, size, road, vertical)) {
            cursor += 1;
            continue;
          }
          spots.push({ x, z, heading: baseHeading + yawJitter, variant, tint, roadId: road.id, side });
          cursor = centre + size.length / 2 + 0.55 + rng() * 1.1;
        }
      }
    }
  }
  return spots;
}

function pickVariant(r: number): number {
  let acc = 0;
  for (let i = 0; i < VARIANT_WEIGHTS.length; i++) {
    acc += VARIANT_WEIGHTS[i];
    if (r < acc) return PASSENGER_VARIANTS[i];
  }
  return PASSENGER_VARIANTS[0];
}

/** Lamps stand on the sidewalk, but keep the check so a layout with kerb-side lamps still works. */
function clearOfLamps(
  layout: CityLayout,
  x: number,
  z: number,
  size: { length: number; half: number },
  road: RoadSegment,
  vertical: boolean,
): boolean {
  const hl = size.length / 2 + 0.4;
  const hh = size.half + 0.4;
  for (const lamp of layout.lamps) {
    const dx = Math.abs(lamp.position.x - x);
    const dz = Math.abs(lamp.position.z - z);
    if (vertical ? dx < hh && dz < hl : dx < hl && dz < hh) return false;
  }
  void road;
  return true;
}
