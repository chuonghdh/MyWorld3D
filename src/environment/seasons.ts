// Pure seasonal and per-instance variation logic for plants (no three.js scene objects).
// Kept free of rendering so it can be unit-tested: blossom shares, per-tree jitter, particle
// profiles and the colour rules for hedges and flowers.

import type { Season, TreeSpecies } from '../core/types';

// ---------------------------------------------------------------------------
// Spring blossom
// ---------------------------------------------------------------------------

export type BlossomColor = 'pink' | 'white' | 'cream';

export interface BlossomShare {
  /** Fraction (0-1) of the crown blobs that carry blossom. */
  blobShare: number;
  /** Faces of such a blob with a random value above this carry blossom (lower = more blossom). */
  faceMin: number;
  color: BlossomColor;
}

/** Blossom on a species in a season, or null when the species stays plain green. */
export function blossomShare(species: TreeSpecies, season: Season): BlossomShare | null {
  if (season !== 'spring') return null;
  switch (species) {
    case 'maple':
      return { blobShare: 0.6, faceMin: 0.25, color: 'pink' };
    case 'birch':
      return { blobShare: 0.3, faceMin: 0.45, color: 'white' };
    case 'oak':
      return { blobShare: 0.14, faceMin: 0.5, color: 'cream' };
    case 'ginkgo':
      return null;
  }
}

// ---------------------------------------------------------------------------
// Per-tree variation
// ---------------------------------------------------------------------------

/** Raw random numbers describing one tree; the season decides how much of it shows. */
export interface TreeVariation {
  /** -1..1 brightness. */
  light: number;
  /** -1..1 warm/cool hue shift. */
  hue: number;
  /** Horizontal scale multiplier. */
  width: number;
  /** Vertical scale multiplier. */
  height: number;
  /** Lean angles (radians) about the x and z axes. */
  leanX: number;
  leanZ: number;
  yaw: number;
  /** Crown variant roll, 0-1. */
  variantRoll: number;
}

export function treeVariation(rng: () => number): TreeVariation {
  const sym = () => rng() * 2 - 1;
  return {
    variantRoll: rng(),
    yaw: rng() * Math.PI * 2,
    width: 0.86 + rng() * 0.28,
    height: 0.9 + rng() * 0.2,
    light: sym(),
    hue: sym(),
    leanX: sym() * 0.05,
    leanZ: sym() * 0.05,
  };
}

/** How strongly per-tree colour jitter shows: autumn is the most varied, winter has no foliage. */
export function colorSpread(season: Season): number {
  switch (season) {
    case 'spring':
      return 1.1;
    case 'summer':
      return 0.9;
    case 'autumn':
      return 1.7;
    case 'winter':
      return 0;
  }
}

/** Multiplier [r, g, b] applied on top of the crown colours of one tree. */
export function treeTint(v: TreeVariation, season: Season): [number, number, number] {
  const spread = colorSpread(season);
  const l = 1 + 0.1 * v.light * spread;
  const h = 0.09 * v.hue * spread;
  return [l * (1 + h), l, l * (1 - h)];
}

/** Crown variant index for a roll in [0, 1). */
export function chooseVariant(roll: number, variants: number): number {
  return Math.min(variants - 1, Math.max(0, Math.floor(roll * variants)));
}

// ---------------------------------------------------------------------------
// Falling particles
// ---------------------------------------------------------------------------

export type ParticleKind = 'petal' | 'pollen' | 'leaf' | 'none';

export interface ParticleProfile {
  kind: ParticleKind;
  /** Fraction of the particle budget that is live in steady state. */
  density: number;
  colors: readonly string[];
  /** Multiplier on the leaf quad size. */
  sizeScale: number;
  /** Terminal fall speed in m/s. */
  fallSpeed: number;
  /** Sideways flutter amplitude in m/s. */
  flutter: number;
  /** Seconds a particle rests on the ground (0 = it disappears on landing). */
  groundLifetime: number;
  /** Maximum time in the air in seconds (0 = unlimited). */
  airLife: number;
  /** Spawn height range above the ground, metres. */
  spawnLow: number;
  spawnHigh: number;
}

const PROFILES: Record<Season, ParticleProfile> = {
  spring: {
    kind: 'petal',
    density: 0.85,
    colors: ['#f6b8cb', '#fbd9e4', '#fdf0f4', '#f19ab5', '#ffffff'],
    sizeScale: 0.42,
    fallSpeed: 0.45,
    flutter: 0.7,
    groundLifetime: 16,
    airLife: 0,
    spawnLow: 4,
    spawnHigh: 9,
  },
  summer: {
    kind: 'pollen',
    density: 0.3,
    colors: ['#f4ecb0', '#fbf4cc', '#ffffff', '#e8e0a0'],
    sizeScale: 0.13,
    fallSpeed: 0.04,
    flutter: 0.5,
    groundLifetime: 0,
    airLife: 18,
    spawnLow: 0.6,
    spawnHigh: 3.5,
  },
  autumn: {
    kind: 'leaf',
    density: 1,
    colors: ['#c8552a', '#d4862a', '#e0b23a', '#a8452a', '#b9a02e'],
    sizeScale: 1,
    fallSpeed: 0.8,
    flutter: 0.4,
    groundLifetime: 25,
    airLife: 0,
    spawnLow: 6,
    spawnHigh: 12,
  },
  winter: {
    kind: 'none',
    density: 0,
    colors: ['#ffffff'],
    sizeScale: 1,
    fallSpeed: 0.8,
    flutter: 0,
    groundLifetime: 0,
    airLife: 0,
    spawnLow: 0,
    spawnHigh: 0,
  },
};

export function particleProfile(season: Season): ParticleProfile {
  return PROFILES[season];
}

/** Number of live particles the system aims for in steady state. */
export function particleTarget(season: Season, limit: number): number {
  return Math.floor(limit * PROFILES[season].density);
}

// ---------------------------------------------------------------------------
// Hedges and flowers
// ---------------------------------------------------------------------------

/** How many blooms are still open: spring and summer full, autumn thin, winter none. */
export function bloomOpenness(season: Season): number {
  switch (season) {
    case 'spring':
      return 1;
    case 'summer':
      return 0.95;
    case 'autumn':
      return 0.4;
    case 'winter':
      return 0;
  }
}

export interface FoliageShift {
  /** Colour to mix towards. */
  target: string;
  /** Mix amount 0-1. */
  amount: number;
  /** Mix amount towards snow on upward faces. */
  snow: number;
}

/** Colour shift of hedges and bushes relative to their summer colours. */
export function foliageShift(season: Season): FoliageShift {
  switch (season) {
    case 'spring':
      return { target: '#a6d46a', amount: 0.3, snow: 0 };
    case 'summer':
      return { target: '#000000', amount: 0, snow: 0 };
    case 'autumn':
      return { target: '#b08a3a', amount: 0.35, snow: 0 };
    case 'winter':
      return { target: '#6a6050', amount: 0.55, snow: 0.6 };
  }
}
