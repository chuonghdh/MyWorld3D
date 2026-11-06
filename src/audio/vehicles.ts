// Vehicle sounds: a positional engine voice per nearby vehicle (class specific), a relay tick-tock for
// vehicles with a turn indicator on, and one-shot horns. Every voice owns an AudioBus emitter that follows
// the vehicle each frame. No shared mixed loop, no per-frame node creation (only event one-shots).
//
// Synthesis notes (see docs/AUDIO.md):
//  car        4-cylinder, 4-stroke: fires 2x per revolution (f = rpm/60*2). Sawtooth + detuned sawtooth + square
//             sub-octave through a lowpass that opens with rpm and load; intake noise rises with load; slight
//             random wander of the pitch (irregular combustion).
//  bus/truck  6-cylinder diesel: fires 3x per rev; a narrow pulse wave (PeriodicWave, duty ~16 %) gives the
//             low "pulse train"; a combustion knock ("chatter": band-passed noise amplitude-modulated at the firing
//             rate), a turbo whistle under load, an engine-brake rumble when decelerating and an air-brake
//             "psshh" burst when stopping.
//  motorbike  light single/two-stroke: fires once per rev, high revs, quick rev response; a raspy resonant
//             band-pass ("formant") and a doubled-frequency buzz partial.
// Everything above is tuned from acoustics knowledge, not by ear (no audio output available when written).


import type { AudioBus } from './bus';
import { VoiceBudget } from './bus';
import type { VoiceCandidate } from './bus';
import type { AudioFrame, AudioHorn, AudioVehicle, SoundSystem, SoundSystemFactory } from './frame';
import type { ListenerState } from './listener';
import { ENGINE_VOICES, ENGINE_MAX_DISTANCE, INDICATOR_VOICES, INDICATOR_MAX_DISTANCE, HORN_MAX_DISTANCE, HORN_MAX_CONCURRENT, EMITTER_HEIGHT } from './vehiclesCore';
import type { Voice } from './vehiclesCore';
import { EngineVoice } from './vehiclesEngine';
import { TickVoice, hornSpec } from './vehiclesSignals';
import type { HornShot } from './vehiclesSignals';
export * from './vehiclesCore';
export * from './vehiclesEngine';
export * from './vehiclesSignals';

// ---------------------------------------------------------------------------------------------------------
// The system

export class VehicleSounds implements SoundSystem {
  readonly name = 'vehicles';
  private readonly engines = new Map<number, EngineVoice>();
  private readonly ticks = new Map<number, TickVoice>();
  private readonly dying: Voice[] = [];
  private readonly horns: HornShot[] = [];
  private readonly engineBudget: VoiceBudget<AudioVehicle>;
  private readonly tickBudget: VoiceBudget<AudioVehicle>;
  private readonly engineCands: VoiceCandidate<AudioVehicle>[] = [];
  private readonly tickCands: VoiceCandidate<AudioVehicle>[] = [];
  private listener: ListenerState | null = null;

  constructor(private readonly ctx: AudioContext, private readonly bus: AudioBus) {
    this.engineBudget = new VoiceBudget<AudioVehicle>({
      max: ENGINE_VOICES,
      maxDistance: ENGINE_MAX_DISTANCE,
      onAcquire: (id, v) => this.engines.set(id as number, new EngineVoice(ctx, bus, v)),
      onRelease: (id) => {
        const e = this.engines.get(id as number);
        if (!e) return;
        this.engines.delete(id as number);
        e.release();
        this.dying.push(e);
      },
    });
    this.tickBudget = new VoiceBudget<AudioVehicle>({
      max: INDICATOR_VOICES,
      maxDistance: INDICATOR_MAX_DISTANCE,
      onAcquire: (id, v) => this.ticks.set(id as number, new TickVoice(ctx, bus, v)),
      onRelease: (id) => {
        const t = this.ticks.get(id as number);
        if (!t) return;
        this.ticks.delete(id as number);
        t.release();
        this.dying.push(t);
      },
    });
  }

  /** Diagnostics for tests and the debug overlay. */
  get stats(): { engines: number; indicators: number; horns: number; dying: number } {
    return { engines: this.engines.size, indicators: this.ticks.size, horns: this.horns.length, dying: this.dying.length };
  }

  engineIds(): number[] {
    return [...this.engines.keys()];
  }

  indicatorIds(): number[] {
    return [...this.ticks.keys()];
  }

  engineVoice(id: number): EngineVoice | undefined {
    return this.engines.get(id);
  }

  update(frame: AudioFrame): void {
    const l = frame.listener;
    this.listener = l;
    this.sweep();

    let ne = 0;
    let nt = 0;
    const vs = frame.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (!Number.isFinite(v.x) || !Number.isFinite(v.z)) continue;
      const d = Math.hypot(v.x - l.x, EMITTER_HEIGHT - l.y, v.z - l.z);
      if (d <= ENGINE_MAX_DISTANCE) ne = this.addCand(this.engineCands, ne, v, d);
      if (v.indicator !== 0 && d <= INDICATOR_MAX_DISTANCE) nt = this.addCand(this.tickCands, nt, v, d);
    }
    this.engineCands.length = ne;
    this.tickCands.length = nt;
    this.engineBudget.update(this.engineCands);
    this.tickBudget.update(this.tickCands);

    if (this.engines.size > 0 || this.ticks.size > 0) {
      for (let i = 0; i < vs.length; i++) {
        const v = vs[i];
        const e = this.engines.get(v.id);
        if (e) e.update(v, frame, l);
        const t = this.ticks.get(v.id);
        if (t) t.update(v);
      }
    }

    for (let i = 0; i < frame.horns.length; i++) this.horn(frame.horns[i]);
  }

  private addCand(list: VoiceCandidate<AudioVehicle>[], n: number, v: AudioVehicle, d: number): number {
    let c = list[n];
    if (!c) {
      c = { key: v.id, distance: d, item: v };
      list[n] = c;
    } else {
      c.key = v.id;
      c.distance = d;
      c.item = v;
    }
    return n + 1;
  }

  /** Tears down finished fades and horns. */
  private sweep(): void {
    const now = this.ctx.currentTime;
    for (let i = this.dying.length - 1; i >= 0; i--) {
      if (now >= this.dying[i].endTime) {
        this.dying[i].destroy();
        this.dying.splice(i, 1);
      }
    }
    for (let i = this.horns.length - 1; i >= 0; i--) {
      if (now >= this.horns[i].endTime) {
        this.horns[i].emitter.dispose();
        this.horns.splice(i, 1);
      }
    }
  }

  /** One-shot horn at the requested position. */
  private horn(h: AudioHorn): void {
    const l = this.listener;
    if (!l || !Number.isFinite(h.x) || !Number.isFinite(h.z)) return;
    if (Math.hypot(h.x - l.x, EMITTER_HEIGHT - l.y, h.z - l.z) > HORN_MAX_DISTANCE) return;
    if (this.horns.length >= HORN_MAX_CONCURRENT) return;
    const spec = hornSpec(h.cls, Math.random);
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01;
    const last = spec.pattern[spec.pattern.length - 1];
    const end = t0 + last[0] + last[1] + spec.release;
    const emitter = this.bus.createEmitter({ category: 'horn', x: h.x, y: EMITTER_HEIGHT, z: h.z, refDistance: spec.refDistance, maxDistance: 300, rolloff: 0.9 });
    emitter.setGain(1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    for (const [s, d] of spec.pattern) {
      const a = t0 + s;
      env.gain.setValueAtTime(0, a);
      env.gain.linearRampToValueAtTime(spec.gain, a + spec.attack);
      env.gain.setValueAtTime(spec.gain, a + d);
      env.gain.linearRampToValueAtTime(0, a + d + spec.release);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = spec.lowpass;
    lp.Q.value = 0.7;
    lp.connect(env);
    env.connect(emitter.input);
    spec.freqs.forEach((f, k) => {
      const o = ctx.createOscillator();
      o.type = spec.wave;
      o.frequency.setValueAtTime(f, t0);
      if (spec.sag > 0) o.frequency.linearRampToValueAtTime(f * (1 - spec.sag), end);
      o.detune.value = k === 0 ? -4 : 5; // two reeds are never perfectly in tune
      const g = ctx.createGain();
      g.gain.value = k === 0 ? 0.6 : 0.5;
      o.connect(g);
      g.connect(lp);
      o.start(t0);
      o.stop(end + 0.02);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
        if (k === 0) {
          lp.disconnect();
          env.disconnect();
        }
      };
    });
    this.horns.push({ endTime: end + 0.1, emitter });
  }

  dispose(): void {
    this.engineBudget.clear();
    this.tickBudget.clear();
    for (const v of this.dying) v.destroy();
    this.dying.length = 0;
    for (const h of this.horns) h.emitter.dispose();
    this.horns.length = 0;
    this.engines.clear();
    this.ticks.clear();
  }
}

export const createVehicleSounds: SoundSystemFactory = (ctx, bus): SoundSystem => new VehicleSounds(ctx, bus);
