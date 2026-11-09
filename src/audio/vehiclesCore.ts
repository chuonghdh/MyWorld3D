// Vehicle sounds: tunables, engine model (pure) and shared Web Audio helpers. Split from vehicles.ts.

import type { AudioVehicle, AudioVehicleClass } from './frame';
import { clamp01 } from './math';
import { audio as audioTuning } from '../config/tuning';

// ---------------------------------------------------------------------------------------------------------
// Tunables

export const ENGINE_VOICES = audioTuning.engineVoices;
export const ENGINE_MAX_DISTANCE = audioTuning.engineMaxDistanceM;
export const INDICATOR_VOICES = audioTuning.indicatorVoices;
export const INDICATOR_MAX_DISTANCE = audioTuning.indicatorMaxDistanceM;
/** Relay rate of the indicator (tick + tock pairs per second). */
export const INDICATOR_HZ = audioTuning.indicatorHz;
export const HORN_MAX_DISTANCE = audioTuning.hornMaxDistanceM;
export const HORN_MAX_CONCURRENT = audioTuning.hornMaxConcurrent;
export const EMITTER_HEIGHT = 1;
export const FADE_TC = 0.07;
/** Level of the air-brake hiss relative to the first version (turned down to 70 %). */
export const AIR_BRAKE_LEVEL = audioTuning.airBrakeLevel;

/** Seconds a released voice keeps running (while fading to silence) before its nodes are torn down. */
export const FADE_OUT_S = audioTuning.vehiclesFadeOutS;

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
export class Param {
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

export const pulseCache = new WeakMap<BaseAudioContext, PeriodicWave | null>();

/** Narrow pulse wave (duty ~16 %): the lumpy, low "pulse train" of a diesel. Null when unsupported. */
export function pulseWave(ctx: BaseAudioContext): PeriodicWave | null {
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

export interface Voice {
  /** Context time after which a released voice can be destroyed. */
  endTime: number;
  release(): void;
  destroy(): void;
}
