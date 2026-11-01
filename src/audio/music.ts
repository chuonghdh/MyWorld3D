// Generative ambient music, synthesised with Web Audio (no samples). Not positional: everything feeds
// the bus 'music' category. Off by default; frame.musicEnabled fades it in/out over 2 s.
//
// Three moods follow the time of day and crossfade smoothly:
//   day    (~72 bpm) C major pentatonic, kalimba/marimba plucks over a warm pad
//   golden (~54 bpm) F major, maj7 / sus chords, soft pad and sparse piano-like tones
//   night  (~38 bpm) D Dorian, deep pad with slow filter motion, sparse bells, long echo/reverb
// Each mood owns a MoodScheduler: a Markov chord chain plus a random-walk melody, emitting MusicEvents
// a short look-ahead before they sound (never in the past). The graph is built lazily on first enable.

import type { SoundSystem, SoundSystemFactory, AudioFrame } from './frame';
import { createRandom } from './synth';
import { audio as audioTuning } from '../config/tuning';

export type Mood = 'day' | 'golden' | 'night';
export const MOODS: readonly Mood[] = ['day', 'golden', 'night'];

export const FADE_SECONDS = 2;
export const SCHEDULE_AHEAD = 1.2;
const MOOD_ACTIVE_WEIGHT = 0.02;

// ---- Mood by time of day (pure) -------------------------------------------------------------------

type Weights = Record<Mood, number>;

/** Keyframes around the clock: hour -> dominant mood. Blends linearly (smoothstepped) between keys. */
const MOOD_KEYS: { h: number; m: Mood }[] = [
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

const smooth01 = (t: number) => t * t * (3 - 2 * t);

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

interface Chord {
  /** Root offset from the mood key, semitones. */
  root: number;
  /** Chord tones above the root, semitones. */
  tones: number[];
}

interface MoodParams {
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

const PARAMS: Record<Mood, MoodParams> = {
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

// ---- Voices (Web Audio) ----------------------------------------------------------------------------

function env(g: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): number {
  const end = t + attack + hold + release;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (hold > 0) g.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, end);
  return end;
}

interface PartialSpec {
  ratio: number;
  gain: number;
  decay: number;
  type?: OscillatorType;
}

const PARTIALS: Record<'pluck' | 'piano' | 'bell', PartialSpec[]> = {
  // Kalimba / marimba: sine fundamental plus a short, inharmonic upper partial.
  pluck: [
    { ratio: 1, gain: 1, decay: 0.9 },
    { ratio: 4, gain: 0.28, decay: 0.12 },
    { ratio: 9.2, gain: 0.06, decay: 0.05 },
  ],
  // Soft piano: triangle body plus 2nd/3rd harmonic that die quickly.
  piano: [
    { ratio: 1, gain: 1, decay: 2.4, type: 'triangle' },
    { ratio: 2, gain: 0.3, decay: 1.2 },
    { ratio: 3, gain: 0.1, decay: 0.6 },
  ],
  // Bell: classic inharmonic ratios, long decay.
  bell: [
    { ratio: 1, gain: 1, decay: 5.5 },
    { ratio: 2.76, gain: 0.35, decay: 3.2 },
    { ratio: 5.4, gain: 0.15, decay: 1.6 },
    { ratio: 8.93, gain: 0.06, decay: 0.8 },
  ],
};

/** Starts the oscillators for one event into `dest`. All nodes disconnect themselves when finished. */
export function playMusicEvent(ctx: AudioContext, dest: AudioNode, e: MusicEvent): void {
  const t = Math.max(e.time, ctx.currentTime);
  const nodes: AudioNode[] = [];
  const oscs: OscillatorNode[] = [];
  let end = t;

  const done = () => {
    for (const n of nodes) n.disconnect();
  };

  if (e.voice === 'pad' || e.voice === 'bass') {
    const isBass = e.voice === 'bass';
    // Two detuned oscillators through a lowpass whose cutoff drifts slowly over the note.
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.4;
    const open = (isBass ? 260 : e.mood === 'night' ? 520 : e.mood === 'golden' ? 900 : 1500) * (0.9 + e.velocity * 0.1);
    lp.frequency.setValueAtTime(open * 0.45, t);
    lp.frequency.linearRampToValueAtTime(open, t + e.duration * 0.5);
    lp.frequency.linearRampToValueAtTime(open * 0.5, t + e.duration + 2.5);
    const attack = isBass ? 1.5 : 2.2;
    const peak = (isBass ? 0.9 : 0.6) * e.velocity * 0.1;
    end = env(out.gain, t, Math.max(0.0005, peak), attack, Math.max(0, e.duration - attack), 2.8);
    lp.connect(out);
    out.connect(dest);
    nodes.push(out, lp);
    for (const det of isBass ? [0] : [-6, 7]) {
      const o = ctx.createOscillator();
      o.type = isBass ? 'sine' : 'sawtooth';
      o.frequency.value = e.freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.05);
      oscs.push(o);
      nodes.push(o);
    }
  } else {
    const partials = PARTIALS[e.voice];
    const out = ctx.createGain();
    out.connect(dest);
    nodes.push(out);
    const tone = e.voice === 'piano' ? ctx.createBiquadFilter() : null;
    if (tone) {
      tone.type = 'lowpass';
      tone.frequency.value = 2400 + 1200 * e.velocity;
      tone.Q.value = 0.3;
      tone.connect(out);
      nodes.push(tone);
    }
    const stretch = e.voice === 'bell' ? Math.min(1.4, e.duration / 3) : 1;
    for (const p of partials) {
      if (e.freq * p.ratio > 14000) continue;
      const o = ctx.createOscillator();
      o.type = p.type ?? 'sine';
      o.frequency.value = e.freq * p.ratio;
      const g = ctx.createGain();
      const pe = env(g.gain, t, p.gain * e.velocity * 0.3, 0.004, 0, p.decay * stretch);
      o.connect(g);
      g.connect(tone ?? out);
      o.start(t);
      o.stop(pe + 0.05);
      oscs.push(o);
      nodes.push(o, g);
      end = Math.max(end, pe);
    }
  }
  // Disconnect everything when the last oscillator ends.
  let left = oscs.length;
  for (const o of oscs) {
    o.onended = () => {
      if (--left <= 0) done();
    };
  }
}

/** Decorrelated stereo impulse with an exponential tail, darkened by a one-pole lowpass. Cheap (once). */
export function makeImpulse(ctx: BaseAudioContext, seconds = 2.4, decay = 3.2, rand: () => number = Math.random): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += 0.45 * ((rand() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, decay) * (i < 64 ? i / 64 : 1);
    }
  }
  return buf;
}

// ---- The sound system -------------------------------------------------------------------------------

const MOOD_SEND: Record<Mood, { reverb: number; delay: number }> = {
  day: { reverb: 0.25, delay: 0.18 },
  golden: { reverb: 0.4, delay: 0.25 },
  night: { reverb: 0.7, delay: 0.4 },
};
const MUSIC_LEVEL = audioTuning.musicLevel;
const DUCK_LEVEL = audioTuning.duckLevel;

export interface MusicSystem extends SoundSystem {
  /** Current linear fade value 0..1 (for tests / debugging). */
  readonly fade: number;
  readonly graphBuilt: boolean;
}

export function createMusicSystem(
  ctx: AudioContext,
  dest: AudioNode,
  rand: () => number = createRandom(),
): MusicSystem {
  let fade = 0;
  let duck = 1;
  let built = false;
  let master: GainNode;
  const moodGain = {} as Record<Mood, GainNode>;
  const extra: AudioNode[] = [];
  const sched = {
    day: new MoodScheduler('day', rand),
    golden: new MoodScheduler('golden', rand),
    night: new MoodScheduler('night', rand),
  };
  const active: Record<Mood, boolean> = { day: false, golden: false, night: false };

  function build(): void {
    built = true;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(dest);
    const mix = ctx.createGain();
    mix.connect(master);

    // Space: convolution reverb (generated impulse) and a dark feedback echo.
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, 2.4, 3.2, rand);
    const revReturn = ctx.createGain();
    revReturn.gain.value = 0.9;
    conv.connect(revReturn);
    revReturn.connect(mix);

    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.46;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const fbLp = ctx.createBiquadFilter();
    fbLp.type = 'lowpass';
    fbLp.frequency.value = 1800;
    const delayReturn = ctx.createGain();
    delayReturn.gain.value = 0.7;
    delay.connect(fbLp);
    fbLp.connect(fb);
    fb.connect(delay);
    fbLp.connect(delayReturn);
    delayReturn.connect(mix);
    extra.push(mix, conv, revReturn, delay, fb, fbLp, delayReturn);

    for (const m of MOODS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(mix);
      const rs = ctx.createGain();
      rs.gain.value = MOOD_SEND[m].reverb;
      g.connect(rs);
      rs.connect(conv);
      const ds = ctx.createGain();
      ds.gain.value = MOOD_SEND[m].delay;
      g.connect(ds);
      ds.connect(delay);
      moodGain[m] = g;
      extra.push(g, rs, ds);
    }
  }

  return {
    name: 'music',
    get fade() {
      return fade;
    },
    get graphBuilt() {
      return built;
    },
    update(frame: AudioFrame) {
      const dt = Number.isFinite(frame.dt) ? Math.min(0.5, Math.max(0, frame.dt)) : 0.016;
      fade = fadeStep(fade, frame.musicEnabled ? 1 : 0, dt);
      if (!built) {
        if (fade <= 0) return;
        build();
      }
      const now = ctx.currentTime;
      // Thunder ducks the music a little for a few seconds.
      duck = frame.thunder.length ? DUCK_LEVEL : Math.min(1, duck + dt / 3);
      master.gain.setTargetAtTime(fadeCurve(fade) * MUSIC_LEVEL * duck, now, 0.05);
      if (fade <= 0) {
        for (const m of MOODS) active[m] = false;
        return; // fully faded out: schedule nothing, CPU idle
      }

      const w = moodWeights(frame.timeOfDay);
      for (const m of MOODS) {
        moodGain[m].gain.setTargetAtTime(w[m], now, 1.2);
        const on = w[m] > MOOD_ACTIVE_WEIGHT;
        if (on && !active[m]) sched[m].resume(now);
        active[m] = on;
        if (!on) continue;
        for (const e of sched[m].advance(now)) playMusicEvent(ctx, moodGain[m], e);
      }
    },
    dispose() {
      if (!built) return;
      try {
        master.gain.value = 0;
      } catch {
        /* ignore */
      }
      master.disconnect();
      for (const n of extra) n.disconnect();
    },
  };
}

export const createMusic: SoundSystemFactory = (ctx, bus): SoundSystem => createMusicSystem(ctx, bus.category('music'));
