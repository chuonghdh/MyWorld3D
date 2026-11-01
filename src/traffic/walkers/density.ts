// The red-light remaining time for crossings. Crowd density lives in ../trafficDensity (shared with vehicles).

export { trafficDensityAt as crowdDensityAt } from '../trafficDensity';

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
