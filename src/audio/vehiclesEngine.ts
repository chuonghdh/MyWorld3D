// Vehicle sounds: engine voice. Split from vehicles.ts.

import type { AudioBus, Emitter } from './bus';
import type { AudioFrame, AudioVehicle, AudioVehicleClass } from './frame';
import type { ListenerState } from './listener';
import { clamp01, dopplerRatio } from './math';
import { playNoiseBurst, startLoopingNoise } from './synth';
import type { LoopingNoise } from './synth';
import { EMITTER_HEIGHT, FADE_TC, AIR_BRAKE_LEVEL, FADE_OUT_S, ENGINE_PROFILES, engineTarget, firingHz, engineLevel, tyreLevel, approachSpeed, Param, pulseWave } from './vehiclesCore';
import type { EngineProfile, Voice } from './vehiclesCore';

// ---------------------------------------------------------------------------------------------------------
// Engine voice

export class EngineVoice implements Voice {
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
