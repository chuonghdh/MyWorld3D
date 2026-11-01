// Rain pit-pat: a pool of ground-level drop emitters scattered around the listener (3..60 m), each making
// individual drop events with a surface timbre (the dull 'độp' of a drop on a tin roof, and quiet puddle plips),
// scheduled ahead on the AudioContext clock. A few low-level positional noise emitters far away fill the
// density in heavy rain. Also hosts the positional thunder system (weather.ts) so one registry entry
// covers all weather sound.

import type { AudioBus, Emitter } from './bus';
import type { AudioFrame, SoundSystem, SoundSystemFactory } from './frame';
import { createRandom, playNoiseBurst, playTone, startLoopingNoise, type LoopingNoise } from './synth';
import { createThunderSounds } from './weather';
import { audio as audioTuning } from '../config/tuning';

export type RainSurface = 'tin' | 'puddle';

/** Puddle plips are kept quiet: this share of their original level. */
export const PUDDLE_LEVEL = audioTuning.puddleLevel;

export const RAIN_ON = 0.05;
export const MAX_DROP_EMITTERS = audioTuning.maxDropEmitters;
export const BED_EMITTERS = audioTuning.bedEmitters;
/** Events are scheduled this far ahead of the audio clock (s). */
export const LOOKAHEAD = 0.18;
const MAX_EVENTS_PER_EMITTER_PER_FRAME = 8;
const MIN_RADIUS = 3;
const MAX_RADIUS = 60;

/** How many drop emitters are active for a rain level: light rain few, storm all ten. 0 below RAIN_ON. */
export function activeEmitterCount(rain: number): number {
  if (!(rain > RAIN_ON)) return 0;
  return Math.min(MAX_DROP_EMITTERS, 3 + Math.round(7 * Math.min(1, rain)));
}

/** Drop events per second for ONE emitter. Light rain ~1/s, storm ~9/s (about 90/s over ten emitters). */
export function dropRatePerEmitter(rain: number): number {
  const r = Math.min(1, Math.max(0, rain));
  return 0.8 + 8.2 * Math.pow(r, 1.3);
}

/** Total event density (events per second) for a rain level. */
export function totalDropRate(rain: number): number {
  return activeEmitterCount(rain) * dropRatePerEmitter(rain);
}

/** Surface mix: mostly tin roof; puddles only exist once it has rained a while (rain > 0.25). Weights sum to 1. */
export function surfaceWeights(rain: number): Record<RainSurface, number> {
  const puddle = rain > 0.25 ? 0.18 : 0;
  return { tin: 1 - puddle, puddle };
}

export function pickSurface(rain: number, u: number): RainSurface {
  const w = surfaceWeights(rain);
  return u < w.tin ? 'tin' : 'puddle';
}

/** Radius from the listener: squared so that closer drops are more numerous (and, via the panner, louder). */
export function dropRadius(u: number): number {
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * u * u;
}

interface DropEmitter {
  emitter: Emitter;
  surface: RainSurface;
  /** Offset from the listener (m). */
  ox: number;
  oz: number;
  y: number;
  next: number;
  /** Seconds until the emitter is re-seated at a new random spot. */
  reseat: number;
}

function surfaceHeight(s: RainSurface, rand: () => number): number {
  return s === 'tin' ? 3 + rand() * 2 : 0.05; // roof / awning edge, or the ground
}

/** Plays one drop. `size` 0..1 (random), `rain` 0..1 sets hardness. */
export function playDrop(
  ctx: AudioContext,
  dest: AudioNode,
  surface: RainSurface,
  when: number,
  size: number,
  rain: number,
  rand: () => number,
): void {
  const level = (0.18 + 0.5 * size) * (0.45 + 0.55 * rain);
  if (surface === 'puddle') {
    const f = 420 + 900 * (1 - size) + rand() * 250; // big drops give lower plips
    playTone(ctx, dest, {
      type: 'sine', when, attack: 0.002, decay: 0.05 + 0.08 * size,
      frequency: f, frequencyEnd: f * 1.7, gain: level * 0.9 * PUDDLE_LEVEL,
    });
    playNoiseBurst(ctx, dest, {
      kind: 'white', when, attack: 0.001, decay: 0.008,
      gain: level * 0.25 * PUDDLE_LEVEL, filter: { type: 'highpass', frequency: 3000 },
    });
    return;
  }
  // Tin roof: a drop strikes a taut sheet. A dull thud around 300-700 Hz with a short low ring, and only a
  // trace of metallic tick above it: the bright high ping that read as drops on glass is gone.
  const body = 320 + rand() * 380;
  playNoiseBurst(ctx, dest, {
    kind: 'pink', when, attack: 0.0015, decay: 0.035 + 0.05 * size,
    gain: level * 1.5, filter: { type: 'bandpass', frequency: body, q: 2.5 },
  });
  playTone(ctx, dest, {
    type: 'sine', when, attack: 0.001, decay: 0.045 + 0.05 * size,
    frequency: body * 0.62, frequencyEnd: body * 0.5, gain: level * 0.55,
  });
  playNoiseBurst(ctx, dest, {
    kind: 'white', when, attack: 0.0008, decay: 0.012,
    gain: level * 0.12, filter: { type: 'bandpass', frequency: 1800 + rand() * 600, q: 1.2 },
  });
}

export function createRainSystem(ctx: AudioContext, bus: AudioBus, rand: () => number = createRandom()): SoundSystem & {
  readonly dropEmitters: number;
  readonly bedEmitters: number;
} {
  const drops: DropEmitter[] = [];
  const bed: { emitter: Emitter; noise: LoopingNoise; filters: AudioNode[]; ox: number; oz: number }[] = [];
  let idle = 0;

  function seat(d: DropEmitter): void {
    const a = rand() * Math.PI * 2;
    const r = dropRadius(rand());
    d.ox = Math.cos(a) * r;
    d.oz = Math.sin(a) * r;
    d.reseat = 5 + rand() * 6;
  }

  function addDrop(rain: number): void {
    const surface = pickSurface(rain, rand());
    const y = surfaceHeight(surface, rand);
    const emitter = bus.createEmitter({ category: 'rain', x: 0, y, z: 0, refDistance: 4, maxDistance: 90, rolloff: 0.75 });
    const d: DropEmitter = { emitter, surface, ox: 0, oz: 0, y, next: ctx.currentTime + rand() * 0.2, reseat: 0 };
    seat(d);
    drops.push(d);
  }

  function removeDrop(): void {
    const d = drops.pop();
    d?.emitter.dispose();
  }

  function ensureBed(): void {
    if (bed.length) return;
    for (let i = 0; i < BED_EMITTERS; i++) {
      const a = ((i + rand() * 0.6) / BED_EMITTERS) * Math.PI * 2;
      const r = 45 + rand() * 60;
      const emitter = bus.createEmitter({
        category: 'rain', x: 0, y: 2, z: 0, refDistance: 25, maxDistance: 220, rolloff: 0.5,
      });
      emitter.setGain(0);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2800 + rand() * 1800;
      bp.Q.value = 0.35;
      bp.connect(emitter.input);
      const noise = startLoopingNoise(ctx, bp, 'pink', 2);
      bed.push({ emitter, noise, filters: [bp], ox: Math.cos(a) * r, oz: Math.sin(a) * r });
    }
  }

  function clearBed(): void {
    for (const b of bed) {
      b.noise.stop();
      for (const f of b.filters) f.disconnect();
      b.emitter.dispose();
    }
    bed.length = 0;
  }

  function clearAll(): void {
    while (drops.length) removeDrop();
    clearBed();
  }

  return {
    name: 'rain',
    get dropEmitters() {
      return drops.length;
    },
    get bedEmitters() {
      return bed.length;
    },
    update(frame: AudioFrame) {
      const rain = Number.isFinite(frame.rain) ? Math.min(1, Math.max(0, frame.rain)) : 0;
      const dt = Number.isFinite(frame.dt) ? Math.min(0.5, Math.max(0, frame.dt)) : 0.016;
      const L = frame.listener;
      const now = ctx.currentTime;

      if (rain <= RAIN_ON) {
        // Stop scheduling; fade, then free everything after a short tail.
        if (drops.length || bed.length) {
          idle += dt;
          for (const b of bed) b.emitter.setGain(0);
          if (idle > 0.5) {
            clearAll();
            idle = 0;
          }
        }
        return;
      }
      idle = 0;

      const want = activeEmitterCount(rain);
      while (drops.length < want) addDrop(rain);
      while (drops.length > want) removeDrop();
      ensureBed();

      const rate = dropRatePerEmitter(rain);
      for (const d of drops) {
        d.reseat -= dt;
        if (d.reseat <= 0) seat(d);
        d.emitter.setPosition(L.x + d.ox, d.y, L.z + d.oz);
        if (d.next < now - 0.3) d.next = now; // stalled (tab hidden): do not burst
        let n = 0;
        while (d.next < now + LOOKAHEAD && n++ < MAX_EVENTS_PER_EMITTER_PER_FRAME) {
          const when = Math.max(d.next, now);
          // Drop sizes: many small, a few big (u^2).
          const u = rand();
          playDrop(ctx, d.emitter.input, d.surface, when, u * u, rain, rand);
          d.next += -Math.log(1 - rand() * 0.999) / rate; // Poisson process
        }
      }
      const bedGain = 0.05 * rain * rain;
      for (const b of bed) {
        b.emitter.setPosition(L.x + b.ox, 2, L.z + b.oz);
        b.emitter.setGain(bedGain);
      }
    },
    dispose() {
      clearAll();
    },
  };
}

export const createRainSounds: SoundSystemFactory = (ctx, bus): SoundSystem => {
  const rain = createRainSystem(ctx, bus);
  const thunder = createThunderSounds(ctx, bus);
  return {
    name: 'rain',
    update(frame) {
      rain.update(frame);
      thunder.update(frame);
    },
    dispose() {
      rain.dispose();
      thunder.dispose();
    },
  };
};
