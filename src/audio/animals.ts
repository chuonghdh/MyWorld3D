// Animal sounds: bird songs (event driven and an ambient trickle), wing-flap flutter, dog barks, cat meows.
// Every sound is a separate positional one-shot: its own oscillators/noise, its own Emitter at the object's
// position, disposed when the sound has finished. No shared mixed loop. See docs/AUDIO.md.
//
// Everything here is synthesised from acoustics knowledge and has not been judged by ear (see the
// tuning constants below).

import type { Emitter, AudioBus } from './bus';
import type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
import type { Season } from '../core/types';
import { clamp01 } from './math';
import { createRandom, makeNoiseBuffer, playNoiseBurst, randRange } from './synth';

// ---------------------------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------------------------
/** Max simultaneous songs started by 'bird-call' events. */
export const MAX_EVENT_SONGS = 4;
/** Max simultaneous ambient (distant) songs. */
export const MAX_AMBIENT_SONGS = 3;
/** Ambient songs spawn this far from the listener (m). */
export const AMBIENT_MIN_M = 20;
export const AMBIENT_MAX_M = 90;
/** Mean seconds between ambient songs at full activity (dawn in spring). */
export const AMBIENT_MEAN_S = 9;
/** Mean seconds between ambient owl hoots on a night with full owl chance. */
export const OWL_MEAN_S = 28;
/** Bird emitter height (canopy) and distance model. */
export const BIRD_Y = 6;
export const BIRD_REF_M = 8;
export const BIRD_MAX_M = 160;
/** Song loudness before the emitter distance model. */
export const BIRD_LEVEL = 1;
/** Wing flutter: birds per scatter, pulse rate (Hz) and duration (s). */
export const FLAP_BIRDS_MIN = 3;
export const FLAP_BIRDS_MAX = 6;
export const FLAP_RATE_HZ = 8;
export const FLAP_DURATION_S = 1.1;
export const FLAP_LEVEL = 0.55;
export const MAX_FLAPS = 3;
/** Dogs only bark within this distance of the listener (m). */
export const DOG_RANGE_M = 120;
/** Mean seconds between bark bouts per dog. */
export const DOG_MEAN_S = 900;
export const MAX_BARKERS = 3;
export const DOG_LEVEL = 0.5;
/** The formant filters of the bark take most of the energy out of the clipped source: this brings it back up. */
const BARK_BOOST = 4;
/** A vehicle this close (m) moving faster than DOG_VEHICLE_SPEED makes the dog bark twice as often. */
export const DOG_VEHICLE_M = 12;
export const DOG_VEHICLE_SPEED = 3;
export const MAX_MEOWS = 3;
export const MEOW_LEVEL = 0.55;
/** Frame dt is clamped to this (s) so a stalled tab does not fire everything at once. */
const MAX_DT = 2;

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------------------------
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
function gauss(x: number, c: number, w: number): number {
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

const clampF = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function blackbird(rand: () => number): Song {
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

function sparrow(rand: () => number): Song {
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

function robin(rand: () => number): Song {
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

function woodPigeon(rand: () => number): Song {
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

function owl(rand: () => number): Song {
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

// ---------------------------------------------------------------------------------------------
// Voice builders
// ---------------------------------------------------------------------------------------------
type Disposer = () => void;

/** One enveloped oscillator note with optional vibrato; disconnects itself when it ends. */
function playNote(ctx: AudioContext, dest: AudioNode, t0: number, n: NoteSpec): void {
  const t = t0 + n.t;
  const end = t + n.dur;
  const osc = ctx.createOscillator();
  osc.type = n.type ?? 'sine';
  osc.frequency.setValueAtTime(n.f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, n.f1), end);
  const env = ctx.createGain();
  const attack = Math.min(n.attack ?? 0.01, n.dur * 0.5);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(n.gain, t + attack);
  env.gain.linearRampToValueAtTime(0, end);
  osc.connect(env);
  env.connect(dest);
  let lfo: OscillatorNode | null = null;
  let lfoGain: GainNode | null = null;
  if (n.vibHz && n.vibDepth) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = n.vibHz;
    lfoGain = ctx.createGain();
    lfoGain.gain.value = n.vibDepth;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(end + 0.02);
  }
  osc.start(t);
  osc.stop(end + 0.02);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
    lfo?.disconnect();
    lfoGain?.disconnect();
  };
}

/** Plays a composed song into dest at t0. Returns the nodes to disconnect on reap. */
function playSong(ctx: AudioContext, dest: AudioNode, t0: number, song: Song, level: number): Disposer {
  let out: AudioNode = dest;
  let filt: BiquadFilterNode | null = null;
  if (song.lowpassHz) {
    filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = song.lowpassHz;
    filt.Q.value = 0.7;
    filt.connect(dest);
    out = filt;
  }
  for (const n of song.notes) playNote(ctx, out, t0, { ...n, gain: n.gain * level });
  return () => filt?.disconnect();
}

/** A soft-clipping curve (tanh): turns a smooth source into the gritty, harmonic-rich voice of a bark. */
let gritCurve: Float32Array | null = null;
function makeGrit(): Float32Array {
  if (!gritCurve) {
    const n = 1024;
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(3.2 * x);
    }
    gritCurve = c;
  }
  return gritCurve;
}

/**
 * A bout of 2-4 barks. A real bark is a short, harsh, pitched burst: a glottal pulse train (rich in harmonics) whose
 * pitch snaps up and then falls, pushed through the open-then-closing mouth (the first formant rises on the
 * "wuh" and sinks on the "oof"), with a lot of breath noise and an abrupt onset. Each bark here is a sawtooth with
 * an irregular pulse rhythm (jitter), soft-clipped for grit, through three moving formants, plus a noise "huff".
 */
function playBarks(ctx: AudioContext, dest: AudioNode, t0: number, v: DogVoice, count: number, rand: () => number): number {
  const wobble = randRange(rand, 0.94, 1.06);
  let t = t0;
  for (let k = 0; k < count; k++) {
    // The first bark is the hardest; later ones are a little shorter and higher, with irregular gaps.
    const pitch = v.pitch * wobble * (1 + 0.04 * k) * randRange(rand, 0.97, 1.03);
    const dur = v.dur * randRange(rand, 0.85, 1.1) * (k === 0 ? 1.1 : 0.9);
    const end = t + dur;
    const lvl = DOG_LEVEL * BARK_BOOST * (k === 0 ? 1 : 0.8);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch * 0.85, t);
    osc.frequency.exponentialRampToValueAtTime(pitch * 1.18, t + dur * 0.18); // the pitch snaps up...
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.62, end); // ...and falls away
    // Irregular glottal pulses: fast random-ish pitch jitter.
    const jitter = ctx.createOscillator();
    jitter.type = 'triangle';
    jitter.frequency.value = randRange(rand, 38, 61);
    const jitterDepth = ctx.createGain();
    jitterDepth.gain.value = pitch * 0.045;
    jitter.connect(jitterDepth);
    jitterDepth.connect(osc.frequency);

    const grit = ctx.createWaveShaper();
    grit.curve = makeGrit();
    grit.oversample = '2x';
    const pre = ctx.createGain();
    pre.gain.value = 0.9;
    osc.connect(pre);
    pre.connect(grit);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(lvl, t + 0.006); // abrupt onset
    env.gain.exponentialRampToValueAtTime(lvl * 0.55, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    // Three formants; the first one opens and closes with the mouth.
    const bands: { f0: number; f1: number; fEnd: number; q: number; g: number }[] = [
      { f0: v.f1 * 0.82, f1: v.f1 * 1.05, fEnd: v.f1 * 0.74, q: 3.2, g: 1 },
      { f0: v.f2 * 0.9, f1: v.f2, fEnd: v.f2 * 0.85, q: 3.5, g: 0.6 },
      { f0: v.f2 * 1.45, f1: v.f2 * 1.5, fEnd: v.f2 * 1.3, q: 4, g: 0.25 },
    ];
    const nodes: AudioNode[] = [];
    for (const b of bands) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = b.q;
      bp.frequency.setValueAtTime(b.f0, t);
      bp.frequency.linearRampToValueAtTime(b.f1, t + dur * 0.28);
      bp.frequency.linearRampToValueAtTime(b.fEnd, end);
      const g = ctx.createGain();
      g.gain.value = b.g;
      grit.connect(bp);
      bp.connect(g);
      g.connect(env);
      nodes.push(bp, g);
    }
    env.connect(dest);
    osc.start(t);
    jitter.start(t);
    osc.stop(end + 0.02);
    jitter.stop(end + 0.02);
    osc.onended = () => {
      osc.disconnect();
      jitter.disconnect();
      jitterDepth.disconnect();
      pre.disconnect();
      grit.disconnect();
      for (const n of nodes) n.disconnect();
      env.disconnect();
    };
    // The breathy "huff" that starts the bark and the rough, noisy body of it.
    playNoiseBurst(ctx, dest, { when: t, attack: 0.002, decay: 0.035, gain: 0.5 * lvl, filter: { type: 'bandpass', frequency: v.f2 * 0.8, q: 0.9 } });
    playNoiseBurst(ctx, dest, { when: t, attack: 0.006, decay: dur * 0.8, gain: 0.22 * lvl, filter: { type: 'bandpass', frequency: v.f1 * 1.3, q: 1.4 } });
    t += v.spacing * randRange(rand, 0.8, 1.25);
    if (k === count - 1) t = end;
  }
  return t;
}

/** A meow: sawtooth with a glide 500 -> 900 -> 600 Hz, a swept formant and a breathy onset. Returns the end time. */
function playMeow(ctx: AudioContext, dest: AudioNode, t0: number, rand: () => number): number {
  const pitch = randRange(rand, 0.85, 1.2);
  const dur = randRange(rand, 0.5, 0.9);
  const mid = t0 + dur * 0.4;
  const end = t0 + dur;
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(500 * pitch, t0);
  osc.frequency.exponentialRampToValueAtTime(900 * pitch, mid);
  osc.frequency.exponentialRampToValueAtTime(600 * pitch, end);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 6;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 12;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.Q.value = 3.5;
  formant.frequency.setValueAtTime(800, t0);
  formant.frequency.exponentialRampToValueAtTime(2200, mid);
  formant.frequency.exponentialRampToValueAtTime(1200, end);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(MEOW_LEVEL, t0 + 0.06);
  env.gain.linearRampToValueAtTime(MEOW_LEVEL * 0.8, t0 + dur * 0.75);
  env.gain.linearRampToValueAtTime(0, end);
  osc.connect(formant);
  formant.connect(env);
  env.connect(dest);
  lfo.start(t0);
  lfo.stop(end + 0.02);
  osc.start(t0);
  osc.stop(end + 0.02);
  osc.onended = () => {
    osc.disconnect();
    lfo.disconnect();
    lfoGain.disconnect();
    formant.disconnect();
    env.disconnect();
  };
  playNoiseBurst(ctx, dest, { when: t0, attack: 0.03, decay: 0.12, gain: 0.1, filter: { type: 'bandpass', frequency: 3000, q: 1 } });
  return end;
}

/** Wing-beat flutter: per bird one band-passed noise source gated by ~8 Hz pulses that decay over the duration. */
function playFlutter(ctx: AudioContext, dest: AudioNode, t0: number, birds: number, rand: () => number): number {
  let latest = t0;
  for (let b = 0; b < birds; b++) {
    const start = t0 + randRange(rand, 0, 0.15);
    const rate = FLAP_RATE_HZ * randRange(rand, 0.85, 1.15);
    const dur = FLAP_DURATION_S * randRange(rand, 0.85, 1.2);
    const pulses = Math.max(1, Math.floor(dur * rate));
    const end = start + dur + 0.1;
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 1, 'white');
    src.loop = true;
    src.playbackRate.value = randRange(rand, 0.9, 1.1);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = randRange(rand, 600, 1100);
    bp.Q.value = 1.2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    for (let i = 0; i < pulses; i++) {
      const tp = start + i / rate;
      const amp = (FLAP_LEVEL / Math.sqrt(birds)) * Math.pow(1 - i / pulses, 1.5);
      env.gain.linearRampToValueAtTime(amp, tp + 0.012);
      env.gain.linearRampToValueAtTime(0, tp + 0.07);
    }
    src.connect(bp);
    bp.connect(env);
    env.connect(dest);
    src.start(start, rand());
    src.stop(end);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      env.disconnect();
    };
    latest = Math.max(latest, end);
  }
  return latest;
}

// ---------------------------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------------------------
type ShotKind = 'song' | 'ambient' | 'wing' | 'bark' | 'meow';

interface Shot {
  kind: ShotKind;
  emitter: Emitter;
  /** Context time after which the shot is over. */
  end: number;
  dogId?: number;
  cleanup?: Disposer;
}

export interface AnimalOptions {
  /** Random source; inject a stub in tests. */
  rand?: () => number;
}

export function createAnimalSoundsWith(ctx: AudioContext, bus: AudioBus, opts: AnimalOptions = {}): SoundSystem {
  const rand = opts.rand ?? createRandom();
  const shots: Shot[] = [];
  const dogs = new Map<number, { timer: number }>();
  const activeBark = new Map<number, Shot>();
  let ambientTimer = -1;

  const exp = (mean: number) => -Math.log(1 - Math.min(0.999999, rand())) * mean;
  const count = (kind: ShotKind) => {
    let n = 0;
    for (const s of shots) if (s.kind === kind) n++;
    return n;
  };

  const release = (s: Shot) => {
    s.cleanup?.();
    s.emitter.dispose();
    if (s.dogId !== undefined && activeBark.get(s.dogId) === s) activeBark.delete(s.dogId);
  };

  const spawnSong = (kind: 'song' | 'ambient', species: BirdSpecies, x: number, z: number) => {
    const emitter = bus.createEmitter({ category: 'bird', x, y: BIRD_Y, z, refDistance: BIRD_REF_M, maxDistance: BIRD_MAX_M, rolloff: 1.2 });
    const song = composeSong(species, rand);
    const t0 = ctx.currentTime + 0.03;
    const cleanup = playSong(ctx, emitter.input, t0, song, BIRD_LEVEL);
    shots.push({ kind, emitter, end: t0 + song.duration + 0.3, cleanup });
  };

  const nextBark = (mean: number) => Math.max(2, exp(mean));

  function update(frame: AudioFrame): void {
    const dt = Number.isFinite(frame.dt) ? Math.min(MAX_DT, Math.max(0, frame.dt)) : 0;
    const now = ctx.currentTime;
    const l = frame.listener;

    for (let i = shots.length - 1; i >= 0; i--) {
      if (shots[i].end < now) {
        release(shots[i]);
        shots.splice(i, 1);
      }
    }

    const activity = birdActivity(frame.timeOfDay, frame.season, frame.rain);
    const owl = owlChance(frame.night, frame.season, frame.rain);

    // Events
    for (const ev of frame.lifeEvents) {
      if (!Number.isFinite(ev.x) || !Number.isFinite(ev.z)) continue;
      if (ev.type === 'bird-call') {
        if (count('song') >= MAX_EVENT_SONGS) continue;
        if (frame.night) {
          if (rand() < owl) spawnSong('song', 'owl', ev.x, ev.z);
        } else if (rand() < clamp01(activity * 1.5)) {
          spawnSong('song', pickSpecies(rand, frame.timeOfDay), ev.x, ev.z);
        }
      } else if (ev.type === 'pigeon-scatter') {
        if (count('wing') >= MAX_FLAPS) continue;
        const emitter = bus.createEmitter({ category: 'wing', x: ev.x, y: 3, z: ev.z, refDistance: 6, maxDistance: 120 });
        const birds = FLAP_BIRDS_MIN + Math.floor(rand() * (FLAP_BIRDS_MAX - FLAP_BIRDS_MIN + 1));
        const end = playFlutter(ctx, emitter.input, now + 0.02, birds, rand);
        shots.push({ kind: 'wing', emitter, end: end + 0.1 });
      } else if (ev.type === 'cat-meow') {
        if (count('meow') >= MAX_MEOWS) continue;
        const emitter = bus.createEmitter({ category: 'cat', x: ev.x, y: 0.5, z: ev.z, refDistance: 3, maxDistance: 80 });
        const end = playMeow(ctx, emitter.input, now + 0.02, rand);
        shots.push({ kind: 'meow', emitter, end: end + 0.1 });
      }
    }

    // Ambient trickle of distant songs (owl hoots at night)
    const rate = frame.night ? owl : activity;
    if (rate > 0.03) {
      if (ambientTimer < 0) ambientTimer = exp(frame.night ? OWL_MEAN_S / rate : AMBIENT_MEAN_S / rate);
      ambientTimer -= dt;
      if (ambientTimer <= 0) {
        if (count('ambient') < MAX_AMBIENT_SONGS) {
          const ang = rand() * Math.PI * 2;
          const r = randRange(rand, AMBIENT_MIN_M, AMBIENT_MAX_M);
          spawnSong('ambient', frame.night ? 'owl' : pickSpecies(rand, frame.timeOfDay), l.x + Math.cos(ang) * r, l.z + Math.sin(ang) * r);
        }
        ambientTimer = exp(frame.night ? OWL_MEAN_S / rate : AMBIENT_MEAN_S / rate);
      }
    } else {
      ambientTimer = -1;
    }

    // Dogs
    const seen = new Set<number>();
    for (const p of frame.pedestrians) {
      const d = p.dog;
      if (!d) continue;
      seen.add(p.id);
      const active = activeBark.get(p.id);
      if (active) active.emitter.setPosition(d.x, 0.6, d.z);
      const dist = Math.hypot(d.x - l.x, d.z - l.z);
      if (!(dist <= DOG_RANGE_M)) continue; // cheap range gate: far dogs do not tick
      let st = dogs.get(p.id);
      if (!st) {
        st = { timer: nextBark(DOG_MEAN_S) };
        dogs.set(p.id, st);
      }
      st.timer -= dt;
      if (st.timer > 0) continue;
      if (count('bark') >= MAX_BARKERS || active) {
        st.timer = 3 + rand() * 4;
        continue;
      }
      const emitter = bus.createEmitter({ category: 'dog', x: d.x, y: 0.6, z: d.z, refDistance: 4, maxDistance: 160 });
      const voice = dogVoice(p.id);
      const barks = 2 + Math.floor(rand() * 3);
      const end = playBarks(ctx, emitter.input, now + 0.02, voice, barks, rand);
      const shot: Shot = { kind: 'bark', emitter, end: end + 0.1, dogId: p.id };
      shots.push(shot);
      activeBark.set(p.id, shot);
      let mean = DOG_MEAN_S;
      for (const v of frame.vehicles) {
        if (v.speed > DOG_VEHICLE_SPEED && Math.hypot(v.x - d.x, v.z - d.z) < DOG_VEHICLE_M) {
          mean *= 0.5;
          break;
        }
      }
      st.timer = nextBark(mean);
    }
    for (const id of [...dogs.keys()]) if (!seen.has(id)) dogs.delete(id);
  }

  return {
    name: 'animals',
    update,
    dispose() {
      for (const s of shots) release(s);
      shots.length = 0;
      activeBark.clear();
      dogs.clear();
    },
  };
}

export const createAnimalSounds: SoundSystemFactory = (ctx, bus) => createAnimalSoundsWith(ctx, bus);
