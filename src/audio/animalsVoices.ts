// Animal sounds: voice builders (songs, barks, meows, wing flutter). Split from animals.ts.

import { makeNoiseBuffer, playNoiseBurst, randRange } from './synth';
import { FLAP_RATE_HZ, FLAP_DURATION_S, FLAP_LEVEL, DOG_LEVEL, BARK_BOOST, MEOW_LEVEL } from './animalsPure';
import type { DogVoice, NoteSpec, Song } from './animalsPure';

// ---------------------------------------------------------------------------------------------
// Voice builders
// ---------------------------------------------------------------------------------------------
export type Disposer = () => void;

/** One enveloped oscillator note with optional vibrato; disconnects itself when it ends. */
export function playNote(ctx: AudioContext, dest: AudioNode, t0: number, n: NoteSpec): void {
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
export function playSong(ctx: AudioContext, dest: AudioNode, t0: number, song: Song, level: number): Disposer {
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
export let gritCurve: Float32Array | null = null;
export function makeGrit(): Float32Array {
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
export function playBarks(ctx: AudioContext, dest: AudioNode, t0: number, v: DogVoice, count: number, rand: () => number): number {
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
export function playMeow(ctx: AudioContext, dest: AudioNode, t0: number, rand: () => number): number {
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
export function playFlutter(ctx: AudioContext, dest: AudioNode, t0: number, birds: number, rand: () => number): number {
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
