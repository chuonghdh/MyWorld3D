// People sounds: rain on umbrellas. Split from people.ts.

import type { AudioBus, Emitter } from './bus';
import type { AudioPedestrian } from './frame';
import { clamp01 } from './math';
import { FADE_TC, FADE_OUT_S, setTarget } from './peopleCore';
import type { Voice } from './peopleCore';

// ---------------------------------------------------------------------------------------------------------
// Rain on umbrellas

export const dropCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 2 s of sparse random drop impulses (each a few ms of decaying noise), cached per context. */
export function dropBuffer(ctx: BaseAudioContext): AudioBuffer {
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

export class UmbrellaVoice implements Voice {
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
