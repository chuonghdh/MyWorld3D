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

import type { AudioBus, Emitter } from './bus';
import { VoiceBudget, type VoiceCandidate } from './bus';
import type { AudioFrame, AudioHorn, AudioVehicle, AudioVehicleClass, SoundSystem, SoundSystemFactory } from './frame';
import type { ListenerState } from './listener';
import { clamp01, dopplerRatio } from './math';
import { playNoiseBurst, playTone, startLoopingNoise, type LoopingNoise } from './synth';
import { audio as audioTuning } from '../config/tuning';

// ---------------------------------------------------------------------------------------------------------
// Tunables

export const ENGINE_VOICES = 8;
export const ENGINE_MAX_DISTANCE = 120;
export const INDICATOR_VOICES = 6;
export const INDICATOR_MAX_DISTANCE = 60;
/** Relay rate of the indicator (tick + tock pairs per second). */
export const INDICATOR_HZ = 1.5;
export const HORN_MAX_DISTANCE = 220;
const HORN_MAX_CONCURRENT = 4;
const EMITTER_HEIGHT = 1;
const FADE_TC = 0.07;
/** Level of the air-brake hiss relative to the first version (turned down to 70 %). */
export const AIR_BRAKE_LEVEL = audioTuning.airBrakeLevel;

/** Seconds a released voice keeps running (while fading to silence) before its nodes are torn down. */
const FADE_OUT_S = 0.5;

// ---------------------------------------------------------------------------------------------------------
// Engine model (pure, unit tested)

export interface EngineProfile {
  idleRpm: number;
  redRpm: number;
  /** rpm per m/s for gears 1..n. */
  ratios: readonly number[];
  upRpm: number;
  downRpm: number;
  /** Firing frequency = rpm / 60 * pulsesPerRev. */
  pulsesPerRev: number;
  /** Acceleration (m/s^2) that counts as full throttle. */
  accelRef: number;
  /** Fraction by which full load raises the rpm above the geared value (throttle blip, clutch slip). */
  revBump: number;
  /** Time constant of the rpm response (s). Small for a motorbike. */
  rpmTau: number;
  /** Voice level at full load (before distance). */
  baseLevel: number;
  /** Level at idle relative to full load: idle vehicles still hum. */
  idleLevel: number;
  refDistance: number;
}

export const ENGINE_PROFILES: Record<AudioVehicleClass, EngineProfile> = {
  car: {
    idleRpm: 800, redRpm: 6000, ratios: [430, 270, 190, 145, 115], upRpm: 2900, downRpm: 1300,
    pulsesPerRev: 2, accelRef: 2.5, revBump: 0.12, rpmTau: 0.16, baseLevel: 0.5, idleLevel: 0.36, refDistance: 5,
  },
  bus: {
    idleRpm: 600, redRpm: 2200, ratios: [260, 160, 105, 75], upRpm: 1700, downRpm: 800,
    pulsesPerRev: 3, accelRef: 1.5, revBump: 0.1, rpmTau: 0.3, baseLevel: 0.75, idleLevel: 0.4, refDistance: 8,
  },
  truck: {
    idleRpm: 620, redRpm: 2300, ratios: [250, 155, 102, 73], upRpm: 1750, downRpm: 820,
    pulsesPerRev: 3, accelRef: 1.8, revBump: 0.1, rpmTau: 0.28, baseLevel: 0.85, idleLevel: 0.4, refDistance: 8,
  },
  motorbike: {
    idleRpm: 1500, redRpm: 9000, ratios: [900, 560, 400, 300], upRpm: 7000, downRpm: 3000,
    pulsesPerRev: 1, accelRef: 3.5, revBump: 0.2, rpmTau: 0.07, baseLevel: 0.45, idleLevel: 0.34, refDistance: 4,
  },
};

export interface EngineTarget {
  gear: number;
  rpm: number;
  /** 0..1 power demand (cruise load plus acceleration). */
  load: number;
  /** 0..1 engine braking while decelerating at speed. */
  engineBrake: number;
}

/** Gear (with hysteresis from the previous gear), rpm, load and engine braking for a vehicle state. */
export function engineTarget(p: EngineProfile, speed: number, accel: number, gear: number): EngineTarget {
  const n = p.ratios.length;
  const s = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  const a = Number.isFinite(accel) ? accel : 0;
  let g = Math.min(n, Math.max(1, Math.floor(gear) || 1));
  while (g < n && s * p.ratios[g - 1] > p.upRpm) g++;
  while (g > 1 && s * p.ratios[g - 1] < p.downRpm) g--;
  const demand = clamp01(a / p.accelRef);
  const cruise = s > 1 ? 0.12 + 0.12 * clamp01(s / 15) : 0;
  const load = clamp01(cruise + 0.8 * demand);
  let rpm = Math.max(p.idleRpm, s * p.ratios[g - 1]) * (1 + p.revBump * load);
  // Launch: the clutch slips, the engine revs above idle although the road speed is still low.
  if (s < 3 && demand > 0) rpm = Math.max(rpm, p.idleRpm * (1 + 0.9 * demand * (1 - s / 3)));
  rpm = Math.min(p.redRpm, rpm);
  const engineBrake = a < -0.5 && s > 2 ? clamp01((-a - 0.5) / 2) * clamp01(s / 6) : 0;
  return { gear: g, rpm, load, engineBrake };
}

/** Firing frequency in Hz. */
export function firingHz(p: EngineProfile, rpm: number): number {
  return (rpm / 60) * p.pulsesPerRev;
}

/** Voice level 0..base: an idling vehicle hums softly, speed and load raise it. */
export function engineLevel(p: EngineProfile, speed: number, load: number, engineBrake: number): number {
  const frac = p.idleLevel + 0.26 * clamp01(speed / 12) + 0.38 * clamp01(load) + 0.1 * clamp01(engineBrake);
  return p.baseLevel * Math.min(1, frac);
}

/** Tyre / road noise amount 0..1: nothing below 4 m/s, full at 20 m/s; wet roads are louder. */
export function tyreLevel(speed: number, rain: number): number {
  const t = clamp01((speed - 4) / 16);
  const smooth = t * t * (3 - 2 * t);
  return smooth * (0.3 + 0.25 * clamp01(rain * 2));
}

/** Closing speed (m/s, positive when the vehicle approaches the listener), listener assumed static. */
export function approachSpeed(v: AudioVehicle, lx: number, lz: number): number {
  const dx = lx - v.x;
  const dz = lz - v.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return 0;
  const vx = Math.sin(v.heading) * v.speed;
  const vz = Math.cos(v.heading) * v.speed;
  return (vx * dx + vz * dz) / d;
}

// ---------------------------------------------------------------------------------------------------------
// Small Web Audio helpers

/** Smoothed AudioParam writer that skips writes when the value barely changed. */
class Param {
  private last = Number.NaN;
  constructor(private readonly ctx: BaseAudioContext, readonly param: AudioParam, private readonly rel = 0.004, private readonly abs = 0.0005) {}
  set(v: number, tc = 0.05): void {
    if (!Number.isFinite(v)) return;
    if (Math.abs(v - this.last) <= Math.abs(this.last) * this.rel + this.abs) return;
    this.last = v;
    const p = this.param;
    if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, this.ctx.currentTime, tc);
    else p.value = v;
  }
  /** Writes immediately (initial value). */
  init(v: number): void {
    this.last = v;
    this.param.value = v;
  }
}

const pulseCache = new WeakMap<BaseAudioContext, PeriodicWave | null>();

/** Narrow pulse wave (duty ~16 %): the lumpy, low "pulse train" of a diesel. Null when unsupported. */
function pulseWave(ctx: BaseAudioContext): PeriodicWave | null {
  if (pulseCache.has(ctx)) return pulseCache.get(ctx) ?? null;
  let w: PeriodicWave | null = null;
  if (typeof ctx.createPeriodicWave === 'function') {
    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    const duty = 0.16;
    for (let k = 1; k < n; k++) real[k] = (2 * Math.sin(k * Math.PI * duty)) / (k * Math.PI);
    w = ctx.createPeriodicWave(real, imag);
  }
  pulseCache.set(ctx, w);
  return w;
}

interface Voice {
  /** Context time after which a released voice can be destroyed. */
  endTime: number;
  release(): void;
  destroy(): void;
}

// ---------------------------------------------------------------------------------------------------------
// Engine voice

class EngineVoice implements Voice {
  endTime = 0;
  readonly emitter: Emitter;
  private readonly profile: EngineProfile;
  private readonly cls: AudioVehicleClass;
  private readonly diesel: boolean;
  private readonly bike: boolean;
  private readonly out: GainNode;
  private readonly oscs: OscillatorNode[] = [];
  private readonly loops: LoopingNoise[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly fA: Param;
  private readonly fB: Param;
  private readonly fC: Param;
  private readonly lvl: Param;
  private readonly tone: Param;
  private readonly intakeG: Param;
  private readonly intakeF: Param;
  private readonly tyreG: Param;
  private readonly tyreF: Param;
  private readonly formantG: Param | null = null;
  private readonly lfoF: Param | null = null;
  private readonly chatterG: Param | null = null;
  private readonly rumbleG: Param | null = null;
  private readonly turboF: Param | null = null;
  private readonly turboG: Param | null = null;
  private readonly fadeParam: Param;
  gear = 1;
  rpm: number;
  private wander = 0;
  private dop = 1;
  private prevSpeed: number;
  private hissCooldown = 0;
  /** Last firing frequency written to oscillator A (for tests / diagnostics). */
  lastFireHz = 0;
  lastLevel = 0;

  constructor(private readonly ctx: AudioContext, bus: AudioBus, v: AudioVehicle) {
    this.cls = v.cls;
    this.profile = ENGINE_PROFILES[v.cls];
    this.diesel = v.cls === 'bus' || v.cls === 'truck';
    this.bike = v.cls === 'motorbike';
    const p = this.profile;
    this.emitter = bus.createEmitter({ category: 'engine', x: v.x, y: EMITTER_HEIGHT, z: v.z, refDistance: p.refDistance, maxDistance: 150, rolloff: 1.1 });
    this.out = this.track(ctx.createGain());
    this.out.gain.value = 0;
    this.out.connect(this.emitter.input);
    this.fadeParam = new Param(ctx, this.out.gain, 0.01, 0.001);
    this.fadeParam.set(1, FADE_TC);

    const st = engineTarget(p, v.speed, v.accel, 1);
    this.gear = st.gear;
    this.rpm = st.rpm;
    this.prevSpeed = v.speed;

    // Body: three oscillators summed, then the tone lowpass.
    const body = this.track(ctx.createGain());
    const lvl = this.track(ctx.createGain());
    lvl.gain.value = 0;
    this.lvl = new Param(ctx, lvl.gain);
    const tone = this.track(ctx.createBiquadFilter());
    tone.type = 'lowpass';
    tone.Q.value = this.diesel ? 0.9 : this.bike ? 1.4 : 1.1;
    this.tone = new Param(ctx, tone.frequency, 0.01, 1);
    body.connect(tone);
    tone.connect(lvl);
    lvl.connect(this.out);

    const mkOsc = (type: OscillatorType, gain: number, wave?: PeriodicWave | null): Param => {
      const o = ctx.createOscillator();
      if (wave) o.setPeriodicWave(wave);
      else o.type = type;
      const g = this.track(ctx.createGain());
      g.gain.value = gain;
      o.connect(g);
      g.connect(body);
      o.start();
      this.oscs.push(o);
      return new Param(ctx, o.frequency, 0.0015, 0.01);
    };
    if (this.diesel) {
      const w = pulseWave(ctx);
      this.fA = mkOsc('sawtooth', 0.55, w);
      this.fB = mkOsc('sine', 0.5); // sub-octave thump
      this.fC = mkOsc('triangle', 0.18); // second harmonic body
    } else if (this.bike) {
      this.fA = mkOsc('sawtooth', 0.5);
      this.fB = mkOsc('square', 0.12);
      this.fC = mkOsc('sawtooth', 0.28); // buzz an octave up
    } else {
      this.fA = mkOsc('sawtooth', 0.5);
      this.fB = mkOsc('square', 0.32);
      this.fC = mkOsc('sawtooth', 0.22); // detuned twin: slow beating
    }

    // Raspy resonance (bike strongly, car slightly).
    if (!this.diesel) {
      const f = this.track(ctx.createBiquadFilter());
      f.type = 'bandpass';
      f.frequency.value = this.bike ? 2100 : 900;
      f.Q.value = this.bike ? 5 : 2;
      const g = this.track(ctx.createGain());
      g.gain.value = this.bike ? 0.35 : 0.08;
      body.connect(f);
      f.connect(g);
      g.connect(lvl);
      this.formantG = new Param(ctx, g.gain);
      this.formantG.init(g.gain.value);
    }

    // Intake / mechanical noise, rises with load.
    const ibp = this.track(ctx.createBiquadFilter());
    this.loops.push(startLoopingNoise(ctx, ibp, 'pink', 2));
    ibp.type = 'bandpass';
    ibp.frequency.value = 700;
    ibp.Q.value = 0.9;
    this.intakeF = new Param(ctx, ibp.frequency, 0.02, 5);
    const ig = this.track(ctx.createGain());
    ig.gain.value = 0;
    ibp.connect(ig);
    ig.connect(lvl);
    this.intakeG = new Param(ctx, ig.gain);

    // Tyre / road noise, straight to the voice output (independent of the engine level).
    const tbp = this.track(ctx.createBiquadFilter());
    tbp.type = 'bandpass';
    tbp.frequency.value = 500;
    tbp.Q.value = 0.7;
    this.loops.push(startLoopingNoise(ctx, tbp, 'pink', 2));
    const tg = this.track(ctx.createGain());
    tg.gain.value = 0;
    tbp.connect(tg);
    tg.connect(this.out);
    this.tyreF = new Param(ctx, tbp.frequency, 0.03, 5);
    this.tyreG = new Param(ctx, tg.gain);

    if (this.diesel) {
      // Combustion knock: noise gated by an oscillator running at the firing rate.
      const cbp = this.track(ctx.createBiquadFilter());
      cbp.type = 'bandpass';
      cbp.frequency.value = 1400;
      cbp.Q.value = 1.1;
      this.loops.push(startLoopingNoise(ctx, cbp, 'white', 1));
      const cg = this.track(ctx.createGain());
      cg.gain.value = 0;
      cbp.connect(cg);
      cg.connect(lvl);
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      const depth = this.track(ctx.createGain());
      depth.gain.value = 0.16;
      lfo.connect(depth);
      depth.connect(cg.gain);
      lfo.start();
      this.oscs.push(lfo);
      this.lfoF = new Param(ctx, lfo.frequency, 0.0015, 0.01);
      this.chatterG = new Param(ctx, cg.gain);
      this.chatterG.init(0.1); // base gain; the sawtooth LFO adds the pulse
      cg.gain.value = 0.1;

      // Engine-brake rumble.
      const rlp = this.track(ctx.createBiquadFilter());
      rlp.type = 'lowpass';
      rlp.frequency.value = 160;
      this.loops.push(startLoopingNoise(ctx, rlp, 'brown', 2));
      const rg = this.track(ctx.createGain());
      rg.gain.value = 0;
      rlp.connect(rg);
      rg.connect(lvl);
      this.rumbleG = new Param(ctx, rg.gain);

      // Turbo whistle.
      const turbo = ctx.createOscillator();
      turbo.type = 'sine';
      const tgn = this.track(ctx.createGain());
      tgn.gain.value = 0;
      turbo.connect(tgn);
      tgn.connect(lvl);
      turbo.start();
      this.oscs.push(turbo);
      this.turboF = new Param(ctx, turbo.frequency, 0.01, 2);
      this.turboG = new Param(ctx, tgn.gain);
    }
  }

  private track<T extends AudioNode>(n: T): T {
    this.nodes.push(n);
    return n;
  }

  update(v: AudioVehicle, frame: AudioFrame, listener: ListenerState): void {
    const p = this.profile;
    const dt = Math.min(0.25, Math.max(0.001, frame.dt));
    const st = engineTarget(p, v.speed, v.accel, this.gear);
    this.gear = st.gear;
    this.rpm += (st.rpm - this.rpm) * (1 - Math.exp(-dt / p.rpmTau));

    // Irregular combustion: a smoothed random wander of the pitch.
    const amp = this.diesel ? 0.012 : this.bike ? 0.008 : 0.006;
    this.wander = this.wander * Math.exp(-dt / 0.15) + (Math.random() - 0.5) * amp * 2.2 * Math.sqrt(dt / 0.05);
    this.wander = Math.max(-amp * 2, Math.min(amp * 2, this.wander));

    const dopT = dopplerRatio(approachSpeed(v, listener.x, listener.z));
    this.dop += (dopT - this.dop) * (1 - Math.exp(-dt / 0.12));

    const fire = Math.max(8, firingHz(p, this.rpm)) * (1 + this.wander) * this.dop;
    this.lastFireHz = fire;
    const rpmN = clamp01((this.rpm - p.idleRpm) / (p.redRpm - p.idleRpm));
    this.fA.set(fire, 0.03);
    if (this.diesel) {
      this.fB.set(fire * 0.5, 0.03);
      this.fC.set(fire * 2, 0.03);
    } else if (this.bike) {
      this.fB.set(fire * 0.5, 0.02);
      this.fC.set(fire * 2.01, 0.02);
    } else {
      this.fB.set(fire * 0.5, 0.03);
      this.fC.set(fire * 1.006, 0.03);
    }

    const { load, engineBrake } = st;
    const level = engineLevel(p, v.speed, load, engineBrake);
    this.lastLevel = level;
    this.lvl.set(level, 0.08);
    // The lowpass opens with rpm and load; braking engines sound duller.
    const cutoff = this.diesel
      ? 220 + 650 * rpmN + 500 * load
      : this.bike
        ? 1100 + 4200 * rpmN + 900 * load
        : 420 + 1500 * rpmN + 900 * load;
    this.tone.set(cutoff * (1 - 0.25 * engineBrake), 0.06);

    this.intakeF.set(450 + 1100 * rpmN, 0.08);
    const intakeBase = this.diesel ? 0.1 : this.bike ? 0.28 : 0.4;
    this.intakeG.set(intakeBase * Math.pow(load, 1.3) * (0.5 + 0.5 * rpmN), 0.08);

    const tyre = tyreLevel(v.speed, frame.rain);
    this.tyreG.set(tyre * (this.diesel ? 0.9 : this.bike ? 0.5 : 0.7), 0.1);
    this.tyreF.set((330 + v.speed * 42) * (1 + 0.35 * clamp01(frame.rain * 2)), 0.1);

    if (this.diesel) {
      this.lfoF?.set(fire, 0.03);
      this.chatterG?.set(0.07 + 0.1 * load, 0.08);
      this.rumbleG?.set(0.55 * engineBrake, 0.12);
      // Turbo spools up with load and rpm, a faint whistle.
      this.turboF?.set(1500 + 2600 * rpmN, 0.1);
      this.turboG?.set(0.035 * Math.pow(load, 1.5) * rpmN, 0.15);
    }
    if (this.bike) this.formantG?.set(0.28 + 0.2 * rpmN, 0.08);

    // Air-brake psshh when a bus or truck comes to a halt; a short release when it moves off.
    this.hissCooldown = Math.max(0, this.hissCooldown - dt);
    if (this.diesel && this.hissCooldown === 0) {
      if (this.prevSpeed >= 1 && v.speed < 1 && v.braking) {
        this.airBrake(true);
        this.hissCooldown = 4;
      } else if (this.prevSpeed < 0.3 && v.speed >= 0.6 && v.accel > 0.2) {
        this.airBrake(false);
        this.hissCooldown = 4;
      }
    }
    this.prevSpeed = v.speed;

    this.emitter.setPosition(v.x, EMITTER_HEIGHT, v.z);
  }

  /** Air-brake / parking-brake release hiss as a one-shot on this voice. */
  private airBrake(stopping: boolean): void {
    const t = this.ctx.currentTime;
    const loud = (this.cls === 'truck' ? 1 : 0.9) * AIR_BRAKE_LEVEL;
    if (stopping) {
      playNoiseBurst(this.ctx, this.out, { kind: 'white', when: t, attack: 0.02, decay: 0.95, gain: 0.55 * loud, filter: { type: 'highpass', frequency: 3600, frequencyEnd: 2200, q: 0.6 } });
      playNoiseBurst(this.ctx, this.out, { kind: 'white', when: t, attack: 0.03, decay: 0.7, gain: 0.35 * loud, filter: { type: 'bandpass', frequency: 7000, q: 0.8 } });
    } else {
      playNoiseBurst(this.ctx, this.out, { kind: 'white', when: t, attack: 0.01, decay: 0.28, gain: 0.35 * loud, filter: { type: 'highpass', frequency: 3000, frequencyEnd: 2600, q: 0.6 } });
    }
  }

  /** Starts the fade out; destroy() must follow once endTime has passed. */
  release(): void {
    this.fadeParam.set(0, 0.06);
    this.endTime = this.ctx.currentTime + FADE_OUT_S;
  }

  destroy(): void {
    for (const o of this.oscs) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
      o.disconnect();
    }
    for (const l of this.loops) l.stop();
    for (const n of this.nodes) n.disconnect();
    this.emitter.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Indicator relay

class TickVoice implements Voice {
  endTime = 0;
  readonly emitter: Emitter;
  private next: number;
  private tick = true;
  private clicks = 0;

  constructor(private readonly ctx: AudioContext, bus: AudioBus, v: AudioVehicle) {
    this.emitter = bus.createEmitter({ category: 'indicator', x: v.x, y: EMITTER_HEIGHT, z: v.z, refDistance: 2, maxDistance: 80, rolloff: 1.4 });
    this.emitter.setGain(0.5);
    this.next = ctx.currentTime;
  }

  get clickCount(): number {
    return this.clicks;
  }

  update(v: AudioVehicle): void {
    this.emitter.setPosition(v.x, EMITTER_HEIGHT, v.z);
    const now = this.ctx.currentTime;
    const half = 1 / (INDICATOR_HZ * 2);
    if (this.next < now - 0.25) this.next = now; // resync after a stall
    while (this.next <= now + 0.04) {
      this.click(this.next, this.tick);
      this.tick = !this.tick;
      this.next += half;
    }
  }

  /** One relay contact click: a tiny noise snap plus a short high ping. The tock is lower and softer. */
  private click(when: number, tick: boolean): void {
    this.clicks++;
    const dest = this.emitter.input;
    playNoiseBurst(this.ctx, dest, { kind: 'white', when, attack: 0.001, decay: 0.012, gain: tick ? 0.9 : 0.7, filter: { type: 'bandpass', frequency: tick ? 3300 : 2500, q: 2.5 } });
    playTone(this.ctx, dest, { type: 'sine', when, frequency: tick ? 2150 : 1650, attack: 0.001, decay: 0.022, gain: tick ? 0.35 : 0.28 });
  }

  release(): void {
    this.endTime = this.ctx.currentTime + 0.05;
  }

  destroy(): void {
    this.emitter.dispose();
  }
}

// ---------------------------------------------------------------------------------------------------------
// Horns

export interface HornSpec {
  /** Tone frequencies (Hz): car two-tone 400/500, bus and truck 220/277, motorbike a high beep. */
  freqs: readonly [number, number];
  /** [start, duration] of each blow in seconds. */
  pattern: readonly (readonly [number, number])[];
  wave: OscillatorType;
  lowpass: number;
  gain: number;
  attack: number;
  release: number;
  /** Fraction by which the pitch sags during a blow (air horns). */
  sag: number;
  /** Emitter reference distance (louder horns carry further). */
  refDistance: number;
}

/** Chooses the horn sound for a vehicle class; `rand` picks single or double blows. */
export function hornSpec(cls: AudioVehicleClass, rand: () => number): HornSpec {
  switch (cls) {
    case 'bus':
      return { freqs: [220, 277], pattern: [[0, 1.0 + rand() * 0.4]], wave: 'sawtooth', lowpass: 1500, gain: 0.55, attack: 0.07, release: 0.12, sag: 0.025, refDistance: 14 };
    case 'truck':
      return { freqs: [196, 247], pattern: [[0, 1.2 + rand() * 0.5]], wave: 'sawtooth', lowpass: 1300, gain: 0.6, attack: 0.08, release: 0.14, sag: 0.03, refDistance: 16 };
    case 'motorbike':
      return rand() < 0.4
        ? { freqs: [610, 770], pattern: [[0, 0.12], [0.2, 0.12]], wave: 'square', lowpass: 3200, gain: 0.3, attack: 0.008, release: 0.03, sag: 0, refDistance: 6 }
        : { freqs: [610, 770], pattern: [[0, 0.16 + rand() * 0.08]], wave: 'square', lowpass: 3200, gain: 0.3, attack: 0.008, release: 0.03, sag: 0, refDistance: 6 };
    default:
      return rand() < 0.4
        ? { freqs: [400, 500], pattern: [[0, 0.17], [0.27, 0.17]], wave: 'sawtooth', lowpass: 2400, gain: 0.42, attack: 0.012, release: 0.04, sag: 0, refDistance: 9 }
        : { freqs: [400, 500], pattern: [[0, 0.3 + rand() * 0.35]], wave: 'sawtooth', lowpass: 2400, gain: 0.42, attack: 0.012, release: 0.04, sag: 0, refDistance: 9 };
  }
}

interface HornShot {
  endTime: number;
  emitter: Emitter;
}

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
