// Grid line helpers for the city layout: street widths, jittered road centre lines, cells and cut splits.
import type { StreetClass } from '../core/types';
import type { Rect } from './layout';
import type { GridLine } from './streetscape';

// Geometry constants (metres).
export const STREET_WIDTH = 8;
export const STREET_SIDEWALK = 3;
export const AVENUE_WIDTH = 11;
export const AVENUE_SIDEWALK = 4.5;
/** Keeps road centre lines (and the street sidewalks on outer roads) inside the town bounds. */
export const GRID_MARGIN = 6;
/** Target and allowed distance between road centre lines. */
const CELL_TARGET = 50;
const CELL_MIN = 40;
const CELL_MAX = 60;

/**
 * Distance from an avenue's centre line to its lane centres. Avenues have parked cars along both
 * kerbs (up to about 3.15 m from the centre line at their inner side); a bus (half width 1.25 m) plus
 * 0.15 m of clearance must fit between that and the lane centre, so lane centre = half width - 3.75.
 * Streets have no parking and keep a quarter of the width.
 */
export function laneOffsetFor(line: { width: number; cls: string }): number {
  return line.cls === 'avenue' ? line.width / 2 - 3.75 : line.width / 4;
}

/**
 * Jittered road centre lines from `min` to `max` inclusive. Gaps stay within CELL_MIN..CELL_MAX
 * whenever the span allows it. The number of draws depends only on the span.
 */
export function jitteredLines(min: number, max: number, rng: () => number): number[] {
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
export function classifyLines(positions: number[]): GridLine[] {
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

/** Splits [lo, hi] around the cut intervals and returns the pieces that remain (longer than a micron). */
export function splitAround(lo: number, hi: number, cuts: readonly { a: number; b: number }[]): [number, number][] {
  const out: [number, number][] = [];
  let cur = lo;
  for (const c of [...cuts].sort((p, q) => p.a - q.a)) {
    if (c.a > cur) out.push([cur, c.a]);
    cur = Math.max(cur, c.b);
  }
  if (hi > cur) out.push([cur, hi]);
  return out.filter(([a, b]) => b - a > 1e-6);
}

/** Bounds of grid cell (c, r): the cell between its four street lines, inside their sidewalks. */
export function cellBounds(xs: readonly GridLine[], zs: readonly GridLine[], c: number, r: number): Rect {
  const inner = (line: GridLine) => line.width / 2 + line.sidewalk;
  return {
    minX: xs[c].pos + inner(xs[c]),
    maxX: xs[c + 1].pos - inner(xs[c + 1]),
    minZ: zs[r].pos + inner(zs[r]),
    maxZ: zs[r + 1].pos - inner(zs[r + 1]),
  };
}
