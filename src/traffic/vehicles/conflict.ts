// Body geometry: where a vehicle must stop for another vehicle ahead, and the swept footprint.

import { VARIANT_FOOTPRINT, obbOverlap } from '../collision';
import type { ConnectorInfo, PathModel, Vehicle } from './types';
import { SIDE_MARGIN, END_MARGIN, SWEEP_STEP, SWEEP_MAX, COMFORT_DECEL } from './constants';
import { poseAt } from './geometry';
import { junctionAt } from './junctions';
import type { VehicleSystem } from '../vehicles';

/** Updates the cached world position and junction of a vehicle; notes when it enters a junction. */
export function syncPose(sys: VehicleSystem, pm: PathModel, v: Vehicle): void {
  poseAt(pm, v.s, sys.pose);
  v.x = sys.pose.x;
  v.z = sys.pose.z;
  const j = junctionAt(sys, v.x, v.z);
  if (j >= 0 && v.junctionIdx < 0) v.entryOrder = ++sys.entrySeq;
  v.junctionIdx = j;
  v.inJunction = j >= 0;
}

/**
 * Looks along the vehicle's own path for a vehicle of another path whose body its footprint would hit,
 * and returns the arc length (of the centre) it must stop at, or -1 when the way is clear.
 * This is the last line of defence behind the signals and the junction rule: every vehicle stops for any
 * body in its way. A vehicle already touching another is not stopped by it, so overlaps can separate
 * instead of locking up.
 */
export function conflictLimit(sys: VehicleSystem, pm: PathModel, v: Vehicle): number {
  const foot = VARIANT_FOOTPRINT[v.variant] ?? VARIANT_FOOTPRINT[0];
  const reach = Math.min(SWEEP_MAX, (v.speed * v.speed) / (2 * COMFORT_DECEL) + v.speed * 0.3 + 4);
  const near = reach + foot.length / 2 + 12;
  const near2 = near * near;
  let result = -1;
  sys.blocker = null;
  let sweepCount = -1; // built lazily, only when some other vehicle is near

  for (let mi = 0; mi < sys.models.length; mi++) {
    const other = sys.models[mi];
    if (other === pm) continue;
    for (let k = 0; k < other.list.length; k++) {
      const w = other.list[k];
      const dx = w.x - v.x;
      const dz = w.z - v.z;
      if (dx * dx + dz * dz > near2) continue;

      // Who goes first: whoever entered a junction first; one inside goes before one outside; else lower id.
      const vOrder = v.inJunction ? v.entryOrder : Infinity;
      const wOrder = w.inJunction ? w.entryOrder : Infinity;
      const vFirst = vOrder !== wOrder ? vOrder < wOrder : v.id < w.id;
      if (sweepCount < 0) sweepCount = buildSweep(sys, pm, v, foot, reach);
      const wf = VARIANT_FOOTPRINT[w.variant] ?? VARIANT_FOOTPRINT[0];
      const b = sys.otherBox;
      b.x = w.x;
      b.z = w.z;
      b.heading = w.heading;
      b.halfLength = wf.length / 2;
      b.halfWidth = wf.width / 2;
      for (let i = 0; i < sweepCount; i++) {
        if (!obbOverlap(sys.sweep[i], b)) continue;
        // The vehicle that goes first does not wait for one that must give way to it, unless that one
        // stands right in its way (nobody drives through a body).
        if (vFirst && (w.speed >= 0.2 || i > 3)) break;
        // i == 0 means w is within the clearance margin right now. If the bodies really touch, let them
        // separate; otherwise hold still until w has gone.
        if (i === 0 && obbOverlap(sys.ownBox, b)) break;
        const limit = i === 0 ? v.s : limitAlong(sys, pm, v, sys.sweepD[i - 1]);
        if (result < 0 || limit < result) {
          result = limit;
          sys.blocker = w;
        }
        break;
      }
    }
  }
  return result;
}

/** Pose d metres ahead of the vehicle along its route: its path, then the planned turn, then the road it joins. */
export function routePose(sys: VehicleSystem, pm: PathModel, v: Vehicle, d: number): void {
  if (pm.conn) {
    const rem = pm.length - v.s;
    if (d <= rem) poseAt(pm, v.s + d, sys.pose);
    else poseAt(sys.models[pm.conn.to], pm.conn.exitS + (d - rem), sys.pose);
    return;
  }
  if (v.plan >= 0) {
    const conn = sys.models[v.plan];
    const ci = conn.conn as ConnectorInfo;
    const toEntry = v.planEntryS - v.s;
    if (d <= toEntry) {
      poseAt(pm, v.s + d, sys.pose);
    } else {
      const d2 = d - toEntry;
      if (d2 <= conn.length) poseAt(conn, d2, sys.pose);
      else poseAt(sys.models[ci.to], ci.exitS + (d2 - conn.length), sys.pose);
    }
    return;
  }
  poseAt(pm, Math.min(v.s + d, pm.length), sys.pose);
}

/** Arc length on the vehicle's own model that matches a point d metres ahead on its route (the stop limit). */
export function limitAlong(_sys: VehicleSystem, pm: PathModel, v: Vehicle, d: number): number {
  if (pm.conn) return v.s + Math.min(d, Math.max(0, pm.length - v.s - 0.01));
  if (v.plan >= 0 && d > v.planEntryS - v.s) return Math.max(v.s, v.planEntryS - 0.1);
  return v.s + d;
}

/** Fills this.sweep with the vehicle's footprint at points along its path ahead. Returns how many. */
export function buildSweep(sys: VehicleSystem, pm: PathModel, v: Vehicle, foot: { length: number; width: number }, reach: number): number {
  let n = 0;
  const own = sys.ownBox;
  own.x = v.x;
  own.z = v.z;
  own.heading = v.heading;
  own.halfLength = foot.length / 2;
  own.halfWidth = foot.width / 2;
  for (let d = 0; d <= reach; d += SWEEP_STEP) {
    routePose(sys, pm, v, d);
    let box = sys.sweep[n];
    if (!box) {
      box = { x: 0, z: 0, heading: 0, halfLength: 0, halfWidth: 0 };
      sys.sweep[n] = box;
    }
    box.x = sys.pose.x;
    box.z = sys.pose.z;
    // The vehicle's own (smoothed) heading is used where it stands; the path tangent further ahead.
    box.heading = d === 0 ? v.heading : sys.pose.heading;
    box.halfLength = foot.length / 2 + END_MARGIN;
    box.halfWidth = foot.width / 2 + SIDE_MARGIN;
    sys.sweepD[n] = d;
    n++;
  }
  return n;
}
