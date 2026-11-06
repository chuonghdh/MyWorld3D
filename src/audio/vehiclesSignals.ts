// Vehicle sounds: indicator relay and horns. Split from vehicles.ts.

import type { AudioBus, Emitter } from './bus';
import type { AudioVehicle, AudioVehicleClass } from './frame';
import { playNoiseBurst, playTone } from './synth';
import { INDICATOR_HZ, EMITTER_HEIGHT } from './vehiclesCore';
import type { Voice } from './vehiclesCore';

// ---------------------------------------------------------------------------------------------------------
// Indicator relay

export class TickVoice implements Voice {
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

export interface HornShot {
  endTime: number;
  emitter: Emitter;
}
