// Generative music: mood by clock, fades, chord and melody scheduling (pure, no Web Audio). Split from music.ts.


export type Mood = 'day' | 'golden' | 'night';
export const MOODS: readonly Mood[] = ['day', 'golden', 'night'];

export const FADE_SECONDS = 2;
export const SCHEDULE_AHEAD = 1.2;
export const MOOD_ACTIVE_WEIGHT = 0.02;

// ---- Mood by time of day (pure) -------------------------------------------------------------------

export type Weights = Record<Mood, number>;

/** Keyframes around the clock: hour -> dominant mood. Blends linearly (smoothstepped) between keys. */
export const MOOD_KEYS: { h: number; m: Mood }[] = [
  { h: 0, m: 'night' },
  { h: 5, m: 'night' },
  { h: 6.5, m: 'golden' }, // dawn is warm
  { h: 8.5, m: 'day' },
  { h: 15.5, m: 'day' },
  { h: 17, m: 'golden' },
  { h: 19, m: 'golden' },
  { h: 21, m: 'night' },
  { h: 24, m: 'night' },
];

export const smooth01 = (t: number) => t * t * (3 - 2 * t);

/** Blend weights (sum 1) of the three moods at clock hour `hour` (wraps). */
export function moodWeights(hour: number): Weights {
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
  const w: Weights = { day: 0, golden: 0, night: 0 };
  for (let i = 0; i < MOOD_KEYS.length - 1; i++) {
    const a = MOOD_KEYS[i];
    const b = MOOD_KEYS[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = b.h === a.h ? 0 : smooth01((h - a.h) / (b.h - a.h));
      w[a.m] += 1 - t;
      w[b.m] += t;
      return w;
    }
  }
  w.day = 1;
  return w;
}

/** The mood with the largest weight at `hour`. */
export function moodForTime(hour: number): Mood {
  const w = moodWeights(hour);
  return MOODS.reduce((best, m) => (w[m] > w[best] ? m : best), 'day' as Mood);
}

/** Linear fade step toward target (0 or 1) taking FADE_SECONDS for a full swing. Pure. */
export function fadeStep(current: number, target: number, dt: number, seconds = FADE_SECONDS): number {
  const step = Math.max(0, dt) / Math.max(1e-3, seconds);
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/** Gain curve for a linear fade value (smoothstep: no click at either end). */
export function fadeCurve(f: number): number {
  return smooth01(Math.min(1, Math.max(0, f)));
}

// ---- Musical material ------------------------------------------------------------------------------

export interface Chord {
  /** Root offset from the mood key, semitones. */
  root: number;
  /** Chord tones above the root, semitones. */
  tones: number[];
}

export interface MoodParams {
  bpm: number;
  rootMidi: number;
  chords: Chord[];
  /** Markov transition weights: next[from][to]. */
  next: number[][];
  scale: number[];
  /** Beats (eighth-note steps / 2) per chord. */
  chordBeats: number;
  /** Probability of a melody note on each eighth-note step. */
  noteProb: number;
  melody: 'pluck' | 'piano' | 'bell';
  padGain: number;
  bassGain: number;
  melodyGain: number;
}

export const PARAMS: Record<Mood, MoodParams> = {
  day: {
    bpm: 72,
    rootMidi: 60, // C4
    chords: [
      { root: 0, tones: [0, 4, 7, 14] }, // I add9
      { root: 9, tones: [0, 3, 7, 10] }, // vi7
      { root: 5, tones: [0, 4, 7, 14] }, // IV add9
      { root: 7, tones: [0, 4, 7] }, // V
      { root: 2, tones: [0, 3, 7, 10] }, // ii7
    ],
    next: [
      [0.1, 0.3, 0.3, 0.2, 0.1],
      [0.1, 0.05, 0.4, 0.15, 0.3],
      [0.35, 0.1, 0.05, 0.4, 0.1],
      [0.5, 0.2, 0.2, 0.05, 0.05],
      [0.1, 0.1, 0.1, 0.6, 0.1],
    ],
    scale: [0, 2, 4, 7, 9], // major pentatonic
    chordBeats: 8,
    noteProb: 0.42,
    melody: 'pluck',
    padGain: 0.055,
    bassGain: 0,
    melodyGain: 0.2,
  },
  golden: {
    bpm: 54,
    rootMidi: 53, // F3
    chords: [
      { root: 0, tones: [0, 4, 7, 11] }, // Imaj7
      { root: 5, tones: [0, 4, 7, 11] }, // IVmaj7
      { root: 0, tones: [0, 2, 7, 14] }, // Isus2
      { root: 4, tones: [0, 3, 7, 10] }, // iii7
      { root: 7, tones: [0, 5, 7, 10] }, // V7sus4
      { root: 9, tones: [0, 3, 7, 10] }, // vi7
    ],
    next: [
      [0.05, 0.3, 0.15, 0.1, 0.2, 0.2],
      [0.3, 0.05, 0.1, 0.2, 0.15, 0.2],
      [0.25, 0.25, 0.05, 0.1, 0.25, 0.1],
      [0.15, 0.3, 0.05, 0.05, 0.1, 0.35],
      [0.45, 0.1, 0.2, 0.05, 0.05, 0.15],
      [0.2, 0.35, 0.1, 0.15, 0.15, 0.05],
    ],
    scale: [0, 2, 4, 7, 9, 11], // major with the 7th
    chordBeats: 8,
    noteProb: 0.2,
    melody: 'piano',
    padGain: 0.06,
    bassGain: 0.07,
    melodyGain: 0.2,
  },
  night: {
    bpm: 38,
    rootMidi: 50, // D3
    chords: [
      { root: 0, tones: [0, 3, 7, 10] }, // i7
      { root: 3, tones: [0, 4, 7, 11] }, // IIImaj7
      { root: 5, tones: [0, 4, 7, 10] }, // IV7 (the Dorian chord)
      { root: 10, tones: [0, 4, 7] }, // VII
      { root: 7, tones: [0, 3, 7, 10] }, // v7
    ],
    next: [
      [0.15, 0.2, 0.3, 0.25, 0.1],
      [0.35, 0.05, 0.2, 0.25, 0.15],
      [0.4, 0.15, 0.05, 0.25, 0.15],
      [0.45, 0.25, 0.1, 0.05, 0.15],
      [0.5, 0.15, 0.2, 0.1, 0.05],
    ],
    scale: [0, 3, 5, 7, 10], // minor pentatonic (Dorian colour)
    chordBeats: 8,
    noteProb: 0.12,
    melody: 'bell',
    padGain: 0.07,
    bassGain: 0.1,
    melodyGain: 0.17,
  },
};

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Markov step: next chord index from chord `from` in mood `mood`, using u in [0,1). */
export function nextChord(mood: Mood, from: number, u: number): number {
  const row = PARAMS[mood].next[Math.min(Math.max(0, from), PARAMS[mood].next.length - 1)];
  let sum = 0;
  for (const w of row) sum += w;
  let x = Math.min(0.999999, Math.max(0, u)) * sum;
  for (let i = 0; i < row.length; i++) {
    x -= row[i];
    if (x < 0) return i;
  }
  return row.length - 1;
}

export type MusicVoice = 'pad' | 'bass' | 'pluck' | 'piano' | 'bell';

export interface MusicEvent {
  voice: MusicVoice;
  mood: Mood;
  /** Start time on the AudioContext clock. */
  time: number;
  freq: number;
  /** Nominal length in seconds (release tail comes on top). */
  duration: number;
  /** 0..1 */
  velocity: number;
}

/** Look-ahead scheduler of one mood. Pure aside from the injected random: unit tested without Web Audio. */
export class MoodScheduler {
  private nextStep = -1;
  private step = 0;
  private chord = 0;
  private melodyPos = 3;
  private readonly p: MoodParams;

  constructor(readonly mood: Mood, private readonly rand: () => number = Math.random) {
    this.p = PARAMS[mood];
    this.chord = Math.floor(rand() * this.p.chords.length);
  }

  get chordIndex(): number {
    return this.chord;
  }

  /** Call when the mood becomes audible again after being skipped: restart on a fresh chord at `now`. */
  resume(now: number): void {
    this.nextStep = now + 0.05;
    this.step = 0;
  }

  /** Events for the window [now, now + ahead). Every returned time is >= now. */
  advance(now: number, ahead = SCHEDULE_AHEAD): MusicEvent[] {
    const out: MusicEvent[] = [];
    const eighth = 60 / this.p.bpm / 2;
    if (this.nextStep < 0 || this.nextStep < now - 0.5) this.resume(now);
    const stepsPerChord = this.p.chordBeats * 2;
    let guard = 0;
    while (this.nextStep < now + ahead && guard++ < 64) {
      const t = Math.max(now, this.nextStep);
      if (this.step % stepsPerChord === 0) this.startChord(t, eighth * stepsPerChord, out);
      else if (this.rand() < this.p.noteProb) this.melodyNote(t, eighth, out);
      this.nextStep += eighth;
      this.step++;
    }
    return out;
  }

  private startChord(t: number, len: number, out: MusicEvent[]): void {
    const first = this.step === 0 && this.nextStep >= 0;
    if (!first || this.rand() < 0.5) this.chord = nextChord(this.mood, this.chord, this.rand());
    const c = this.p.chords[this.chord];
    const base = this.p.rootMidi + c.root;
    // Pad: the chord tones, spread slightly in time for a gentle bloom; long overlapping envelopes.
    c.tones.forEach((tone, i) => {
      out.push({
        voice: 'pad', mood: this.mood, time: t + i * 0.12, freq: midiToHz(base + tone),
        duration: len, velocity: this.p.padGain / 0.06 * (0.85 + this.rand() * 0.15),
      });
    });
    if (this.p.bassGain > 0) {
      out.push({
        voice: 'bass', mood: this.mood, time: t, freq: midiToHz(base - 12),
        duration: len, velocity: this.p.bassGain / 0.08,
      });
    }
  }

  private melodyNote(t: number, eighth: number, out: MusicEvent[]): void {
    const scale = this.p.scale;
    const span = scale.length * 2;
    // Mostly a gentle random walk on the scale, with the odd leap, so phrases wander without looping.
    const r = this.rand();
    const move = r < 0.3 ? 0 : r < 0.65 ? 1 : r < 0.9 ? -1 : (this.rand() < 0.5 ? 3 : -3);
    this.melodyPos = Math.min(span - 1, Math.max(0, this.melodyPos + move));
    const oct = Math.floor(this.melodyPos / scale.length);
    const semis = scale[this.melodyPos % scale.length] + 12 * oct + 12;
    const midi = this.p.rootMidi + semis + (this.mood === 'night' ? 12 : 0);
    const voice: MusicVoice = this.p.melody;
    out.push({
      voice, mood: this.mood,
      time: t + this.rand() * 0.015,
      freq: midiToHz(midi),
      duration: voice === 'bell' ? eighth * 6 : voice === 'piano' ? eighth * 4 : eighth * 2,
      velocity: (0.5 + this.rand() * 0.5) * (this.p.melodyGain / 0.2),
    });
  }
}
