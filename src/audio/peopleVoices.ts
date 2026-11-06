// People sounds: chat (murmur) and footstep voices. Split from people.ts.

import type { AudioBus, Emitter } from './bus';
import type { AudioPedestrian } from './frame';
import { clamp01 } from './math';
import { createRandom, playNoiseBurst, playTone, startLoopingNoise } from './synth';
import type { LoopingNoise } from './synth';
import { WET_STEP_RAIN, FADE_TC, FADE_OUT_S, MOUTH_Y, stepRate, speakerFor, setTarget } from './peopleCore';
import type { Speaker, Voice } from './peopleCore';

// ---------------------------------------------------------------------------------------------------------
// Chat voice

export class ChatVoice implements Voice {
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

export class StepVoice implements Voice {
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
