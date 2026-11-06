// Cloud layout: the cluster field (positions, sizes, thresholds) and the pure helpers the shaders mirror.
// Shared by cloudSprites.ts (lit puffs), cloudShade.ts (shadow mask) and the tests.

import { skyEnvironment } from '../config/tuning';
import { createRng } from '../core/rng';

/** Lowest cluster base and highest puff top, metres above the ground (birds fly at 26..44 m). */
export const CLOUD_BASE_MIN = skyEnvironment.clouds.baseMinM;
export const CLOUD_BASE_MAX = skyEnvironment.clouds.baseMaxM;
export const CLOUD_TOP_MAX = skyEnvironment.clouds.topMaxM;
/** Mean spacing of cluster centres in metres; the domain is split into a grid of this cell size. */
export const CLOUD_CELL = skyEnvironment.clouds.cellM;
/** Darkest the ground may get under a cloud shadow (0.35 = 35% darker). */
export const CLOUD_MAX_DARKNESS = skyEnvironment.clouds.maxDarkness;
/** Clouds drift this fraction of the wind speed, never slower than the minimum or faster than the maximum (m/s). */
export const CLOUD_WIND_FACTOR = skyEnvironment.clouds.windFactor;
export const CLOUD_MIN_DRIFT = skyEnvironment.clouds.minDriftMs;
export const CLOUD_MAX_DRIFT = skyEnvironment.clouds.maxDriftMs;
/** Kept for older callers: the gentle drift that applies in calm air. */
export const CLOUD_BASE_DRIFT = CLOUD_MIN_DRIFT;

export interface CloudLayout {
  /** Number of puffs (instances). */
  count: number;
  /** Number of clusters. */
  clusters: number;
  /** Side of the wrapping domain in metres. */
  domain: number;
  /** vec3 per puff: wrapped cluster centre (x, z in 0..1 of the domain) and base altitude in metres. */
  center: Float32Array;
  /** vec3 per puff: offset from the cluster centre in metres. */
  offset: Float32Array;
  /** vec4 per puff: half width, half height (metres), noise seed, visibility threshold 0..1. */
  info: Float32Array;
  /** vec3 per puff: 1 for the first puff of a cluster (casts the shadow), height inside the cluster 0..1, cluster half width. */
  misc: Float32Array;
}

/** Side of the wrapping domain for a town of the given size: wide enough that its edge fades outside the town. */
export function cloudDomain(townExtent: number): number {
  return Math.min(1400, Math.max(800, townExtent * 1.8));
}

/** Deterministic cloud field; clusters sit on a jittered grid so they rarely overlap. */
export function buildCloudLayout(seed: number, domain = 800): CloudLayout {
  const grid = Math.min(16, Math.max(6, Math.round(domain / CLOUD_CELL)));
  const rng = createRng(seed * 31 + 5);
  const maxPuffs = grid * grid * 12;
  const center = new Float32Array(maxPuffs * 3);
  const offset = new Float32Array(maxPuffs * 3);
  const info = new Float32Array(maxPuffs * 4);
  const misc = new Float32Array(maxPuffs * 3);
  let n = 0;

  for (let gz = 0; gz < grid; gz++) {
    for (let gx = 0; gx < grid; gx++) {
      const cx = (gx + 0.3 + 0.4 * rng()) / grid;
      const cz = (gz + 0.3 + 0.4 * rng()) / grid;
      const alt = CLOUD_BASE_MIN + rng() * (CLOUD_BASE_MAX - CLOUD_BASE_MIN);
      const half = 18 + rng() * 22 + (rng() < 0.15 ? 8 : 0); // cluster width 36..96 m
      const thr = rng() * 0.92;
      const puffs = 8 + Math.floor(rng() * 5);
      for (let k = 0; k < puffs; k++) {
        const u = k === 0 ? 0 : rng() * 2 - 1;
        const v = k === 0 ? 0 : rng() * 2 - 1;
        const f = Math.max(0, 1 - Math.hypot(u, v) / 1.42);
        const radius = Math.min(30, Math.max(9, half * (0.4 + 0.35 * f)));
        const ry = radius * 0.8;
        // Keep the highest rim under CLOUD_TOP_MAX even with the weather scaling (radius up to +20%, bob 1.5 m).
        const room = CLOUD_TOP_MAX - 2 - alt - ry * 1.2 - 1.5;
        const oy = Math.max(0, Math.min(radius * 0.3 + f * half * 0.7 * (0.5 + 0.5 * rng()), room));
        const h = Math.min(1, oy / Math.max(1, half * 0.7));
        center.set([cx, alt, cz], n * 3);
        offset.set([u * half, oy, v * half * 0.6], n * 3);
        // Neighbouring puffs of one cluster share the threshold (a small spread softens the pop-in).
        info.set([radius, ry, rng() * 10, Math.min(0.98, thr + rng() * 0.04)], n * 4);
        misc.set([k === 0 ? 1 : 0, h, half], n * 3);
        n++;
      }
    }
  }
  return {
    count: n,
    clusters: grid * grid,
    domain,
    center: center.slice(0, n * 3),
    offset: offset.slice(0, n * 3),
    info: info.slice(0, n * 4),
    misc: misc.slice(0, n * 3),
  };
}

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Fair-weather clouds exist even on a clear day; overcast fills the sky. Mirrors the shaders. */
export function effectiveCoverage(coverage: number): number {
  return 0.28 + 0.72 * clamp01(coverage);
}

/** How visible a cluster with the given threshold is at a cloud amount (0..1). Mirrors the shaders. */
export function cumulusVisibility(threshold: number, coverage: number): number {
  return smooth(threshold, threshold + 0.1, effectiveCoverage(coverage));
}

/** Weather scaling of altitude, puff size and cluster height (shared by the shaders and the tests). */
export function cloudScales(coverage: number): { alt: number; size: number; height: number } {
  const c = clamp01(coverage);
  return { alt: 1 - 0.12 * c, size: 1 + 0.2 * c, height: 1 - 0.3 * c };
}

/** Highest point (metres) of puff `i` at a cloud amount, ignoring the 1.5 m bob. Mirrors the vertex shader. */
export function puffTop(layout: CloudLayout, i: number, coverage: number): number {
  const s = cloudScales(coverage);
  return layout.center[i * 3 + 1] * s.alt + layout.offset[i * 3 + 1] * s.height + layout.info[i * 4 + 1] * s.size;
}

/** Drift velocity (m/s) along the wind: a fraction of the wind speed, with a gentle minimum and a cap. */
export function cloudDriftVelocity(
  wind: { x: number; z: number },
  out: { x: number; z: number },
): { x: number; z: number } {
  const speed = Math.hypot(wind.x, wind.z);
  if (speed < 0.05) {
    out.x = CLOUD_MIN_DRIFT; // calm air: drift gently east
    out.z = 0;
    return out;
  }
  const mag = Math.min(CLOUD_MAX_DRIFT, Math.max(CLOUD_MIN_DRIFT, speed * CLOUD_WIND_FACTOR));
  out.x = (wind.x / speed) * mag;
  out.z = (wind.z / speed) * mag;
  return out;
}

/**
 * Where the shadow of something `height` metres up lands, relative to the point right under it:
 * away from the sun by height / tan(elevation). `sunDir` points from the ground towards the sun.
 * The elevation is limited to ~9 degrees so a grazing sun does not throw shadows kilometres away.
 */
export function cloudShadowOffset(
  sunDir: { x: number; y: number; z: number },
  height: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  const len = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
  const sy = Math.max(sunDir.y / len, 0.15);
  out.x = (-sunDir.x / len / sy) * height;
  out.z = (-sunDir.z / len / sy) * height;
  return out;
}

/** Shadow strength 0..1 for a sun elevation: the shadows fade out as the sun gets low or sets. */
export function cloudShadowSun(sunDirY: number, sunlight: number): number {
  return smooth(0.08, 0.35, sunDirY) * clamp01(sunlight);
}

/** Ground darkness (0..CLOUD_MAX_DARKNESS) for a blob density 0..1; exported for tests and mirrored in the shader. */
export function cloudShadowAlpha(density: number, strength: number): number {
  return clamp01(density) * CLOUD_MAX_DARKNESS * clamp01(strength);
}
