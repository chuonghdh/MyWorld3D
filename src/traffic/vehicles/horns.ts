// Horn requests: per-vehicle cooldown, city-wide gap, coin flip, and the queue read by the audio layer.

import type { VehicleSystem } from '../vehicles';
import type { HornEvent, Vehicle } from './types';
import { HORN_COOLDOWN_S, HORN_GLOBAL_GAP_S, HORN_CHANCE, HORN_QUEUE_MAX } from './constants';

/**
 * Horn requests raised since the last call. The returned array and its records are reused: read them now and do
 * not keep references. Reading clears the queue.
 */
export function takeHorns(sys: VehicleSystem): readonly HornEvent[] {
  const out = sys.hornOut;
  out.length = 0;
  for (let i = 0; i < sys.hornQueueLen; i++) out.push(sys.hornQueue[i]);
  sys.hornQueueLen = 0;
  return out;
}

/** Queues a horn for v, subject to the per-vehicle cooldown, the city-wide gap and a coin flip (see HORN_*). */
export function tryHorn(sys: VehicleSystem, v: Vehicle): void {
  const now = sys.hornClock;
  if (now - v.lastHornAt < HORN_COOLDOWN_S) return;
  if (now - sys.lastHornGlobal < HORN_GLOBAL_GAP_S) return;
  if (sys.hornQueueLen >= HORN_QUEUE_MAX) return;
  if (sys.hornRng() >= HORN_CHANCE) {
    v.lastHornAt = now - HORN_COOLDOWN_S + 10; // reconsiders in 10 s rather than on the very next frame
    return;
  }
  v.lastHornAt = now;
  sys.lastHornGlobal = now;
  let e = sys.hornQueue[sys.hornQueueLen];
  if (!e) {
    e = { x: 0, z: 0, cls: 'car' };
    sys.hornQueue[sys.hornQueueLen] = e;
  }
  e.x = v.x;
  e.z = v.z;
  e.cls = v.cls;
  sys.hornQueueLen++;
}
