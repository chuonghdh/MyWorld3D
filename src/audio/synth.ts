// Shared synthesis primitives. No audio files: everything is noise buffers, oscillators and envelopes.
// One-shot helpers disconnect all their nodes when the source ends.

export type NoiseKind = 'white' | 'pink' | 'brown';

const noiseCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Mono noise buffer, cached per context, seconds and kind. Do not mutate the returned data. */
export function makeNoiseBuffer(ctx: BaseAudioContext, seconds: number, kind: NoiseKind = 'white'): AudioBuffer {
  let perCtx = noiseCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    noiseCache.set(ctx, perCtx);
  }
  const key = `${kind}:${seconds}`;
  const hit = perCtx.get(key);
  if (hit) return hit;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (kind === 'white') {
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet economy filter.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
  }
  perCtx.set(key, buf);
  return buf;
}

/** Deterministic generator (mulberry32) when a seed is given, Math.random otherwise. */
export function createRandom(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rand: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rand();
}

export interface LoopingNoise {
  source: AudioBufferSourceNode;
  stop(): void;
}

/** Endless noise loop at a random offset and slightly random rate, connected to dest. */
export function startLoopingNoise(ctx: BaseAudioContext, dest: AudioNode, kind: NoiseKind = 'white', seconds = 2): LoopingNoise {
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, seconds, kind);
  src.loop = true;
  src.playbackRate.value = 0.95 + Math.random() * 0.1;
  src.connect(dest);
  src.start(0, Math.random() * seconds);
  return {
    source: src,
    stop() {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    },
  };
}

export interface FilterSpec {
  type: BiquadFilterType;
  frequency: number;
  /** Optional end frequency (exponential sweep over the burst). */
  frequencyEnd?: number;
  q?: number;
}

export interface BurstOptions {
  kind?: NoiseKind;
  /** Start time on the context clock; default now. */
  when?: number;
  attack?: number;
  /** Seconds from the end of the attack to silence. */
  decay: number;
  gain?: number;
  filter?: FilterSpec;
  playbackRate?: number;
}

/** One enveloped noise burst (click, step, drop, puff). Cleans up when it ends. */
export function playNoiseBurst(ctx: BaseAudioContext, dest: AudioNode, o: BurstOptions): AudioBufferSourceNode {
  const t = o.when ?? ctx.currentTime;
  const attack = Math.max(0.001, o.attack ?? 0.005);
  const end = t + attack + o.decay;
  const src = ctx.createBufferSource();
  src.buffer = makeNoiseBuffer(ctx, 1, o.kind ?? 'white');
  src.playbackRate.value = o.playbackRate ?? 1;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.gain ?? 1, t + attack);
  env.gain.linearRampToValueAtTime(0, end);
  let filt: BiquadFilterNode | null = null;
  if (o.filter) {
    filt = ctx.createBiquadFilter();
    filt.type = o.filter.type;
    filt.frequency.setValueAtTime(o.filter.frequency, t);
    if (o.filter.frequencyEnd) filt.frequency.exponentialRampToValueAtTime(Math.max(10, o.filter.frequencyEnd), end);
    if (o.filter.q !== undefined) filt.Q.value = o.filter.q;
    src.connect(filt);
    filt.connect(env);
  } else {
    src.connect(env);
  }
  env.connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(end + 0.02);
  src.onended = () => {
    src.disconnect();
    filt?.disconnect();
    env.disconnect();
  };
  return src;
}

export interface ToneOptions {
  type?: OscillatorType;
  frequency: number;
  /** Optional end frequency (exponential glide over the tone). */
  frequencyEnd?: number;
  when?: number;
  attack?: number;
  /** Hold time at peak after the attack. */
  sustain?: number;
  /** Seconds from the end of sustain to silence. */
  decay: number;
  gain?: number;
  filter?: FilterSpec;
}

/** One enveloped oscillator tone (chirp, beep, bell partial). Cleans up when it ends. */
export function playTone(ctx: BaseAudioContext, dest: AudioNode, o: ToneOptions): OscillatorNode {
  const t = o.when ?? ctx.currentTime;
  const attack = Math.max(0.001, o.attack ?? 0.005);
  const sustain = o.sustain ?? 0;
  const peak = o.gain ?? 1;
  const end = t + attack + sustain + o.decay;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.frequency, t);
  if (o.frequencyEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.frequencyEnd), end);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + attack);
  if (sustain > 0) env.gain.setValueAtTime(peak, t + attack + sustain);
  env.gain.linearRampToValueAtTime(0, end);
  let filt: BiquadFilterNode | null = null;
  if (o.filter) {
    filt = ctx.createBiquadFilter();
    filt.type = o.filter.type;
    filt.frequency.value = o.filter.frequency;
    if (o.filter.q !== undefined) filt.Q.value = o.filter.q;
    osc.connect(filt);
    filt.connect(env);
  } else {
    osc.connect(env);
  }
  env.connect(dest);
  osc.start(t);
  osc.stop(end + 0.02);
  osc.onended = () => {
    osc.disconnect();
    filt?.disconnect();
    env.disconnect();
  };
  return osc;
}
