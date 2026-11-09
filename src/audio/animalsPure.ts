// Animal sounds: constants and pure helpers (activity, species, dog voice, song composition). Split from animals.ts.

import type { Season } from '../core/types';
import { clamp01 } from './math';
import { randRange } from './synth';
import { audio as audioTuning } from '../config/tuning';

// ---------------------------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------------------------
/** Max simultaneous songs started by 'bird-call' events. */
export const MAX_EVENT_SONGS = audioTuning.maxEventSongs;
/** Max simultaneous ambient (distant) songs. */
export const MAX_AMBIENT_SONGS = audioTuning.maxAmbientSongs;
/** Ambient songs spawn this far from the listener (m). */
export const AMBIENT_MIN_M = audioTuning.ambientMinM;
export const AMBIENT_MAX_M = audioTuning.ambientMaxM;
/** Mean seconds between ambient songs at full activity (dawn in spring). */
export const AMBIENT_MEAN_S = audioTuning.ambientMeanS;
/** Mean seconds between ambient owl hoots on a night with full owl chance. */
export const OWL_MEAN_S = audioTuning.owlMeanS;
/** Bird emitter height (canopy) and distance model. */
export const BIRD_Y = 6;
export const BIRD_REF_M = 8;
export const BIRD_MAX_M = audioTuning.birdMaxM;
/** Song loudness before the emitter distance model. */
export const BIRD_LEVEL = audioTuning.birdLevel;
/** Wing flutter: birds per scatter, pulse rate (Hz) and duration (s). */
export const FLAP_BIRDS_MIN = audioTuning.flapBirdsMin;
export const FLAP_BIRDS_MAX = audioTuning.flapBirdsMax;
export const FLAP_RATE_HZ = 8;
export const FLAP_DURATION_S = 1.1;
export const FLAP_LEVEL = audioTuning.flapLevel;
export const MAX_FLAPS = audioTuning.maxFlaps;
/** Dogs only bark within this distance of the listener (m). */
export const DOG_RANGE_M = audioTuning.dogRangeM;
/** Mean seconds between bark bouts per dog. */
export const DOG_MEAN_S = audioTuning.dogMeanS;
export const MAX_BARKERS = audioTuning.maxBarkers;
export const DOG_LEVEL = audioTuning.dogLevel;
/** The formant filters of the bark take most of the energy out of the clipped source: this brings it back up. */
export const BARK_BOOST = 4;
/** A vehicle this close (m) moving faster than DOG_VEHICLE_SPEED makes the dog bark twice as often. */
export const DOG_VEHICLE_M = audioTuning.dogVehicleM;
export const DOG_VEHICLE_SPEED = audioTuning.dogVehicleSpeed;
export const MAX_MEOWS = 3;
export const MEOW_LEVEL = audioTuning.meowLevel;
/** Frame dt is clamped to this (s) so a stalled tab does not fire everything at once. */
export const MAX_DT = 2;

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
export function gauss(x: number, c: number, w: number): number {
  const d = ((((x - c + 12) % 24) + 24) % 24) - 12;
  return Math.exp(-0.5 * (d / w) * (d / w));
}

/** 0..1 bird singing activity from the clock: dawn chorus 5-9 h (peak ~7), evening 17-20 h, sparse midday, none at night. */
export function birdTimeFactor(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const daylight = smoothstep(4.3, 5.7, h) * (1 - smoothstep(20, 21.5, h));
  const act = 0.22 + 0.78 * gauss(h, 7, 1.6) + 0.55 * gauss(h, 18.5, 1.3);
  return daylight * Math.min(1, act);
}

export function birdSeasonFactor(season: Season): number {
  switch (season) {
    case 'spring': return 1;
    case 'summer': return 0.8;
    case 'autumn': return 0.5;
    default: return 0.2;
  }
}

/** Birds fall silent in heavy rain (rain > 0.5) and thin out linearly before that. */
export function birdRainFactor(rain: number): number {
  return clamp01(1 - 2 * rain);
}

export function birdActivity(hour: number, season: Season, rain: number): number {
  return birdTimeFactor(hour) * birdSeasonFactor(season) * birdRainFactor(rain);
}

/** Chance (0..1) that a night uses owl hoots; none in heavy rain, rarer in winter. */
export function owlChance(night: boolean, season: Season, rain: number): number {
  if (!night) return 0;
  return (season === 'winter' ? 0.25 : 0.5) * birdRainFactor(rain);
}

export type BirdSpecies = 'blackbird' | 'sparrow' | 'robin' | 'pigeon' | 'owl';

/** Species weights by hour: blackbird/robin lead the dawn and evening, sparrow/pigeon the day. */
export function speciesWeights(hour: number): Record<Exclude<BirdSpecies, 'owl'>, number> {
  const dawn = gauss(hour, 7, 2);
  const eve = gauss(hour, 18.5, 1.5);
  return {
    blackbird: 0.2 + 0.3 * dawn + 0.35 * eve,
    robin: 0.12 + 0.2 * dawn + 0.1 * eve,
    sparrow: Math.max(0.05, 0.35 + 0.1 * dawn - 0.15 * eve),
    pigeon: Math.max(0.05, 0.3 - 0.2 * dawn),
  };
}

export function pickSpecies(rand: () => number, hour: number): Exclude<BirdSpecies, 'owl'> {
  const w = speciesWeights(hour);
  const keys = Object.keys(w) as (keyof typeof w)[];
  let total = 0;
  for (const k of keys) total += w[k];
  let r = rand() * total;
  for (const k of keys) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return keys[keys.length - 1];
}

/** Stable 0..1 body size from the dog id (0 small yappy, 1 big woof). */
export function dogSize(id: number): number {
  const s = Math.sin(id * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export interface DogVoice {
  /** Fundamental of the bark (Hz). */
  pitch: number;
  f1: number;
  f2: number;
  /** Duration of one bark (s). */
  dur: number;
  /** Gap between barks (s). */
  spacing: number;
}

export function dogVoice(id: number): DogVoice {
  const s = dogSize(id);
  return {
    // Small dogs yap high and short, big dogs woof low and long (fundamentals measured on real barks: 250-800 Hz).
    pitch: 780 - 520 * s,
    f1: 980 - 330 * s,
    f2: 2300 - 900 * s,
    dur: 0.1 + 0.17 * s,
    spacing: 0.26 + 0.2 * s,
  };
}

/** One scheduled oscillator note, times relative to the start of the song. */
export interface NoteSpec {
  t: number;
  dur: number;
  f0: number;
  f1: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
  vibHz?: number;
  vibDepth?: number;
}

export interface Song {
  notes: NoteSpec[];
  duration: number;
  /** Optional lowpass (soft cooing / hooting) applied to the whole song. */
  lowpassHz?: number;
}

export const clampF = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function blackbird(rand: () => number): Song {
  const notes: NoteSpec[] = [];
  let t = 0;
  const phrases = 2 + Math.floor(rand() * 3);
  for (let p = 0; p < phrases; p++) {
    let f = randRange(rand, 1500, 2300);
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const dur = randRange(rand, 0.12, 0.3);
      const f1 = clampF(f * randRange(rand, 0.72, 1.45), 1400, 3200);
      notes.push({ t, dur, f0: f, f1, gain: 0.16 * randRange(rand, 0.8, 1.2), attack: dur * 0.25, vibHz: randRange(rand, 5, 8), vibDepth: f * 0.015 });
      t += dur + randRange(rand, 0.03, 0.08);
      f = f1 * randRange(rand, 0.9, 1.1);
    }
    if (rand() < 0.6) {
      const m = 6 + Math.floor(rand() * 4);
      let tf = randRange(rand, 2200, 2800);
      for (let k = 0; k < m; k++) {
        notes.push({ t, dur: 0.04, f0: tf, f1: tf * 0.92, gain: 0.1 * (1 - (k / m) * 0.5), attack: 0.008 });
        t += 0.055;
        tf *= 0.985;
      }
    }
    t += randRange(rand, 0.45, 0.95);
  }
  return { notes, duration: t };
}

export function sparrow(rand: () => number): Song {
  const notes: NoteSpec[] = [];
  let t = 0;
  const n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    const dur = randRange(rand, 0.05, 0.09);
    const f0 = randRange(rand, 3200, 4600);
    notes.push({ t, dur, f0, f1: f0 * randRange(rand, 0.85, 1.2), gain: 0.12 * randRange(rand, 0.7, 1.1), type: 'triangle', attack: 0.006 });
    t += dur + randRange(rand, 0.06, 0.14);
  }
  return { notes, duration: t };
}

export function robin(rand: () => number): Song {
  const notes: NoteSpec[] = [];
  let t = 0;
  const n = 6 + Math.floor(rand() * 4);
  let base = randRange(rand, 4800, 5400);
  for (let i = 0; i < n; i++) {
    const dur = randRange(rand, 0.07, 0.14);
    const f0 = base * randRange(rand, 0.9, 1.08);
    notes.push({ t, dur, f0, f1: f0 * 0.78, gain: 0.1 * randRange(rand, 0.6, 1), attack: 0.01, vibHz: 28, vibDepth: 110 });
    t += dur + randRange(rand, 0.03, 0.1);
    base *= 0.94; // the phrase falls overall: thin, descending warble
  }
  return { notes, duration: t };
}

export function woodPigeon(rand: () => number): Song {
  const p = randRange(rand, 430, 560);
  // coo - COO - coo - coo (the classic five-syllable rhythm, shortened to four notes here)
  const pattern: Array<[number, number]> = [[1, 0.22], [1.09, 0.4], [1, 0.2], [0.98, 0.26]];
  const notes: NoteSpec[] = [];
  let t = 0;
  for (const [mul, dur] of pattern) {
    notes.push({ t, dur, f0: p * mul, f1: p * mul * 0.93, gain: 0.3, type: 'triangle', attack: 0.045, vibHz: 4, vibDepth: 4 });
    t += dur + 0.09;
  }
  return { notes, duration: t + 0.2, lowpassHz: 900 };
}

export function owl(rand: () => number): Song {
  const p = randRange(rand, 360, 430);
  const notes: NoteSpec[] = [
    { t: 0, dur: 0.5, f0: p * 1.05, f1: p * 0.95, gain: 0.3, attack: 0.12, vibHz: 4, vibDepth: 5 },
    { t: 0.75, dur: 0.15, f0: p, f1: p * 0.98, gain: 0.22, attack: 0.04 },
    { t: 0.95, dur: 1.1, f0: p * 0.99, f1: p * 0.9, gain: 0.3, attack: 0.15, vibHz: 4.5, vibDepth: 6 },
  ];
  return { notes, duration: 2.3, lowpassHz: 700 };
}

export function composeSong(species: BirdSpecies, rand: () => number): Song {
  switch (species) {
    case 'blackbird': return blackbird(rand);
    case 'sparrow': return sparrow(rand);
    case 'robin': return robin(rand);
    case 'pigeon': return woodPigeon(rand);
    default: return owl(rand);
  }
}
