// People sounds: constants, pose mapping, speakers and shared helpers. Split from people.ts.

import { createRandom } from './synth';


export const POSE_WALK = 0;
export const POSE_STAND = 1;
export const POSE_CHAT = 2;
export const POSE_SIT = 3;

export const CHAT_VOICES = 4;
export const STEP_VOICES = 5;
export const UMBRELLA_VOICES = 4;
export const CHAT_MAX_DISTANCE = 30;
export const STEP_MAX_DISTANCE = 28;
export const UMBRELLA_MAX_DISTANCE = 25;
export const RAIN_ON = 0.15;
export const RAIN_OFF = 0.1;
export const WET_STEP_RAIN = 0.1;
export const FADE_TC = 0.06;
export const FADE_OUT_S = 0.4;
/** Ear / mouth height used for emitters (m). */
export const MOUTH_Y = 1.6;

export type PoseKind = 'walk' | 'stand' | 'chat' | 'sit' | 'other';

/** Maps the frame's pose (number, numeric string or name) to a kind. */
export function poseKind(pose: unknown): PoseKind {
  const n = typeof pose === 'number' ? pose : typeof pose === 'string' && pose.trim() !== '' ? Number(pose) : Number.NaN;
  if (n === POSE_WALK) return 'walk';
  if (n === POSE_STAND) return 'stand';
  if (n === POSE_CHAT) return 'chat';
  if (n === POSE_SIT) return 'sit';
  if (pose === 'walk' || pose === 'stand' || pose === 'chat' || pose === 'sit') return pose;
  return 'other';
}

/** Steps per second for a walking speed in m/s (about 1.95 steps/s at 1.4 m/s). */
export function stepRate(speed: number): number {
  const s = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  return Math.min(3.4, Math.max(1.2, s / 0.72));
}

// ---------------------------------------------------------------------------------------------------------
// Speakers

/** Male-adult vowel formants (F1, F2, F3 in Hz); scaled per speaker by vocal tract length. */
export const VOWELS: readonly (readonly [number, number, number])[] = [
  [730, 1090, 2440], // a
  [530, 1840, 2480], // e
  [270, 2290, 3010], // i
  [570, 840, 2410], // o
  [300, 870, 2240], // u
  [500, 1500, 2500], // schwa
];

export interface Speaker {
  /** Voice pitch in Hz. */
  f0: number;
  /** Vocal tract scale (1 men, higher for women and children). */
  vtl: number;
  /** Syllables per second, 3..5. */
  rate: number;
  /** The speaker's three habitual vowels (F1, F2, F3 already scaled). */
  vowels: [number, number, number][];
}

/** Deterministic speaker from a pedestrian id: the same person always sounds the same. */
export function speakerFor(id: number): Speaker {
  const r = createRandom(Math.imul((id | 0) + 1, 2654435761) ^ 0x5bd1e995);
  const kind = r();
  let f0: number;
  let vtl: number;
  if (kind < 0.5) {
    f0 = 90 + r() * 40; // men 90-130 Hz
    vtl = 1;
  } else if (kind < 0.85) {
    f0 = 190 + r() * 60; // women 190-250 Hz
    vtl = 1.17;
  } else {
    f0 = 220 + r() * 30; // children 220-250 Hz
    vtl = 1.32;
  }
  const vowels: [number, number, number][] = [];
  const pool = VOWELS.map((_, i) => i);
  for (let k = 0; k < 3; k++) {
    const pick = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const j = 0.94 + r() * 0.12;
    const v = VOWELS[pick];
    vowels.push([v[0] * vtl * j, v[1] * vtl * j, v[2] * vtl * j]);
  }
  return { f0, vtl, rate: 3 + r() * 2, vowels };
}

// ---------------------------------------------------------------------------------------------------------
// Helpers

export function setTarget(ctx: BaseAudioContext, p: AudioParam, v: number, tc: number): void {
  if (!Number.isFinite(v)) return;
  if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, ctx.currentTime, tc);
  else p.value = v;
}

export interface Voice {
  endTime: number;
  release(): void;
  destroy(): void;
}
