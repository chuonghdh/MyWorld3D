// People sounds: murmured conversation, footsteps and rain drumming on umbrellas. Every sound belongs to one
// pedestrian (ids are stable), has its own emitter at that pedestrian and follows them every frame.
//
// Pose: src/traffic/pedestrians.ts defines POSE_WALK = 0, POSE_STAND = 1, POSE_CHAT = 2, POSE_SIT = 3. The frame
// type declares `pose: string`, but the scene passes the numeric pose (as a number or a numeric string); both
// numbers, numeric strings and the names 'walk' | 'stand' | 'chat' | 'sit' are accepted (see poseKind).
//
//  talking    speech-like murmur, no words: a sawtooth glottal source at the speaker's pitch (men 90-130 Hz, women
//             and children 190-250 Hz, chosen by id) through three parallel formant band-passes (vowel F1/F2/F3
//             scaled by vocal tract length), a little breath noise and an occasional fricative burst. Syllables of
//             about 0.7/rate seconds at 3-5 Hz in phrases of 3-7 syllables separated by pauses. Category 'voice'.
//  footsteps  heel strike per step: a short noise tick plus a low thud on dry pavement; lowpassed wetter tap with
//             a splash hiss when frame.rain > 0.1. Steps per second follow speed; the emitter alternates 10 cm to the
//             left and right of the walking line. Category 'footstep'.
//  umbrella   rain on a taut canopy: a looped buffer of sparse random drop impulses through a drum resonance and a
//             bright patter band; density and level follow frame.rain. Category 'rain' (so the rain volume slider
//             controls it; it only exists while it rains).
// Tuned from acoustics knowledge, not by ear.

import type { AudioBus, Emitter } from './bus';
import { VoiceBudget, type VoiceCandidate } from './bus';
import type { AudioFrame, AudioPedestrian, SoundSystem, SoundSystemFactory } from './frame';
import { clamp01 } from './math';
import { createRandom, playNoiseBurst, playTone, startLoopingNoise, type LoopingNoise } from './synth';

export const POSE_WALK = 0;
export const POSE_STAND = 1;
export const POSE_CHAT = 2;
export const POSE_SIT = 3;

export const CHAT_VOICES = 4;
export const STEP_VOICES = 5;
export const UMBRELLA_VOICES = 4;
const CHAT_MAX_DISTANCE = 30;
const STEP_MAX_DISTANCE = 28;
const UMBRELLA_MAX_DISTANCE = 25;
export const RAIN_ON = 0.15;
export const RAIN_OFF = 0.1;
export const WET_STEP_RAIN = 0.1;
const FADE_TC = 0.06;
const FADE_OUT_S = 0.4;
/** Ear / mouth height used for emitters (m). */
const MOUTH_Y = 1.6;

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
const VOWELS: readonly (readonly [number, number, number])[] = [
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

function setTarget(ctx: BaseAudioContext, p: AudioParam, v: number, tc: number): void {
  if (!Number.isFinite(v)) return;
  if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, ctx.currentTime, tc);
  else p.value = v;
}

interface Voice {
  endTime: number;
  release(): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------------------------------------
// Chat voice

class ChatVoice implements Voice {
  endTime = 0;
  readonly emitter: Emitter;
  readonly speaker: Speaker;
  private readonly out: GainNode;
  private readonly osc: OscillatorNode;
  private readonly bps: BiquadFilterNode[] = [];
  private readonly syl: GainNode;
  private readonly consG: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly loops: LoopingNoise[] = [];
  private readonly rand: () => number;
  private nextAt: number;
  private left: number;
  private phraseLen: number;
  /** Number of syllables started so far (tests / diagnostics). */
  syllables = 0;

  constructor(private readonly ctx: AudioContext, bus: AudioBus, p: AudioPedestrian) {
    this.speaker = speakerFor(p.id);
    this.rand = createRandom(Math.imul(p.id | 0, 40503) ^ 0x2545f491 ^ Math.floor(ctx.currentTime * 1000));
    this.emitter = bus.createEmitter({ category: 'voice', x: p.x, y: MOUTH_Y, z: p.z, refDistance: 1.5, maxDistance: 45, rolloff: 1.5 });
    this.emitter.setGain(0.6);
    this.out = this.track(ctx.createGain());
    this.out.gain.value = 0;
    this.out.connect(this.emitter.input);
    setTarget(ctx, this.out.gain, 1, FADE_TC);

    this.syl = this.track(ctx.createGain());
    this.syl.gain.value = 0;
    this.syl.connect(this.out);

    // Glottal source: a sawtooth at the speaker's pitch plus a trace of breath noise.
    const src = this.track(ctx.createGain());
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc.frequency.value = this.speaker.f0;
    const og = this.track(ctx.createGain());
    og.gain.value = 0.5;
    this.osc.connect(og);
    og.connect(src);
    this.osc.start();
    const breath = this.track(ctx.createGain());
    breath.gain.value = 0.06;
    this.loops.push(startLoopingNoise(ctx, breath, 'pink', 2));
    breath.connect(src);

    // Three parallel formant resonators.
    const f = this.speaker.vowels[0];
    const gains = [1, 0.7, 0.35];
    const qs = [6, 8, 10];
    for (let k = 0; k < 3; k++) {
      const bp = this.track(ctx.createBiquadFilter());
      bp.type = 'bandpass';
      bp.frequency.value = f[k];
      bp.Q.value = qs[k];
      const g = this.track(ctx.createGain());
      g.gain.value = gains[k];
      src.connect(bp);
      bp.connect(g);
      g.connect(this.syl);
      this.bps.push(bp);
    }

    // Fricative bursts (s, sh, f) before some syllables.
    const hp = this.track(ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    this.consG = this.track(ctx.createGain());
    this.consG.gain.value = 0;
    this.loops.push(startLoopingNoise(ctx, hp, 'white', 1));
    hp.connect(this.consG);
    this.consG.connect(this.out);

    // Start somewhere inside the conversation, not all at the same instant.
    this.nextAt = ctx.currentTime + this.rand() * 0.8;
    this.phraseLen = 3 + Math.floor(this.rand() * 5);
    this.left = this.phraseLen;
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  update(p: AudioPedestrian): void {
    this.emitter.setPosition(p.x, MOUTH_Y, p.z);
    const now = this.ctx.currentTime;
    if (now >= this.nextAt) this.syllable(now);
  }

  /** Starts one syllable now and schedules the next one (or the pause after the phrase). */
  private syllable(now: number): void {
    const r = this.rand;
    const sp = this.speaker;
    this.syllables++;
    const dur = 0.72 / sp.rate;
    const v = sp.vowels[Math.floor(r() * sp.vowels.length)];
    for (let k = 0; k < 3; k++) {
      const jitter = 0.93 + r() * 0.14;
      setTarget(this.ctx, this.bps[k].frequency, v[k] * jitter, 0.012);
    }
    // Pitch contour: a small jump per syllable and a glide, with declination over the phrase.
    const progress = 1 - this.left / Math.max(1, this.phraseLen);
    const f1 = sp.f0 * (0.94 + r() * 0.16) * (1 - 0.08 * progress);
    const f2 = f1 * (0.9 + r() * 0.18);
    const fp = this.osc.frequency;
    if (typeof fp.cancelScheduledValues === 'function') fp.cancelScheduledValues(now);
    fp.setValueAtTime(f1, now);
    fp.linearRampToValueAtTime(f2, now + dur);
    // Amplitude: quick attack, held, then released; later syllables of a phrase are quieter.
    const level = (0.65 + r() * 0.35) * (1 - 0.3 * progress);
    this.scheduleEnvelope(now, dur, level);
    if (r() < 0.45) {
      const cg = this.consG.gain;
      if (typeof cg.cancelScheduledValues === 'function') cg.cancelScheduledValues(now);
      cg.setTargetAtTime(0.16 + r() * 0.12, now, 0.006);
      cg.setTargetAtTime(0, now + 0.04, 0.012);
    }
    this.left--;
    if (this.left <= 0) {
      this.nextAt = now + 0.45 + r() * 1.1; // pause between phrases (the other person talks)
      this.phraseLen = 3 + Math.floor(r() * 5);
      this.left = this.phraseLen;
    } else {
      this.nextAt = now + (1 / sp.rate) * (0.8 + r() * 0.4);
    }
  }

  private scheduleEnvelope(now: number, dur: number, level: number): void {
    const g = this.syl.gain;
    if (typeof g.cancelScheduledValues === 'function') g.cancelScheduledValues(now);
    if (typeof g.setTargetAtTime === 'function') {
      g.setTargetAtTime(level, now, 0.012);
      g.setTargetAtTime(0, now + dur * 0.7, 0.025);
    } else {
      g.value = level;
    }
  }

  release(): void {
    setTarget(this.ctx, this.out.gain, 0, 0.05);
    this.endTime = this.ctx.currentTime + FADE_OUT_S;
  }

  destroy(): void {
    try {
      this.osc.stop();
    } catch {
      /* already stopped */
    }
    this.osc.disconnect();
    for (const l of this.loops) l.stop();
    for (const n of this.nodes) n.disconnect();
    this.emitter.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Footsteps

class StepVoice implements Voice {
  endTime = 0;
  readonly emitter: Emitter;
  private next: number;
  private left = Math.random() < 0.5;
  private lastX: number;
  private lastZ: number;
  private dirX = 1;
  private dirZ = 0;
  /** Steps taken so far (tests / diagnostics). */
  steps = 0;

  constructor(private readonly ctx: AudioContext, bus: AudioBus, p: AudioPedestrian) {
    this.emitter = bus.createEmitter({ category: 'footstep', x: p.x, y: 0.1, z: p.z, refDistance: 2, maxDistance: 40, rolloff: 1.7 });
    this.emitter.setGain(0.85);
    this.lastX = p.x;
    this.lastZ = p.z;
    this.next = ctx.currentTime + Math.random() / stepRate(p.speed); // desynchronise the crowd
  }

  update(p: AudioPedestrian, rain: number): void {
    const dx = p.x - this.lastX;
    const dz = p.z - this.lastZ;
    const d = Math.hypot(dx, dz);
    if (d > 0.002) {
      this.dirX += (dx / d - this.dirX) * 0.3;
      this.dirZ += (dz / d - this.dirZ) * 0.3;
      const n = Math.hypot(this.dirX, this.dirZ) || 1;
      this.dirX /= n;
      this.dirZ /= n;
    }
    this.lastX = p.x;
    this.lastZ = p.z;
    const now = this.ctx.currentTime;
    const interval = 1 / stepRate(p.speed);
    if (this.next < now - interval) this.next = now; // resync after a stall, never a burst of steps
    if (now >= this.next) {
      this.next += interval;
      this.left = !this.left;
      const off = this.left ? 0.1 : -0.1;
      // Alternate to the left and right of the walking line (perpendicular to the heading).
      this.emitter.setPosition(p.x - this.dirZ * off, 0.1, p.z + this.dirX * off);
      this.step(now, rain);
    } else {
      this.emitter.setPosition(p.x, 0.1, p.z);
    }
  }

  private step(when: number, rain: number): void {
    this.steps++;
    const ctx = this.ctx;
    const dest = this.emitter.input;
    const vary = 0.8 + Math.random() * 0.4;
    const wet = rain > WET_STEP_RAIN ? clamp01(0.4 + rain) : 0;
    if (wet === 0) {
      // Dry pavement: a crisp little tick and a soft low thud.
      playNoiseBurst(ctx, dest, { kind: 'pink', when, attack: 0.002, decay: 0.035, gain: 0.5 * vary, filter: { type: 'bandpass', frequency: 1500 + Math.random() * 900, q: 0.9 } });
      playTone(ctx, dest, { type: 'sine', when, frequency: 140 * vary, frequencyEnd: 70, attack: 0.003, decay: 0.07, gain: 0.35 });
    } else {
      // Wet: duller tap with a short splash hiss.
      playNoiseBurst(ctx, dest, { kind: 'pink', when, attack: 0.003, decay: 0.075, gain: 0.5 * vary, filter: { type: 'lowpass', frequency: 1000 + Math.random() * 300, q: 0.7 } });
      playNoiseBurst(ctx, dest, { kind: 'white', when, attack: 0.004, decay: 0.06, gain: 0.2 * wet * vary, filter: { type: 'highpass', frequency: 3500, q: 0.7 } });
      playTone(ctx, dest, { type: 'sine', when, frequency: 110 * vary, frequencyEnd: 60, attack: 0.003, decay: 0.06, gain: 0.2 });
    }
  }

  release(): void {
    this.endTime = this.ctx.currentTime + 0.2; // let the last step ring out
  }

  destroy(): void {
    this.emitter.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Rain on umbrellas

const dropCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 2 s of sparse random drop impulses (each a few ms of decaying noise), cached per context. */
function dropBuffer(ctx: BaseAudioContext): AudioBuffer {
  const hit = dropCache.get(ctx);
  if (hit) return hit;
  const sr = ctx.sampleRate || 44100;
  const len = Math.floor(sr * 2);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const drops = 90; // per second on average at playbackRate 1
  const tail = Math.floor(sr * 0.008);
  for (let k = 0; k < drops * 2; k++) {
    const at = Math.floor(Math.random() * (len - tail));
    const amp = 0.25 + Math.random() * 0.75;
    for (let i = 0; i < tail; i++) d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (tail * 0.3));
  }
  dropCache.set(ctx, buf);
  return buf;
}

class UmbrellaVoice implements Voice {
  endTime = 0;
  readonly emitter: Emitter;
  private readonly out: GainNode;
  private readonly src: AudioBufferSourceNode;
  private readonly lvl: GainNode;
  private readonly nodes: AudioNode[] = [];
  private lastRain = -1;

  constructor(private readonly ctx: AudioContext, bus: AudioBus, p: AudioPedestrian) {
    this.emitter = bus.createEmitter({ category: 'rain', x: p.x, y: 2.1, z: p.z, refDistance: 1.5, maxDistance: 35, rolloff: 1.6 });
    this.emitter.setGain(0.7);
    this.out = this.track(ctx.createGain());
    this.out.gain.value = 0;
    this.out.connect(this.emitter.input);
    setTarget(ctx, this.out.gain, 1, FADE_TC);
    this.lvl = this.track(ctx.createGain());
    this.lvl.gain.value = 0;
    this.lvl.connect(this.out);

    this.src = ctx.createBufferSource();
    this.src.buffer = dropBuffer(ctx);
    this.src.loop = true;
    this.src.playbackRate.value = 0.9 + Math.random() * 0.2;
    // Taut fabric: a drum-like resonance and a bright patter band.
    const drum = this.track(ctx.createBiquadFilter());
    drum.type = 'bandpass';
    drum.frequency.value = 380 + Math.random() * 120;
    drum.Q.value = 2.2;
    const dg = this.track(ctx.createGain());
    dg.gain.value = 0.7;
    const patter = this.track(ctx.createBiquadFilter());
    patter.type = 'bandpass';
    patter.frequency.value = 1500 + Math.random() * 600;
    patter.Q.value = 0.9;
    const pg = this.track(ctx.createGain());
    pg.gain.value = 0.55;
    this.src.connect(drum);
    drum.connect(dg);
    dg.connect(this.lvl);
    this.src.connect(patter);
    patter.connect(pg);
    pg.connect(this.lvl);
    this.src.start(0, Math.random() * 2);
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  update(p: AudioPedestrian, rain: number): void {
    this.emitter.setPosition(p.x, 2.1, p.z);
    if (Math.abs(rain - this.lastRain) > 0.02) {
      this.lastRain = rain;
      setTarget(this.ctx, this.lvl.gain, 0.9 * Math.pow(clamp01(rain), 0.8), 0.15);
      setTarget(this.ctx, this.src.playbackRate, 0.85 + 0.3 * clamp01(rain), 0.3);
    }
  }

  release(): void {
    setTarget(this.ctx, this.out.gain, 0, 0.06);
    this.endTime = this.ctx.currentTime + FADE_OUT_S;
  }

  destroy(): void {
    try {
      this.src.stop();
    } catch {
      /* already stopped */
    }
    this.src.disconnect();
    for (const n of this.nodes) n.disconnect();
    this.emitter.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// The system

type Cands = VoiceCandidate<AudioPedestrian>[];

export class PeopleSounds implements SoundSystem {
  readonly name = 'people';
  private readonly chats = new Map<number, ChatVoice>();
  private readonly steps = new Map<number, StepVoice>();
  private readonly umbrellas = new Map<number, UmbrellaVoice>();
  private readonly dying: Voice[] = [];
  private readonly chatBudget: VoiceBudget<AudioPedestrian>;
  private readonly stepBudget: VoiceBudget<AudioPedestrian>;
  private readonly umbrellaBudget: VoiceBudget<AudioPedestrian>;
  private readonly chatCands: Cands = [];
  private readonly stepCands: Cands = [];
  private readonly umbCands: Cands = [];
  private rainOn = false;

  constructor(private readonly ctx: AudioContext, bus: AudioBus) {
    const mk = <V extends Voice>(map: Map<number, V>, max: number, maxDistance: number, make: (p: AudioPedestrian) => V) =>
      new VoiceBudget<AudioPedestrian>({
        max,
        maxDistance,
        onAcquire: (id, p) => map.set(id as number, make(p)),
        onRelease: (id) => {
          const v = map.get(id as number);
          if (!v) return;
          map.delete(id as number);
          v.release();
          this.dying.push(v);
        },
      });
    this.chatBudget = mk(this.chats, CHAT_VOICES, CHAT_MAX_DISTANCE, (p) => new ChatVoice(ctx, bus, p));
    this.stepBudget = mk(this.steps, STEP_VOICES, STEP_MAX_DISTANCE, (p) => new StepVoice(ctx, bus, p));
    this.umbrellaBudget = mk(this.umbrellas, UMBRELLA_VOICES, UMBRELLA_MAX_DISTANCE, (p) => new UmbrellaVoice(ctx, bus, p));
  }

  /** Diagnostics for tests. */
  get stats(): { chat: number; steps: number; umbrellas: number; dying: number } {
    return { chat: this.chats.size, steps: this.steps.size, umbrellas: this.umbrellas.size, dying: this.dying.length };
  }

  chatIds(): number[] {
    return [...this.chats.keys()];
  }

  stepIds(): number[] {
    return [...this.steps.keys()];
  }

  umbrellaIds(): number[] {
    return [...this.umbrellas.keys()];
  }

  chatVoice(id: number): ChatVoice | undefined {
    return this.chats.get(id);
  }

  stepVoice(id: number): StepVoice | undefined {
    return this.steps.get(id);
  }

  update(frame: AudioFrame): void {
    const l = frame.listener;
    const now = this.ctx.currentTime;
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (now >= this.dying[i].endTime) {
        this.dying[i].destroy();
        this.dying.splice(i, 1);
      }
    }

    const rain = Number.isFinite(frame.rain) ? frame.rain : 0;
    if (this.rainOn ? rain < RAIN_OFF : rain > RAIN_ON) this.rainOn = !this.rainOn;

    let nc = 0;
    let ns = 0;
    let nu = 0;
    const ps = frame.pedestrians;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const d = Math.hypot(p.x - l.x, MOUTH_Y - l.y, p.z - l.z);
      const kind = poseKind(p.pose);
      if (kind === 'chat' && d <= CHAT_MAX_DISTANCE) nc = this.add(this.chatCands, nc, p, d);
      if (kind === 'walk' && p.speed > 0.3 && d <= STEP_MAX_DISTANCE) ns = this.add(this.stepCands, ns, p, d);
      if (this.rainOn && p.umbrella && d <= UMBRELLA_MAX_DISTANCE) nu = this.add(this.umbCands, nu, p, d);
    }
    this.chatCands.length = nc;
    this.stepCands.length = ns;
    this.umbCands.length = nu;
    this.chatBudget.update(this.chatCands);
    this.stepBudget.update(this.stepCands);
    this.umbrellaBudget.update(this.umbCands);

    if (this.chats.size + this.steps.size + this.umbrellas.size === 0) return;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const c = this.chats.get(p.id);
      if (c) c.update(p);
      const s = this.steps.get(p.id);
      if (s) s.update(p, rain);
      const u = this.umbrellas.get(p.id);
      if (u) u.update(p, rain);
    }
  }

  private add(list: Cands, n: number, p: AudioPedestrian, d: number): number {
    const c = list[n];
    if (!c) list[n] = { key: p.id, distance: d, item: p };
    else {
      c.key = p.id;
      c.distance = d;
      c.item = p;
    }
    return n + 1;
  }

  dispose(): void {
    this.chatBudget.clear();
    this.stepBudget.clear();
    this.umbrellaBudget.clear();
    for (const v of this.dying) v.destroy();
    this.dying.length = 0;
    this.chats.clear();
    this.steps.clear();
    this.umbrellas.clear();
  }
}

export const createPeopleSounds: SoundSystemFactory = (ctx, bus): SoundSystem => new PeopleSounds(ctx, bus);
