// Spawning, vehicle classes and variants, and removal of finished vehicles.

import type { VehicleClass } from '../../audio';
import { CLASS_VARIANTS } from './variants';
import { VARIANT_FOOTPRINT, obbOverlap } from '../collision';
import type { PathModel, Vehicle } from './types';
import { VEHICLE_SPECS, SIDE_MARGIN, END_MARGIN, SPAWN_MIN_S, SPAWN_MAX_S, HEADING_LOOKAHEAD, CLASS_ORDER, CLASS_FOOTPRINT } from './constants';
import { poseAt } from './geometry';
import { junctionAt } from './junctions';
import type { VehicleSystem } from '../vehicles';

export function create(sys: VehicleSystem, pathIndex: number, s: number, cls: VehicleClass, speedFrac: number): Vehicle {
  const spec = VEHICLE_SPECS[cls];
  const pm = sys.models[pathIndex];
  const v = sys.pool.pop() ?? ({} as Vehicle);
  v.id = sys.nextId++;
  v.pathIndex = pathIndex;
  v.s = s;
  v.cls = cls;
  v.variant = pickVariant(sys, cls);
  v.tint = sys.rng();
  v.speedFactor = spec.speedVar[0] + sys.rng() * (spec.speedVar[1] - spec.speedVar[0]);
  v.speed = spec.cruiseSpeed * v.speedFactor * speedFrac;
  v.odo = 0;
  poseAt(pm, Math.min(s + HEADING_LOOKAHEAD, pm.length), sys.pose);
  v.heading = sys.pose.heading;
  v.yawRate = 0;
  v.accel = 0;
  v.holding = false;
  v.braking = false;
  v.indicator = 0;
  poseAt(pm, s, sys.pose);
  v.x = sys.pose.x;
  v.z = sys.pose.z;
  v.junctionIdx = junctionAt(sys, v.x, v.z);
  v.inJunction = v.junctionIdx >= 0;
  v.plan = -1;
  v.planEntryS = 0;
  v.decided = -1;
  v.stamp = -1;
  v.heldFor = 0;
  v.ghost = 0;
  v.backupLeft = 0;
  v.backedUp = false;
  v.granted = -1;
  v.grantAt = 0;
  v.enteredJ = -1;
  v.waitJ = -1;
  v.waitSince = 0;
  v.reqLine = null;
  v.grantWait = false;
  v.standT = 0;
  v.legitWait = false;
  v.pedHold = false;
  v.pedHeldT = 0;
  v.lastHornAt = -Infinity;
  v.entryOrder = v.junctionIdx >= 0 ? ++sys.entrySeq : 0;
  // Insert keeping the list sorted by s, largest first.
  let i = 0;
  while (i < pm.list.length && pm.list[i].s > s) i++;
  pm.list.push(v);
  for (let j = pm.list.length - 1; j > i; j--) pm.list[j] = pm.list[j - 1];
  pm.list[i] = v;
  sys.total++;
  return v;
}

export function release(sys: VehicleSystem, v: Vehicle): void {
  sys.pool.push(v);
}

export function trySpawns(sys: VehicleSystem, dt: number): void {
  for (let pi = 0; pi < sys.models.length; pi++) {
    const pm = sys.models[pi];
    for (let k = 0; k < pm.spawns.length; k++) {
      const sp = pm.spawns[k];
      sp.timer -= dt;
      if (sp.timer > 0) continue;
      // Spawn rate scales with the multiplier and the time-of-day density (1 when no clock is given).
      sp.timer = (SPAWN_MIN_S + sys.rng() * (SPAWN_MAX_S - SPAWN_MIN_S)) / (Math.max(0.25, sys.multiplier) * sys.density);
      // The active count is held to the density share of the cap, so at night vehicles leave and are not replaced.
      if (sys.total >= sys.capacity * sys.density) continue;
      const cls = pickClass(sys);
      if (!isFree(sys, pm, sp.s, cls)) continue;
      create(sys, pi, sp.s, cls, 0.6);
    }
  }
}

/** True if no vehicle on the path is too close to arc length s for a vehicle of class cls. */
export function isFree(sys: VehicleSystem, pm: PathModel, s: number, cls: VehicleClass): boolean {
  const spec = VEHICLE_SPECS[cls];
  for (let i = 0; i < pm.list.length; i++) {
    const v = pm.list[i];
    const required = (VEHICLE_SPECS[v.cls].length + spec.length) / 2 + Math.max(spec.gap, VEHICLE_SPECS[v.cls].gap);
    if (Math.abs(v.s - s) < required) return false;
  }
  // Spawn points can lie inside a junction: never appear there, on top of the crossing traffic.
  const foot = CLASS_FOOTPRINT[cls];
  poseAt(pm, s, sys.pose);
  if (junctionAt(sys, sys.pose.x, sys.pose.z) >= 0) return false;
  const box = sys.ownBox;
  box.x = sys.pose.x;
  box.z = sys.pose.z;
  box.heading = sys.pose.heading;
  box.halfLength = foot.length / 2 + END_MARGIN + 1;
  box.halfWidth = foot.width / 2 + SIDE_MARGIN;
  const b = sys.otherBox;
  for (let mi = 0; mi < sys.models.length; mi++) {
    const other = sys.models[mi];
    if (other === pm) continue;
    for (let k = 0; k < other.list.length; k++) {
      const w = other.list[k];
      if (Math.abs(w.x - box.x) > 30 || Math.abs(w.z - box.z) > 30) continue;
      const wf = VARIANT_FOOTPRINT[w.variant] ?? VARIANT_FOOTPRINT[0];
      b.x = w.x;
      b.z = w.z;
      b.heading = w.heading;
      b.halfLength = wf.length / 2;
      b.halfWidth = wf.width / 2;
      if (obbOverlap(box, b)) return false;
    }
  }
  return true;
}

export function pickClass(sys: VehicleSystem): VehicleClass {
  const r = sys.rng();
  let acc = 0;
  for (const cls of CLASS_ORDER) {
    acc += VEHICLE_SPECS[cls].weight;
    if (r < acc) return cls;
  }
  return 'car';
}

export function pickVariant(sys: VehicleSystem, cls: VehicleClass): number {
  const options = CLASS_VARIANTS[cls];
  const r = sys.rng();
  let acc = 0;
  for (const o of options) {
    acc += o.weight;
    if (r < acc) return o.variant;
  }
  return options[options.length - 1].variant;
}
