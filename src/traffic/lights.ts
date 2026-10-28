// Fixed-timing traffic lights. Plain logic, no Three.js.
// Cycle layout (per axis): green, then yellow, then the other axis gets its turn.
// North-south (vertical roads) starts at cycle time 0; east-west (horizontal roads)
// starts after the north-south green and yellow.

import type { TrafficLight, TrafficLightTiming } from '../city/layout';

export type LightPhase = 'green' | 'yellow' | 'red';

/** 'ns' = vertical roads (travel along Z), 'ew' = horizontal roads (travel along X). */
export type LightAxis = 'ns' | 'ew';

export function axisForOrientation(orientation: 'horizontal' | 'vertical'): LightAxis {
  return orientation === 'vertical' ? 'ns' : 'ew';
}

/**
 * Phase of one axis at time `t` seconds. `t` wraps modulo cycleSeconds, so negative
 * and large values are fine. A non-positive cycle means the light is not controlled.
 */
export function lightStateAt(timing: TrafficLightTiming, t: number, axis: LightAxis = 'ns'): LightPhase {
  const cycle = timing.cycleSeconds;
  if (!(cycle > 0)) return 'green';
  let u = t % cycle;
  if (u < 0) u += cycle;

  const start = axis === 'ns' ? 0 : timing.nsGreenSeconds + timing.yellowSeconds;
  const greenEnd = start + (axis === 'ns' ? timing.nsGreenSeconds : timing.ewGreenSeconds);
  const yellowEnd = greenEnd + timing.yellowSeconds;

  if (u >= start && u < greenEnd) return 'green';
  if (u >= greenEnd && u < yellowEnd) return 'yellow';
  return 'red';
}

/** Runs the signal clock for many lights. Call update(dt) once per frame. */
export class TrafficLightController {
  private readonly byId = new Map<string, TrafficLight>();
  private time: number;

  constructor(lights: readonly TrafficLight[], startTime = 0) {
    for (const light of lights) this.byId.set(light.id, light);
    this.time = startTime;
  }

  update(dt: number): void {
    this.time += dt;
  }

  /** Jumps the clock, e.g. for tests or when the scene restarts. */
  setTime(t: number): void {
    this.time = t;
  }

  get elapsed(): number {
    return this.time;
  }

  has(lightId: string): boolean {
    return this.byId.has(lightId);
  }

  /** Current phase for a light on the given axis. Unknown ids count as green (uncontrolled). */
  phaseOf(lightId: string, axis: LightAxis = 'ns'): LightPhase {
    const light = this.byId.get(lightId);
    if (!light) return 'green';
    return lightStateAt(light.timing, this.time, axis);
  }
}
