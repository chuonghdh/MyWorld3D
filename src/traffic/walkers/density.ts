// Crowd density by time of day and the red-light remaining time for crossings.

/** Piecewise-linear crowd density over the day: [hour, density 0..1]. */
export const DENSITY_CURVE: readonly (readonly [number, number])[] = [
  [0, 0.08],
  [5, 0.08],
  [6, 0.22],
  [7, 0.45],
  [8.5, 1],
  [9.5, 0.7],
  [12, 0.82],
  [13.5, 0.74],
  [16.5, 0.8],
  [17.5, 1],
  [19, 0.95],
  [21, 0.85],
  [22, 0.7],
  [23, 0.1],
  [24, 0.08],
];

/** Crowd density 0..1 for an hour of the day (rush hours around 8:30 and 17:30, quiet at night). */
export function crowdDensityAt(hour: number): number {
  let h = hour % 24;
  if (h < 0) h += 24;
  for (let i = 1; i < DENSITY_CURVE.length; i++) {
    const [h1, d1] = DENSITY_CURVE[i];
    if (h <= h1) {
      const [h0, d0] = DENSITY_CURVE[i - 1];
      return d0 + ((d1 - d0) * (h - h0)) / (h1 - h0);
    }
  }
  return DENSITY_CURVE[DENSITY_CURVE.length - 1][1];
}

/** Seconds of red left for cars of one axis (0 = ns, 1 = ew) before their green starts, or -1 when not red. */
export function redRemaining(cycle: number, nsGreen: number, ewGreen: number, yellow: number, axis: number, t: number, allRed = 0): number {
  if (!(cycle > 0)) return -1;
  let u = t % cycle;
  if (u < 0) u += cycle;
  const start = axis === 0 ? 0 : nsGreen + yellow + allRed;
  const yellowEnd = start + (axis === 0 ? nsGreen : ewGreen) + yellow;
  if (u >= yellowEnd) return cycle - u + start;
  if (u < start) return start - u;
  return -1;
}

// --- Graph ---------------------------------------------------------------------------------------------
