// Generative music: Web Audio voices and reverb impulse. Split from music.ts.

import type { MusicEvent } from './musicMood';

// ---- Voices (Web Audio) ----------------------------------------------------------------------------

export function env(g: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): number {
  const end = t + attack + hold + release;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  if (hold > 0) g.setValueAtTime(Math.max(0.0002, peak), t + attack + hold);
  g.exponentialRampToValueAtTime(0.0001, end);
  return end;
}

export interface PartialSpec {
  ratio: number;
  gain: number;
  decay: number;
  type?: OscillatorType;
}

export const PARTIALS: Record<'pluck' | 'piano' | 'bell', PartialSpec[]> = {
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
