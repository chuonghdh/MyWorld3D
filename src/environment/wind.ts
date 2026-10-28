// Wind model: base speed and direction, deterministic turbulence, and gusts.
// Units: speed in m/s, direction in degrees (0 = north, clockwise).
// Direction is the heading the wind blows TOWARDS (not where it comes from).
// Pure logic, no three.js dependency.

export interface WindConfig {
  /** Base wind speed in m/s. */
  speed: number;
  /** Base wind heading in degrees, 0 = north, clockwise. */
  direction: number;
}

export interface GustEvent {
  /** Time (seconds, same clock as the t arguments) when the gust started. */
  start: number;
  /** Extra speed added at the peak, in m/s. */
  peak: number;
}

export interface WindVector {
  /** East component (three.js +x). */
  x: number;
  /** South component (three.js +z). North is -z. */
  z: number;
}

/** Attack time of a gust, in seconds. */
export const GUST_ATTACK_S = 0.6;
/** Decay time constant of a gust after its peak, in seconds. */
export const GUST_DECAY_TAU_S = 3;
/** Fraction of the base speed used as turbulence amplitude. */
export const TURBULENCE_AMPLITUDE = 0.25;

/**
 * Gust envelope for one event at time t: 0 before start, rises to 1 over the
 * attack time, then decays exponentially.
 */
export function gustEnvelope(t: number, start: number): number {
  const dt = t - start;
  if (dt < 0) return 0;
  if (dt < GUST_ATTACK_S) return dt / GUST_ATTACK_S;
  return Math.exp(-(dt - GUST_ATTACK_S) / GUST_DECAY_TAU_S);
}

/**
 * Gust strength at time t, in 0..1 (sum of active gust envelopes, clamped).
 * Calling it with no gusts returns 0. It decays back to 0 after a gust.
 */
export function gustStrength(t: number, gusts: readonly GustEvent[] = []): number {
  let sum = 0;
  for (const g of gusts) {
    sum += gustEnvelope(t, g.start) * (g.peak > 0 ? 1 : 0);
  }
  return Math.min(1, sum);
}

/** Extra speed (m/s) contributed by gusts at time t. */
export function gustSpeed(t: number, gusts: readonly GustEvent[] = []): number {
  let sum = 0;
  for (const g of gusts) {
    sum += gustEnvelope(t, g.start) * g.peak;
  }
  return sum;
}

/**
 * Add a gust at time t and drop events that have fully decayed (below 0.01).
 * Returns a new array; the input is not modified.
 */
export function triggerGust(
  gusts: readonly GustEvent[],
  t: number,
  peak = 3,
): GustEvent[] {
  const alive = gusts.filter((g) => gustEnvelope(t, g.start) > 0.01 || g.start > t);
  return [...alive, { start: t, peak }];
}

/**
 * Deterministic turbulence in -1..1 from time alone. Sum of incommensurate
 * sines, so it looks irregular without any random state.
 */
export function turbulence(t: number): number {
  const v =
    0.5 * Math.sin(t * 0.7) +
    0.3 * Math.sin(t * 1.9 + 1.3) +
    0.2 * Math.sin(t * 4.3 + 0.4);
  return Math.max(-1, Math.min(1, v));
}

/** Total wind speed (m/s) at time t: base + turbulence + gusts, never negative. */
export function windSpeedAt(t: number, cfg: WindConfig, gusts: readonly GustEvent[] = []): number {
  const base = cfg.speed * (1 + TURBULENCE_AMPLITUDE * turbulence(t));
  return Math.max(0, base + gustSpeed(t, gusts));
}

/**
 * Wind velocity (m/s) on the ground plane at time t as x (east) and z (south)
 * components. Magnitude equals windSpeedAt(t, cfg, gusts).
 */
export function windVector(t: number, cfg: WindConfig, gusts: readonly GustEvent[] = []): WindVector {
  const speed = windSpeedAt(t, cfg, gusts);
  const rad = (cfg.direction * Math.PI) / 180;
  // Heading 0 = north (-z), 90 = east (+x).
  return { x: Math.sin(rad) * speed, z: -Math.cos(rad) * speed };
}
