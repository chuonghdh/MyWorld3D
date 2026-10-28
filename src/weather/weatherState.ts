// Pure weather logic (no Three, no DOM): what each weather kind means in numbers, and how the
// derived values ease in and out over seconds. The controller in index.ts feeds these into particles,
// materials, lights, fog and audio.

export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear',
  cloudy: 'Cloudy',
  rain: 'Rain',
  storm: 'Storm',
  snow: 'Snow',
  fog: 'Fog',
};

/** Speed of sound used for the thunder delay, m/s. */
export const SPEED_OF_SOUND = 340;

/** Seconds between a lightning flash and its thunder for a strike `distance` metres away. */
export function thunderDelay(distance: number): number {
  return Math.max(0, distance) / SPEED_OF_SOUND;
}

/** Instantaneous target values for a weather kind at an intensity (0..1). */
export interface WeatherTargets {
  /** Rain amount 0..1 (drives streaks, splashes, umbrellas, sound). */
  rain: number;
  /** Surface wetness 0..1. */
  wet: number;
  /** Snowfall amount 0..1 (particles). */
  snowfall: number;
  /** Snow cover on upward faces 0..1. */
  snowCover: number;
  /** Fog thickness 0..1 (banks and fog density). */
  fog: number;
  /** Extra cloud cover 0..1. */
  cloud: number;
  /** 1 only in a storm: lightning allowed. */
  storm: number;
  /** Sun and hemisphere light multiplier, 1 = untouched. */
  dim: number;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Maximum rain amount per kind at intensity 1. */
const RAIN_CAP: Record<WeatherKind, number> = {
  clear: 0,
  cloudy: 0,
  rain: 0.75,
  storm: 1,
  snow: 0,
  fog: 0,
};

export function weatherTargets(kind: WeatherKind, intensity: number, out: WeatherTargets = blank()): WeatherTargets {
  const i = clamp01(intensity);
  out.rain = RAIN_CAP[kind] * i;
  out.snowfall = kind === 'snow' ? i : 0;
  out.fog = kind === 'fog' ? i : kind === 'cloudy' ? 0.08 * i : kind === 'rain' ? 0.18 * i : kind === 'snow' ? 0.3 * i : 0;
  out.storm = kind === 'storm' ? 1 : 0;
  switch (kind) {
    case 'clear':
      out.wet = 0;
      out.snowCover = 0;
      out.cloud = 0;
      out.dim = 1;
      break;
    case 'cloudy':
      // Dry: intensity only thickens the overcast (0.4 scattered .. 1 solid) and darkens the light.
      out.wet = 0;
      out.snowCover = 0;
      out.cloud = 0.4 + 0.6 * i;
      out.dim = 1 - 0.3 * i;
      break;
    case 'rain':
      out.wet = 0.6 + 0.4 * i;
      out.snowCover = 0;
      out.cloud = 0.65 + 0.3 * i;
      out.dim = 1 - 0.32 * i;
      break;
    case 'storm':
      out.wet = 0.8 + 0.2 * i;
      out.snowCover = 0;
      out.cloud = 0.85 + 0.15 * i;
      out.dim = 1 - 0.5 * i;
      break;
    case 'snow':
      out.wet = 0.12 * i;
      out.snowCover = Math.min(1, 0.25 + 0.9 * i);
      out.cloud = 0.5 + 0.4 * i;
      out.dim = 1 - 0.15 * i;
      break;
    case 'fog':
      out.wet = 0.3 * i;
      out.snowCover = 0;
      out.cloud = 0.3 + 0.4 * i;
      out.dim = 1 - 0.25 * i;
      break;
  }
  return out;
}

function blank(): WeatherTargets {
  return { rain: 0, wet: 0, snowfall: 0, snowCover: 0, fog: 0, cloud: 0, storm: 0, dim: 1 };
}

/** Time constants in seconds: how slowly each value approaches its target (rising, falling). */
export const EASE = {
  rain: [2, 3],
  wet: [7, 28],
  snowfall: [3, 4],
  snowCover: [18, 25],
  fog: [6, 8],
  cloud: [5, 8],
  storm: [1.5, 1.5],
  dim: [4, 5],
} as const;

/** The eased state the scene reads. */
export type WeatherValues = WeatherTargets;

export function createValues(): WeatherValues {
  return blank();
}

function approach(cur: number, target: number, dt: number, tauUp: number, tauDown: number): number {
  const tau = target > cur ? tauUp : tauDown;
  const k = 1 - Math.exp(-dt / Math.max(1e-3, tau));
  return cur + (target - cur) * k;
}

/** Advances `values` toward `targets` by dt seconds with exponential easing. Mutates `values`. */
export function stepValues(values: WeatherValues, targets: WeatherTargets, dt: number): WeatherValues {
  const keys = Object.keys(EASE) as (keyof typeof EASE)[];
  for (const k of keys) {
    const tau = EASE[k];
    values[k] = approach(values[k], targets[k], dt, tau[0], tau[1]);
  }
  return values;
}

/** Copies targets into values at once (initial state, loading a save). */
export function snapValues(values: WeatherValues, targets: WeatherTargets): WeatherValues {
  Object.assign(values, targets);
  return values;
}
