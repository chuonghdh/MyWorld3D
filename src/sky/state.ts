// Pure sky state: turns the time of day and the weather overlay into the plain numbers the sky
// and ground shaders need. No WebGL here, so it is unit-testable.

import type { Season } from '../core/types';
import { getLightingForTime, getMoonPhase, type Rgb, type SunQuery } from '../environment/sun';

export type Vec3 = [number, number, number];

export interface SkyInput {
  /** Light slider value, 0-24. */
  timeOfDay: number;
  season?: Season;
  /** Weather overlay: cloud cover 0..1. */
  cloudiness?: number;
  /** Weather overlay: lightning flash 0..1. */
  flash?: number;
  /** Horizon/fog colour. Defaults to the time-of-day sky colour. Pass the colour of the scene fog. */
  fogColor?: Rgb;
  query?: SunQuery;
}

export interface SkyUniformValues {
  sunDir: Vec3;
  moonDir: Vec3;
  /** Light direction in the moon's disc frame (x right, y up, z towards the viewer). */
  moonLight: Vec3;
  zenith: Vec3;
  horizon: Vec3;
  sunColor: Vec3;
  /** 0..1 how visible the sun disc and glow are. */
  sunVis: number;
  moonVis: number;
  /** 0..1 star brightness. */
  stars: number;
  /** 0..1 how wide the sun glow is (largest at golden hour). */
  glowK: number;
  nightness: number;
  cloudiness: number;
  flash: number;
  /** Colour multiplier to give the ground disc the same lighting mood as the town. */
  groundLight: Vec3;
  /** Linear-ish base ground colour for the season, as 0..1 rgb. */
  groundColor: Vec3;
}

interface ZenithKey {
  alt: number;
  color: Rgb;
}

const hex = (h: string): Rgb => ({
  r: parseInt(h.slice(1, 3), 16) / 255,
  g: parseInt(h.slice(3, 5), 16) / 255,
  b: parseInt(h.slice(5, 7), 16) / 255,
});

// Zenith colour by sun altitude (degrees); the horizon colour comes from the sun module's sky colour.
const ZENITH: ZenithKey[] = [
  { alt: -18, color: hex('#070c22') },
  { alt: -6, color: hex('#161f55') },
  { alt: 0, color: hex('#3b4f94') },
  { alt: 6, color: hex('#5a86c8') },
  { alt: 16, color: hex('#4a8fdc') },
  { alt: 60, color: hex('#3a80d8') },
];

/** Ground tint beyond the town, per season. */
export const GROUND_COLORS: Record<Season, string> = {
  spring: '#8fa86c',
  summer: '#7f9a5a',
  autumn: '#9a8c5a',
  winter: '#dde3e8',
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

function zenithFor(altDeg: number): Rgb {
  if (altDeg <= ZENITH[0].alt) return ZENITH[0].color;
  const last = ZENITH[ZENITH.length - 1];
  if (altDeg >= last.alt) return last.color;
  for (let i = 0; i < ZENITH.length - 1; i++) {
    const a = ZENITH[i];
    const b = ZENITH[i + 1];
    if (altDeg >= a.alt && altDeg <= b.alt) {
      const t = (altDeg - a.alt) / (b.alt - a.alt);
      return { r: lerp(a.color.r, b.color.r, t), g: lerp(a.color.g, b.color.g, t), b: lerp(a.color.b, b.color.b, t) };
    }
  }
  return last.color;
}

const toVec = (c: Rgb): Vec3 => [c.r, c.g, c.b];

/** sRGB hex to linear 0..1 (the shader works in linear space like the rest of the scene). */
export function hexToLinear(h: string): Vec3 {
  const c = hex(h);
  const f = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return [f(c.r), f(c.g), f(c.b)];
}

/** All shader inputs for one moment. Sky colours are passed raw, exactly as Town.tsx feeds the fog. */
export function computeSkyState(input: SkyInput): SkyUniformValues {
  const { sun, moon, sky } = getLightingForTime(input.timeOfDay, input.query);
  const cloudiness = clamp01(input.cloudiness ?? 0.25);
  const flash = clamp01(input.flash ?? 0);
  const season: Season = input.season ?? 'summer';
  const alt = sun.altitudeDeg;

  // The sun module's colours are sRGB-style hex fractions; three.js Color(r,g,b) takes them as
  // linear numbers, which is how Town.tsx feeds the fog. Stay consistent with that: pass them raw.
  const horizon = toVec(input.fogColor ?? sky.sky);
  const zenith = toVec(zenithFor(alt));
  // Overcast skies lose the deep zenith blue and sink to the horizon grey.
  const grey = horizon[0] * 0.3 + horizon[1] * 0.59 + horizon[2] * 0.11;
  const zen: Vec3 = [
    lerp(zenith[0], lerp(horizon[0], grey, 0.4) * 0.92, cloudiness * 0.8),
    lerp(zenith[1], lerp(horizon[1], grey, 0.4) * 0.92, cloudiness * 0.8),
    lerp(zenith[2], lerp(horizon[2], grey, 0.4) * 0.95, cloudiness * 0.8),
  ];

  const dayAbove = smoothstep(-4, 3, alt);
  const golden = smoothstep(14, 5, alt) * smoothstep(-6, 0, alt);
  const moonVis = smoothstep(2, -8, alt) * (1 - cloudiness * 0.75);
  const stars = smoothstep(-5, -15, alt) * (1 - cloudiness * 0.95);

  // Phase to the light direction on the moon's disc: x = sin(2*pi*p), z = -cos(2*pi*p).
  // The real phase is squeezed into 0.35..0.65 so the artistic moon is never a black disc.
  const phase = 0.35 + 0.3 * getMoonPhase(input.timeOfDay, input.query);
  const moonLight: Vec3 = [Math.sin(phase * Math.PI * 2), 0.15, -Math.cos(phase * Math.PI * 2)];

  const ambient = sky.ambientIntensity;
  const lightMul = ambient * 1.3 + sky.sunIntensity * 0.6 * (1 - cloudiness * 0.6) + sky.moonFill * 0.5;
  const sc = sky.sunColor;

  return {
    sunDir: [sun.x, sun.y, sun.z],
    moonDir: [moon.x, moon.y, moon.z],
    moonLight,
    zenith: zen,
    horizon,
    sunColor: toVec(sc),
    sunVis: dayAbove * (1 - cloudiness * 0.85),
    moonVis,
    stars,
    glowK: golden,
    nightness: sky.nightness,
    cloudiness,
    flash,
    groundLight: [lightMul * lerp(1, sc.r, 0.35), lightMul * lerp(1, sc.g, 0.35), lightMul * lerp(1, sc.b, 0.35)],
    groundColor: hexToLinear(GROUND_COLORS[season] ?? GROUND_COLORS.summer),
  };
}
