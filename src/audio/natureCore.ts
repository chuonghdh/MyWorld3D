// Nature sounds: constants, pure helpers and voice types. Split from nature.ts.

import type { Emitter } from './bus';
import type { Season } from '../core/types';
import { clamp01 } from './math';
import { audio as audioTuning } from '../config/tuning';
import { randRange } from './synth';

// ---------------------------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------------------------
/** A rustle is one short burst, not a loop: about every 8-12 s, on 3 of the 5 nearest trees, only in a breeze. */
export const RUSTLE_INTERVAL_MIN_S = audioTuning.rustleIntervalMinS;
export const RUSTLE_INTERVAL_MAX_S = audioTuning.rustleIntervalMaxS;
export const RUSTLE_MIN_WIND = audioTuning.rustleMinWind;
export const RUSTLE_TREES = audioTuning.rustleTrees;
export const RUSTLE_NEAREST = audioTuning.rustleNearest;
export const RUSTLE_DURATION_MIN_S = audioTuning.rustleDurationMinS;
export const RUSTLE_DURATION_MAX_S = audioTuning.rustleDurationMaxS;
/** How far away (m) a tree can still rustle. */
export const RUSTLE_RANGE_M = audioTuning.rustleRangeM;
/** Output scale of one rustle voice before the emitter distance model. */
export const RUSTLE_GAIN = audioTuning.rustleGain;
/** Seconds of the one-pole smoothing that follows the wind level. */
/** Wind whistles: wind speed (m/s) where they start and reach full probability; ring 15-70 m around the listener. */
export const WHISTLE_MIN_WIND = audioTuning.whistleMinWind;
export const WHISTLE_FULL_WIND = audioTuning.whistleFullWind;
export const WHISTLE_MAX = audioTuning.whistleMax;
export const WHISTLE_MIN_M = audioTuning.whistleMinM;
export const WHISTLE_MAX_M = audioTuning.whistleMaxM;
export const WHISTLE_Y = audioTuning.whistleHeightM;
/** Crickets: max voices, ring around the listener (m), chirp carrier range (Hz), per-voice level. */
export const CRICKET_MAX = audioTuning.cricketMax;
export const CRICKET_MIN_M = audioTuning.cricketMinM;
export const CRICKET_MAX_M = audioTuning.cricketMaxM;
export const CRICKET_PULSE_HZ = 30;
export const CRICKET_LEVEL = audioTuning.cricketLevel;
/** Church bell: fundamental, spacing between strikes (s), maximum hearing distance (m), emitter height (m). */
export const BELL_HZ = 230;
export const BELL_SPACING_S = audioTuning.bellSpacingS;
export const BELL_RANGE_M = audioTuning.bellRangeM;
export const BELL_Y = audioTuning.bellHeightM;
export const BELL_LEVEL = audioTuning.bellLevel;
export const BELL_MAX_STEP_H = 0.1;
export const BELL_MAX_RATE_H_PER_S = 0.5;
export const MAX_DT = 2;

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------
/** Foliage loudness by season: lush in spring/summer, drier in autumn, bare in winter. */
export function seasonLeafLevel(season: Season): number {
  switch (season) {
    case 'spring': return 0.85;
    case 'summer': return 1;
    case 'autumn': return 0.65;
    default: return 0.1;
  }
}

/** Band-pass centre multiplier by season: dry autumn leaves crackle brighter. */
export function seasonLeafBrightness(season: Season): number {
  switch (season) {
    case 'spring': return 0.95;
    case 'summer': return 0.9;
    case 'autumn': return 1.35;
    default: return 1.1;
  }
}

/** Crackle (amplitude flutter) depth by season. */
export function seasonCrackle(season: Season): number {
  return season === 'autumn' ? 0.7 : season === 'winter' ? 0.5 : 0.3;
}

/** 0..1 wind drive for foliage: mean wind plus gust, about 14 m/s saturates. */
export function windDrive(windSpeed: number, gust: number): number {
  const w = Number.isFinite(windSpeed) ? Math.max(0, windSpeed) : 0;
  const g = Number.isFinite(gust) ? clamp01(gust) : 0;
  return clamp01((w + g * 4) / 14);
}

/** Rustle loudness (0..1) of one tree. Larger trees are louder. */
export function rustleLevel(windSpeed: number, gust: number, season: Season, treeScale: number): number {
  const wd = windDrive(windSpeed, gust);
  const size = Math.min(1.5, Math.max(0.5, 0.6 + 0.4 * (Number.isFinite(treeScale) ? treeScale : 1)));
  return seasonLeafLevel(season) * (0.06 + 0.94 * Math.pow(wd, 1.3)) * size;
}

/** Loudness (0..1) of one rustle burst: zero in still air, then growing with the wind. */
export function rustleBurstLevel(windSpeed: number, gust: number, season: Season, treeScale: number): number {
  const w = Number.isFinite(windSpeed) ? windSpeed : 0;
  if (w < RUSTLE_MIN_WIND) return 0;
  const wd = windDrive(windSpeed, gust);
  const size = Math.min(1.5, Math.max(0.5, 0.6 + 0.4 * (Number.isFinite(treeScale) ? treeScale : 1)));
  return seasonLeafLevel(season) * Math.pow(wd, 1.3) * size;
}

/** Band-pass centre (Hz) of the rustle: brighter with more wind and in autumn. */
export function rustleCenterHz(windSpeed: number, gust: number, season: Season): number {
  const wd = windDrive(windSpeed, gust);
  return Math.min(9000, (1400 + 2800 * wd) * seasonLeafBrightness(season));
}

/** Whistle starts per second: none below WHISTLE_MIN_WIND except a weak gust-driven chance above 5 m/s. */
export function whistleRate(windSpeed: number, gust: number): number {
  const w = clamp01((windSpeed - WHISTLE_MIN_WIND) / (WHISTLE_FULL_WIND - WHISTLE_MIN_WIND));
  const g = clamp01(gust) * clamp01((windSpeed - 5) / 4);
  return 0.012 * w + 0.25 * w * w + 0.05 * g;
}

/** 0..1 whistle strength (loudness) from wind and gust. */
export function whistleStrength(windSpeed: number, gust: number): number {
  return clamp01(0.3 + 0.5 * clamp01((windSpeed - WHISTLE_MIN_WIND) / (WHISTLE_FULL_WIND - WHISTLE_MIN_WIND)) + 0.3 * clamp01(gust));
}

export interface WhistlePlan {
  dur: number;
  f0: number;
  fMid: number;
  f1: number;
  q: number;
}

/** Centre frequency rises then falls inside 400-1500 Hz over 1.5-4 s. */
export function planWhistle(rand: () => number): WhistlePlan {
  const f0 = randRange(rand, 400, 1000);
  const fMid = Math.min(1500, f0 * randRange(rand, 1.3, 1.9));
  const f1 = Math.max(400, fMid * randRange(rand, 0.55, 0.85));
  return { dur: randRange(rand, 1.5, 4), f0, fMid, f1, q: randRange(rand, 18, 35) };
}

/** Crickets are on. Set to false to silence them (they play only in the 22:00-05:00 window, see cricketDensity). */
export const CRICKETS_ENABLED = audioTuning.cricketsEnabled;

/** Crickets sing only in the window [CRICKET_START_H, CRICKET_END_H) on the in-app clock (wraps midnight). */
export const CRICKET_START_H = audioTuning.cricketStartH;
export const CRICKET_END_H = audioTuning.cricketEndH;

/**
 * Cricket density 0..1 for a clock hour (0..24): zero outside the window; inside it, summer and autumn use the
 * tuned densities, otherwise none; fades out with rain.
 */
export function cricketDensity(hour: number, season: Season, rain: number): number {
  if (!CRICKETS_ENABLED) return 0;
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (!(h >= CRICKET_START_H || h < CRICKET_END_H)) return 0;
  const s = season === 'summer' ? audioTuning.cricketSummerDensity : season === 'autumn' ? audioTuning.cricketAutumnDensity : 0;
  return s * clamp01(1 - 1.5 * rain);
}

/** Bell strikes for a clock time: hour 1..12, midnight and noon strike 12. */
export function hourToStrikes(hour: number): number {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  const s = h % 12;
  return s === 0 ? 12 : s;
}

/** See the file header for the rule. prevTod is null on the first frame. */
export function shouldStrike(prevTod: number | null, tod: number, dt: number): boolean {
  if (prevTod === null || !(dt > 0) || !Number.isFinite(tod) || !Number.isFinite(prevTod)) return false;
  const adv = (((tod - prevTod) % 24) + 24) % 24;
  if (adv <= 0 || adv > BELL_MAX_STEP_H) return false;
  if (adv / dt > BELL_MAX_RATE_H_PER_S) return false;
  return Math.floor(((tod % 24) + 24) % 24) !== Math.floor(((prevTod % 24) + 24) % 24);
}

/** Inharmonic bell partials (ratio to the fundamental, amplitude, decay seconds). Hum, prime, tierce, quint, nominal. */
export const BELL_PARTIALS: ReadonlyArray<{ ratio: number; amp: number; decay: number }> = [
  { ratio: 0.5, amp: 0.45, decay: 6 },
  { ratio: 1, amp: 1, decay: 5 },
  { ratio: 1.0035, amp: 0.55, decay: 4.5 }, // slightly detuned prime: the slow beating of a real bell
  { ratio: 1.2, amp: 0.7, decay: 3.5 },
  { ratio: 1.5, amp: 0.5, decay: 3 },
  { ratio: 2, amp: 0.8, decay: 2.5 },
];

// ---------------------------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------------------------
export function safeStop(n: { stop(): void }): void {
  try {
    n.stop();
  } catch {
    /* not started or already stopped */
  }
}

export interface WhistleVoice {
  emitter: Emitter;
  end: number;
  stop: () => void;
}

export interface CricketVoice {
  emitter: Emitter;
  carrier: OscillatorNode;
  lfo: OscillatorNode;
  am: GainNode;
  lfoDepth: GainNode;
  gate: GainNode;
  /** Context time up to which chirps are already scheduled. */
  sched: number;
  level: number;
  x: number;
  z: number;
}

export interface Dying {
  emitter: Emitter;
  end: number;
  stop: () => void;
}

export interface Ringing {
  emitter: Emitter;
  strikesLeft: number;
  nextAt: number;
  end: number;
}

export interface NatureOptions {
  rand?: () => number;
}
