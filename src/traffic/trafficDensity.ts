// Traffic and crowd density by time of day. One curve drives vehicle spawn rate and walker counts.

import { trafficLife } from '../config/tuning';

/** Lowest density at night (quiet, not empty). */
export const TRAFFIC_DENSITY_FLOOR = trafficLife.densityFloor;

/** Piecewise-linear density over the day: [hour, density 0..1]. Peaks at 11:00 and 19:00, dip at 15:00. */
export const TRAFFIC_DENSITY_CURVE: readonly (readonly [number, number])[] = [
  [0, TRAFFIC_DENSITY_FLOOR],
  [5, TRAFFIC_DENSITY_FLOOR],
  [6, 0.35],
  [7, 0.55],
  [8, 0.75],
  [9, 0.9],
  [10, 0.97],
  [11, 1],
  [12, 0.9],
  [13, 0.8],
  [15, 0.7],
  [16, 0.78],
  [17, 0.88],
  [18, 0.95],
  [19, 1],
  [20, 0.9],
  [21, 0.7],
  [22, 0.45],
  [23, TRAFFIC_DENSITY_FLOOR],
  [24, TRAFFIC_DENSITY_FLOOR],
];

/** Density 0..1 for an hour of the day (0-24, wraps). Pure: same hour, same value. */
export function trafficDensityAt(hour: number): number {
  let h = hour % 24;
  if (h < 0) h += 24;
  for (let i = 1; i < TRAFFIC_DENSITY_CURVE.length; i++) {
    const [h1, d1] = TRAFFIC_DENSITY_CURVE[i];
    if (h <= h1) {
      const [h0, d0] = TRAFFIC_DENSITY_CURVE[i - 1];
      return d0 + ((d1 - d0) * (h - h0)) / (h1 - h0);
    }
  }
  return TRAFFIC_DENSITY_CURVE[TRAFFIC_DENSITY_CURVE.length - 1][1];
}
