// Pure helpers for the Round 6 detail pass: wind codes and anchor weights for cloth details,
// the evening window light schedule, and colour lifting for doors. No Three.js here, so it is
// unit-testable. The GLSL in ../shaders/wind.ts and ../shaders/glass.ts mirrors these formulas.

/** Wind behaviour ids written per body or sign vertex (first component of the wind attribute). */
export const WIND = {
  NONE: 0,
  /** Flag: streams downwind and flutters sideways; weight 0 at the pole, 1 at the free edge. */
  FLAG: 1,
  /** Laundry hanging from a line; weight 0 at the line, 1 at the hem. */
  LAUNDRY: 2,
  /** Awning fabric and valance; weight 0 at the wall, 1 at the front edge. */
  AWNING: 3,
  /** Blade sign swinging from its bracket; weight 0 at the arm, 1 at the bottom. */
  BLADE: 4,
  /** Window box and rooftop plants; weight 0 at the pot rim, 1 at the tips. */
  PLANT: 5,
  /** Parasol canopy: small flutter of the rim. */
  PARASOL: 6,
} as const;

export type WindCode = (typeof WIND)[keyof typeof WIND];

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Anchor weight along a cloth: 0 at `from`, 1 at `to` (either order), clamped. Zero-length gives 0. */
export function anchorWeight(v: number, from: number, to: number): number {
  const d = to - from;
  if (Math.abs(d) < 1e-9) return 0;
  return clamp01((v - from) / d);
}

/** Wind amplitude factor used by the shader: about 1 at 5 m/s (the default wind), capped at 2.2, boosted by gusts (0..1). */
export function windAmplitude(speed: number, gust: number): number {
  const s = Math.max(0, Number.isFinite(speed) ? speed : 0) + 1;
  const g = clamp01(Number.isFinite(gust) ? gust : 0);
  return Math.min(2.2, s / 6) * (1 + g);
}

// ---------------------------------------------------------------------------------------------
// Window light schedule

/** Hours since noon (0 at 12:00, 24 at noon the next day) for a clock hour 0..24. */
export function nightClock(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  return h >= 12 ? h - 12 : h + 12;
}

/** Deterministic per-pane seed in (0.02, 1] from the running pane index. Never 0 (0 means always lit). */
export function paneSeed(index: number): number {
  let x = Math.imul(index + 1, 0x9e3779b1) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  return 0.02 + 0.98 * ((x >>> 0) / 4294967296);
}

// Target share of lit windows by hour (a window with seed u is lit while u is below the curve):
//   before 17:00 0%, 20:00 70%, 21:00 85%, hold until 22:00, then falling to 30% at midnight and
//   staying there until the morning switch-off between 06:00 and 07:00. Windows with u >= 0.85 stay dark.
// Hours below are "since noon" (see nightClock): 17:00 = 5, 20:00 = 8, 22:00 = 10, 24:00 = 12, 06:00 = 18.

/** Clock time (hours since noon) at which a window with this seed lights up: 17:00 to 21:00, or never (99) for 15%. */
export function windowOnAt(seed: number): number {
  if (seed <= 0.7) return 5 + (3 * seed) / 0.7;
  if (seed <= 0.85) return 8 + (seed - 0.7) / 0.15;
  return 99;
}

/**
 * Clock time (hours since noon) at which it goes dark again: between 22:00 and midnight for the 55% that
 * do not stay, or between 06:00 and 07:00 for the 30% that burn all night (99 for windows that never light).
 */
export function windowOffAt(seed: number): number {
  if (seed <= 0.3) return 18 + seed / 0.3;
  if (seed <= 0.85) return 10 + (2 * (0.85 - seed)) / 0.55;
  return 99;
}

/**
 * Whether the window is lit at the given clock (hours since noon, see nightClock). A negative clock
 * disables the schedule and a seed of 0 marks a fixture that is always lit (lanterns, beacons).
 */
export function windowLit(seed: number, clock: number): boolean {
  if (clock < 0 || seed <= 0) return true;
  return clock >= windowOnAt(seed) && clock < windowOffAt(seed);
}

// ---------------------------------------------------------------------------------------------
// Colours

/** Relative luminance of a linear RGB triple. */
export function luminance(c: readonly [number, number, number]): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/**
 * Lifts a colour toward a warm wood tone until its luminance reaches `minLum`, so a door never
 * renders as a black void. Colours that are bright enough come back unchanged.
 */
export function liftColor(
  c: readonly [number, number, number],
  minLum: number,
  toward: readonly [number, number, number] = [0.3, 0.17, 0.08],
): [number, number, number] {
  const l = luminance(c);
  if (l >= minLum) return [c[0], c[1], c[2]];
  const lt = luminance(toward);
  // Mix so that the result reaches minLum (luminance is linear in the mix factor).
  const t = lt > l ? Math.min(1, (minLum - l) / (lt - l)) : 1;
  return [c[0] + (toward[0] - c[0]) * t, c[1] + (toward[1] - c[1]) * t, c[2] + (toward[2] - c[2]) * t];
}
