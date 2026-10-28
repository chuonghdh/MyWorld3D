// Sun and moon position, and sky colour/intensity curves.
// Pure logic (no WebGL). Uses suncalc for astronomical positions.

import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';

export interface GeoLocation {
  /** Latitude in degrees, north positive. */
  lat: number;
  /** Longitude in degrees, east positive. */
  lng: number;
  /** Offset of the local clock from UTC, in hours. Hanoi is UTC+7. */
  utcOffsetHours: number;
}

/** Hanoi, Vietnam. */
export const DEFAULT_LOCATION: GeoLocation = { lat: 21.03, lng: 105.85, utcOffsetHours: 7 };

export interface SunQuery {
  /** Calendar day used for the orbit, as a { year, month (1-12), day } triple. */
  date?: { year: number; month: number; day: number };
  location?: GeoLocation;
}

/** Default calendar day for the sun orbit: the spring equinox. */
const DEFAULT_DATE = { year: 2026, month: 3, day: 20 };

/** Build the absolute instant for a local clock hour (0-24) on the given day. */
export function instantForHour(timeOfDay: number, query: SunQuery = {}): Date {
  const d = query.date ?? DEFAULT_DATE;
  const loc = query.location ?? DEFAULT_LOCATION;
  const utcMidnightMs = Date.UTC(d.year, d.month - 1, d.day);
  return new Date(utcMidnightMs + (timeOfDay - loc.utcOffsetHours) * 3_600_000);
}

export interface SunDirection {
  /** Unit vector pointing towards the sun. x = east, y = up, z = south (three.js-friendly). */
  x: number;
  y: number;
  z: number;
  /** Altitude above the horizon in degrees. Negative means below the horizon. */
  altitudeDeg: number;
  /** Azimuth in degrees, 0 = north, clockwise. */
  azimuthDeg: number;
}

function toDirection(altitude: number, azimuthFromSouthWest: number): SunDirection {
  // suncalc azimuth: 0 = south, positive towards west.
  const cosAlt = Math.cos(altitude);
  const x = -Math.sin(azimuthFromSouthWest) * cosAlt; // east component
  const y = Math.sin(altitude);
  const z = Math.cos(azimuthFromSouthWest) * cosAlt; // south component
  const azimuthDeg = (((azimuthFromSouthWest + Math.PI) * 180) / Math.PI) % 360;
  return {
    x,
    y,
    z,
    altitudeDeg: (altitude * 180) / Math.PI,
    azimuthDeg: (azimuthDeg + 360) % 360,
  };
}

/** Sun direction for a local clock hour (0-24) at the given location and day. */
export function getSunDirection(timeOfDay: number, query: SunQuery = {}): SunDirection {
  const loc = query.location ?? DEFAULT_LOCATION;
  const pos = getPosition(instantForHour(timeOfDay, query), loc.lat, loc.lng);
  return toDirection(pos.altitude, pos.azimuth);
}

/** Moon direction for a local clock hour (0-24). Same frame as the sun. */
export function getMoonDirection(timeOfDay: number, query: SunQuery = {}): SunDirection {
  const loc = query.location ?? DEFAULT_LOCATION;
  const pos = getMoonPosition(instantForHour(timeOfDay, query), loc.lat, loc.lng);
  return toDirection(pos.altitude, pos.azimuth);
}

/**
 * Moon direction used for the sky and the night light. The real moon is often below the horizon at
 * the hours the slider shows, which would leave the night without a moon, so the moon sits opposite
 * the sun (rises as the sun sets) with the real phase of the day.
 */
export function getNightMoonDirection(timeOfDay: number, query: SunQuery = {}): SunDirection {
  const sun = getSunDirection(timeOfDay, query);
  return {
    x: -sun.x,
    y: -sun.y,
    z: -sun.z,
    altitudeDeg: -sun.altitudeDeg,
    azimuthDeg: (sun.azimuthDeg + 180) % 360,
  };
}

/** Moon phase 0..1 (0 new, 0.5 full) for the calendar day of the query. */
export function getMoonPhase(timeOfDay: number, query: SunQuery = {}): number {
  return getMoonIllumination(instantForHour(timeOfDay, query)).phase;
}

export type DayPhase = 'night' | 'dusk' | 'golden' | 'day';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface SkyState {
  phase: DayPhase;
  /** Background sky colour. */
  sky: Rgb;
  /** Colour of the directional (sun/moon) light. */
  sunColor: Rgb;
  /** Intensity of the directional light, 0-1.2. */
  sunIntensity: number;
  /** Ambient light intensity, 0.15-0.7. */
  ambientIntensity: number;
  /** Street lamps and lit windows should be on when this is true. */
  lightsOn: boolean;
  /** 0 by day .. 1 at full night (smooth through dusk). Drives stars, moon and night fill. */
  nightness: number;
  /** Moonlight fill strength on the same 0-1.2 scale as sunIntensity (no shadow). */
  moonFill: number;
  /** Cool colour of the moonlight fill. */
  moonColor: Rgb;
}

interface Keyframe {
  alt: number; // sun altitude in degrees
  sky: Rgb;
  sunColor: Rgb;
  sunIntensity: number;
  ambientIntensity: number;
}

const hex = (h: string): Rgb => ({
  r: parseInt(h.slice(1, 3), 16) / 255,
  g: parseInt(h.slice(3, 5), 16) / 255,
  b: parseInt(h.slice(5, 7), 16) / 255,
});

// Keyframes ordered by sun altitude (degrees).
const KEYFRAMES: Keyframe[] = [
  { alt: -18, sky: hex('#121a3a'), sunColor: hex('#5a6ea8'), sunIntensity: 0.08, ambientIntensity: 0.3 },
  { alt: -6, sky: hex('#26306a'), sunColor: hex('#8a6a9a'), sunIntensity: 0.14, ambientIntensity: 0.3 },
  { alt: 0, sky: hex('#e0734a'), sunColor: hex('#ff9a55'), sunIntensity: 0.6, ambientIntensity: 0.35 },
  { alt: 6, sky: hex('#f2b272'), sunColor: hex('#ffc27a'), sunIntensity: 0.9, ambientIntensity: 0.45 },
  { alt: 16, sky: hex('#9ccfee'), sunColor: hex('#fff1dc'), sunIntensity: 1.1, ambientIntensity: 0.6 },
  { alt: 60, sky: hex('#8ec8f0'), sunColor: hex('#fff8ef'), sunIntensity: 1.15, ambientIntensity: 0.65 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function phaseFor(altDeg: number): DayPhase {
  if (altDeg < -6) return 'night';
  if (altDeg < 0) return 'dusk';
  if (altDeg < 6) return 'golden';
  return 'day';
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 0 by day .. 1 at night for a sun altitude in degrees (full below -12). */
export function nightnessFor(altitudeDeg: number): number {
  return smoothstep(0, -12, altitudeDeg);
}

/**
 * Evening schedule for things that switch on after dark, all 0..1 and monotonic through the evening.
 * `lamps` ramps with dusk, `shops` follows right after, `windows` is the fraction of lit windows
 * (a few at dusk, most by late evening, thinning out in the small hours).
 */
export function getNightSchedule(timeOfDay: number, altitudeDeg: number): { lamps: number; shops: number; windows: number } {
  const dark = nightnessFor(altitudeDeg);
  const lamps = smoothstep(4, -2, altitudeDeg);
  const shops = smoothstep(2, -4, altitudeDeg) * (1 - smoothstep(23, 24, timeOfDay) * 0.6);
  const h = ((timeOfDay % 24) + 24) % 24;
  // Late night: from 22:00 windows go out gradually down to 30% by 02:00; they come back at 04:00-06:00.
  const t = h < 12 ? h + 24 : h;
  const late = 1 - 0.7 * smoothstep(22, 26, t) + 0.7 * smoothstep(28, 30, t);
  const windows = (0.15 + 0.85 * dark) * late * smoothstep(8, -2, altitudeDeg);
  return { lamps, shops, windows };
}

/** Sky, light colour and intensity for a given sun altitude in degrees. */
export function getSkyState(altitudeDeg: number): SkyState {
  const first = KEYFRAMES[0];
  const last = KEYFRAMES[KEYFRAMES.length - 1];
  let lo = first;
  let hi = last;
  if (altitudeDeg <= first.alt) {
    lo = hi = first;
  } else if (altitudeDeg >= last.alt) {
    lo = hi = last;
  } else {
    for (let i = 0; i < KEYFRAMES.length - 1; i++) {
      if (altitudeDeg >= KEYFRAMES[i].alt && altitudeDeg <= KEYFRAMES[i + 1].alt) {
        lo = KEYFRAMES[i];
        hi = KEYFRAMES[i + 1];
        break;
      }
    }
  }
  const span = hi.alt - lo.alt;
  const t = span === 0 ? 0 : (altitudeDeg - lo.alt) / span;
  return {
    phase: phaseFor(altitudeDeg),
    sky: lerpRgb(lo.sky, hi.sky, t),
    sunColor: lerpRgb(lo.sunColor, hi.sunColor, t),
    sunIntensity: lerp(lo.sunIntensity, hi.sunIntensity, t),
    ambientIntensity: lerp(lo.ambientIntensity, hi.ambientIntensity, t),
    lightsOn: altitudeDeg < 0,
    nightness: nightnessFor(altitudeDeg),
    moonFill: nightnessFor(altitudeDeg) * 0.55,
    moonColor: hex('#8fa8e8'),
  };
}

/**
 * Full lighting state for the Light slider value (timeOfDay, 0-24).
 * The sun direction comes from suncalc; the colours come from getSkyState.
 */
export function getLightingForTime(
  timeOfDay: number,
  query: SunQuery = {},
): { sun: SunDirection; moon: SunDirection; sky: SkyState } {
  const sun = getSunDirection(timeOfDay, query);
  const moon = getNightMoonDirection(timeOfDay, query);
  return { sun, moon, sky: getSkyState(sun.altitudeDeg) };
}
