// Aircraft sound: a distant jet pass for every airliner in the sky. One bus emitter per aircraft (at most two
// voiced), placed at the plane with a long reference distance because it flies 200-300 m up and is heard from
// up to 1 km. The voice is synthesised: a low brown-noise rumble, a broad filtered whoosh and a faint pair of
// detuned turbine whines, with a Doppler-like pitch and filter shift from the radial speed. It fades in and out.

import type { AudioFrame, AudioAircraft, SoundSystemFactory } from './frame';
import { VoiceBudget, type Emitter, type AudioBus } from './bus';
import { dopplerRatio } from './math';
import { makeNoiseBuffer } from './synth';
import { audio as audioTuning } from '../config/tuning';

/** Simultaneous voiced aircraft. */
export const AIRCRAFT_MAX_VOICES = 2;
/** Emitter distance model: flat gain out to REF, then inverse falloff to MAX (metres). */
export const AIRCRAFT_REF_DISTANCE = 250;
export const AIRCRAFT_MAX_DISTANCE = 2500;
/** Fade times (s) when a voice starts and ends. */
export const FADE_IN_S = 3;
export const FADE_OUT_S = 2.5;
/** Overall voice level before the distance model: low, this is a high-altitude airliner. */
export const JET_GAIN = audioTuning.jetGain;

/** Pitch/filter ratio from the radial speed between the listener and a plane (approaching = higher). */
export function jetDoppler(
  listener: { x: number; y: number; z: number },
  a: Pick<AudioAircraft, 'x' | 'y' | 'z' | 'vx' | 'vy' | 'vz'>,
): number {
  const dx = a.x - listener.x;
  const dy = a.y - listener.y;
  const dz = a.z - listener.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-3) return 1;
  // Positive when the plane closes in on the listener.
  const approach = -(dx * a.vx + dy * a.vy + dz * a.vz) / d;
  return dopplerRatio(approach);
}

export interface JetVoice {
  /** Pitch and filter shift, 0.85..1.15 (1 = no shift). */
  setDoppler(ratio: number): void;
  /** Voice level 0..1 (the fade). */
  setLevel(level: number): void;
  stop(): void;
}

const WHINE_A = 780;
const WHINE_B = 1010;
const WHOOSH_HZ = 1100;
const RUMBLE_HZ = 260;

/** Builds one jet voice into `dest`. Works on a live or an offline context. */
export function buildJetVoice(ctx: BaseAudioContext, dest: AudioNode): JetVoice {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(dest);

  const loops: AudioBufferSourceNode[] = [];
  const nodes: AudioNode[] = [out];
  const noise = (kind: 'brown' | 'pink', seconds: number): AudioBufferSourceNode => {
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, seconds, kind);
    src.loop = true;
    src.start(0, Math.random() * seconds);
    loops.push(src);
    return src;
  };

  // Low rumble.
  const rumbleSrc = noise('brown', 3);
  const rumbleLp = ctx.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.frequency.value = RUMBLE_HZ;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.55;
  rumbleSrc.connect(rumbleLp);
  rumbleLp.connect(rumbleGain);
  rumbleGain.connect(out);

  // Broad whoosh.
  const whooshSrc = noise('pink', 2);
  const whooshBp = ctx.createBiquadFilter();
  whooshBp.type = 'bandpass';
  whooshBp.frequency.value = WHOOSH_HZ;
  whooshBp.Q.value = 0.5;
  const whooshGain = ctx.createGain();
  whooshGain.gain.value = 0.3;
  whooshSrc.connect(whooshBp);
  whooshBp.connect(whooshGain);
  whooshGain.connect(out);

  // Faint turbine whine: two detuned sines whose level drifts slowly.
  const whineGain = ctx.createGain();
  whineGain.gain.value = 0.012;
  const oscA = ctx.createOscillator();
  oscA.type = 'sine';
  oscA.frequency.value = WHINE_A;
  const oscB = ctx.createOscillator();
  oscB.type = 'sine';
  oscB.frequency.value = WHINE_B;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.17;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.008;
  lfo.connect(lfoDepth);
  lfoDepth.connect(whineGain.gain);
  oscA.connect(whineGain);
  oscB.connect(whineGain);
  whineGain.connect(out);
  oscA.start();
  oscB.start();
  lfo.start();
  nodes.push(rumbleLp, rumbleGain, whooshBp, whooshGain, whineGain, lfoDepth);

  const glide = (p: AudioParam, v: number): void => {
    if (typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, ctx.currentTime, 0.2);
    else p.value = v;
  };
  let stopped = false;
  return {
    setDoppler(r) {
      if (stopped || !Number.isFinite(r)) return;
      for (const l of loops) glide(l.playbackRate, r);
      glide(oscA.frequency, WHINE_A * r);
      glide(oscB.frequency, WHINE_B * r);
      glide(whooshBp.frequency, WHOOSH_HZ * r * r);
      glide(rumbleLp.frequency, RUMBLE_HZ * r);
    },
    setLevel(level) {
      if (stopped) return;
      const g = JET_GAIN * Math.min(1, Math.max(0, level));
      if (typeof out.gain.setTargetAtTime === 'function') out.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
      else out.gain.value = g;
    },
    stop() {
      if (stopped) return;
      stopped = true;
      for (const s of [...loops, oscA, oscB, lfo]) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
        s.disconnect();
      }
      for (const n of [...nodes, whooshSrc, rumbleSrc, oscA, oscB, lfo]) n.disconnect();
    },
  };
}

interface Voice {
  emitter: Emitter;
  jet: JetVoice;
  level: number;
  dying: boolean;
}

export const createAircraftSounds: SoundSystemFactory = (ctx, bus: AudioBus) => {
  const live = new Map<number | string, Voice>();
  const dying: Voice[] = [];
  const candidates: { key: number; distance: number; item: AudioAircraft }[] = [];

  const budget = new VoiceBudget<AudioAircraft>({
    max: AIRCRAFT_MAX_VOICES,
    maxDistance: 3000,
    onAcquire(key, a) {
      const emitter = bus.createEmitter({
        category: 'aircraft',
        x: a.x,
        y: a.y,
        z: a.z,
        refDistance: AIRCRAFT_REF_DISTANCE,
        maxDistance: AIRCRAFT_MAX_DISTANCE,
        rolloff: 1,
      });
      const jet = buildJetVoice(ctx, emitter.input);
      live.set(key, { emitter, jet, level: 0, dying: false });
    },
    onRelease(key) {
      const v = live.get(key);
      if (!v) return;
      live.delete(key);
      v.dying = true;
      dying.push(v);
    },
  });

  const finish = (v: Voice): void => {
    v.jet.stop();
    v.emitter.dispose();
  };

  return {
    name: 'aircraft',
    update(frame: AudioFrame) {
      // Paused or frozen time: nothing starts, nothing changes.
      if (!(frame.dt > 0)) return;
      const list = frame.aircraft ?? [];
      const l = frame.listener;
      candidates.length = 0;
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (!Number.isFinite(a.x + a.y + a.z)) continue;
        candidates.push({ key: a.id, distance: Math.hypot(a.x - l.x, a.y - l.y, a.z - l.z), item: a });
      }
      budget.update(candidates);

      for (const [, v] of live) {
        v.level = Math.min(1, v.level + frame.dt / FADE_IN_S);
        v.jet.setLevel(v.level);
      }
      for (const c of candidates) {
        const v = live.get(c.key);
        if (!v) continue;
        v.emitter.setPosition(c.item.x, c.item.y, c.item.z);
        v.jet.setDoppler(jetDoppler(l, c.item));
      }
      for (let i = dying.length - 1; i >= 0; i--) {
        const v = dying[i];
        v.level = Math.max(0, v.level - frame.dt / FADE_OUT_S);
        v.jet.setLevel(v.level);
        if (v.level <= 0) {
          dying.splice(i, 1);
          finish(v);
        }
      }
    },
    dispose() {
      budget.clear();
      for (const v of dying.splice(0)) finish(v);
      for (const [, v] of live) finish(v);
      live.clear();
    },
  };
};
