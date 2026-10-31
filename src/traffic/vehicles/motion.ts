// Per-step motion: following, stop lines, the advance step and jam resolution.

import type { ConnectorInfo, PathModel, Vehicle } from './types';
import { VEHICLE_SPECS, HELD_BACKUP_S, BACKUP_DIST, BACK_SPEED, GHOST_S, STUCK_PUSH_S, HORN_PED_HOLD_S, HORN_HARD_BRAKE, HORN_HARD_BRAKE_RATE, JUNCTION_SPEED, COMFORT_DECEL, MAX_DECEL, COMMIT_MIN_SPEED, FILLET_MAX, HEADING_LOOKAHEAD, HEADING_GAIN, MAX_YAW_RATE } from './constants';
import { poseAt, wrapAngle } from './geometry';
import { gateOpen } from './junctions';
import { decideTurn } from './turns';
import { syncPose, conflictLimit } from './conflict';
import type { VehicleSystem } from '../vehicles';

/** Moves a vehicle from one model's list to another's at arc length s, keeping the target sorted. */
export function transfer(sys: VehicleSystem, v: Vehicle, from: Vehicle[], index: number, toModel: number, s: number): void {
  from.splice(index, 1);
  const to = sys.models[toModel];
  v.pathIndex = toModel;
  v.s = s;
  v.plan = -1;
  v.decided = -1;
  v.stamp = sys.stepNo;
  let i = 0;
  while (i < to.list.length && to.list[i].s > s) i++;
  to.list.push(v);
  for (let j = to.list.length - 1; j > i; j--) to.list[j] = to.list[j - 1];
  to.list[i] = v;
}

/** Two vehicles have been jammed for a while: the later one backs up once; if that is not enough, the earlier one pushes on. */
export function resolveJam(sys: VehicleSystem, v: Vehicle, w: Vehicle): void {
  const vOrder = v.inJunction ? v.entryOrder : Infinity;
  const wOrder = w.inJunction ? w.entryOrder : Infinity;
  const later = vOrder !== wOrder ? (vOrder > wOrder ? v : w) : v.id > w.id ? v : w;
  v.heldFor = 0;
  sys.tryHorn(v);
  if (!later.backedUp) {
    later.backedUp = true;
    later.backupLeft = BACKUP_DIST;
  } else {
    v.ghost = GHOST_S;
  }
}

/** True when no vehicle on the same path stands within `need` metres behind v. */
export function roomBehind(_sys: VehicleSystem, pm: PathModel, v: Vehicle, need: number): boolean {
  for (let i = 0; i < pm.list.length; i++) {
    const w = pm.list[i];
    if (w === v || w.s >= v.s) continue;
    if (v.s - w.s - (VEHICLE_SPECS[v.cls].length + VEHICLE_SPECS[w.cls].length) / 2 < need) return false;
  }
  return true;
}

export function advance(sys: VehicleSystem, pm: PathModel, v: Vehicle, leader: Vehicle | null, dt: number): void {
  const spec = VEHICLE_SPECS[v.cls];
  const oldSpeed = v.speed;

  // Backing up out of a jam: a short crawl in reverse, if nothing is right behind.
  if (v.backupLeft > 0) {
    const d = Math.min(v.backupLeft, BACK_SPEED * dt, v.s);
    if (d <= 0 || !roomBehind(sys, pm, v, 0.5)) {
      v.backupLeft = 0;
    } else {
      v.s -= d;
      v.odo -= d;
      v.backupLeft -= d;
    }
    v.speed = 0;
    v.accel = 0;
    v.holding = true;
    v.braking = true;
    syncPose(sys, pm, v);
    return;
  }

  // Nearest stop line ahead that the vehicle must respect now. The rule is about the front bumper:
  //  - any part already over the crosswalk line: keep going, whatever the light shows;
  //  - fully behind it on yellow or red: stop at the line (queueing behind a leader, see below),
  //    unless even the hardest braking cannot stop in time, then go through.
  const halfLen = spec.length / 2;
  const front = v.s + halfLen;
  let stopAt = -1; // limit for the vehicle centre
  v.grantWait = false;
  v.legitWait = false;
  v.pedHold = false;
  for (let i = 0; i < pm.stops.length; i++) {
    const line = pm.stops[i];
    if (front > line.passS) continue; // part of the vehicle is past the crosswalk line
    const phase = sys.lights.phaseOf(line.lightId, pm.axis);
    // Green means go only while nobody is on the crosswalk ahead and no cross traffic is still clearing
    // the junction.
    if (phase === 'green') {
      const walkersBusy = line.cw >= 0 && sys.crosswalkBusy[line.cw] !== 0;
      // First come, first served through the junction: without a grant the vehicle waits at the line.
      const noGrant = line.junction >= 0 && v.granted !== line.junction && v.ghost <= 0;
      // Do not enter the junction when the queue ahead leaves no room to clear it (no blocking the box).
      const noRoom =
        v.ghost <= 0 &&
        leader !== null &&
        leader.speed < 0.5 &&
        leader.s - VEHICLE_SPECS[leader.cls].length / 2 < line.exitS + spec.length + 1;
      if (!walkersBusy && !noRoom && !noGrant) continue;
    }
    v.grantWait = phase === 'green' && line.junction >= 0 && v.granted !== line.junction;
    v.legitWait = phase !== 'green' || (line.cw >= 0 && sys.crosswalkBusy[line.cw] !== 0);
    v.pedHold = phase === 'green' && line.cw >= 0 && sys.crosswalkBusy[line.cw] !== 0;
    const dist = Math.max(0, line.s - front);
    // Cannot stop any more: commit. A crawling vehicle can always stop within the clamp below.
    if (v.speed > COMMIT_MIN_SPEED && v.speed * v.speed > 2 * MAX_DECEL * dist) continue;
    stopAt = line.s - halfLen;
    break;
  }

  // Which way at the next junction, and may it start the turn yet?
  let turnConn: PathModel | null = null;
  if (!pm.conn && pm.turns.length > 0) {
    decideTurn(sys, pm, v);
    if (v.plan >= 0) {
      turnConn = sys.models[v.plan];
      if (v.s < v.planEntryS && v.ghost <= 0 && !gateOpen(sys, turnConn, v)) {
        const hold = v.planEntryS - 0.1;
        if (stopAt < 0 || hold < stopAt) stopAt = hold;
      }
    }
  }

  // Another vehicle in the way (crossing traffic, a vehicle standing in the junction): stop short of it.
  // Standing a long time for no good reason (not a red light, not pedestrians): push on regardless of the
  // junction rules, as a last resort against gridlock.
  if (v.standT > STUCK_PUSH_S && !v.legitWait && v.ghost <= 0) v.ghost = GHOST_S;
  let blockS = -1;
  if (v.ghost > 0) {
    v.ghost -= dt; // breaking a jam: drives on regardless of other bodies
  } else {
    blockS = conflictLimit(sys, pm, v);
    if (blockS >= 0 && v.speed < 0.2) {
      v.heldFor += dt;
      // A jam needs both vehicles stuck on each other (or the other waiting for the very right of way this
      // one holds). One that merely waits for a vehicle standing for another reason (a red light, a
      // crosswalk) just waits too.
      const b = sys.blocker;
      if (v.heldFor >= HELD_BACKUP_S && b && (b.heldFor > 0 || b.backupLeft > 0 || b.grantWait)) resolveJam(sys, v, b);
    } else {
      v.heldFor = 0;
      if (v.speed > 1) v.backedUp = false;
    }
  }
  if (blockS >= 0 && (stopAt < 0 || blockS < stopAt)) stopAt = blockS;

  // Target speed: cruise, limited by braking distance to a stop line and by corners.
  let target = spec.cruiseSpeed * v.speedFactor;
  if (stopAt >= 0) {
    target = Math.min(target, Math.sqrt(2 * COMFORT_DECEL * Math.max(0, stopAt - v.s)));
  }
  if (pm.conn) target = Math.min(target, pm.conn.maxSpeed);
  for (let i = 0; i < pm.passes.length; i++) {
    const toCentre = pm.passes[i].sCentre - v.s;
    if (toCentre < 14 && toCentre > -6) target = Math.min(target, JUNCTION_SPEED);
  }
  if (turnConn && v.s < v.planEntryS) {
    const turnSpeed = (turnConn.conn as ConnectorInfo).maxSpeed;
    target = Math.min(target, Math.sqrt(turnSpeed * turnSpeed + 2 * COMFORT_DECEL * (v.planEntryS - v.s)));
  }
  for (let i = 0; i < pm.corners.length; i++) {
    const c = pm.corners[i];
    const ds = c.s - v.s;
    if (ds < -FILLET_MAX || ds > 60) continue;
    const cornerSpeed = 3 + 7 * (1 - Math.min(1, c.angle / Math.PI));
    target = Math.min(target, ds > 0 ? Math.sqrt(cornerSpeed * cornerSpeed + 2 * COMFORT_DECEL * ds) : cornerSpeed);
  }
  // Approach a leader smoothly: the safe speed shrinks with the free gap, so queues form without jolts.
  if (leader) {
    const required = (VEHICLE_SPECS[leader.cls].length + spec.length) / 2 + spec.gap;
    const free = Math.max(0, leader.s - required - v.s);
    target = Math.min(target, leader.speed + Math.sqrt(2 * COMFORT_DECEL * free));
  }
  // Stopping at a light or behind a queue may need more than comfortable braking.
  const brakeLimit = stopAt >= 0 || leader ? MAX_DECEL : COMFORT_DECEL;
  if (v.speed < target) {
    v.speed = Math.min(target, v.speed + spec.accel * dt);
  } else {
    v.speed = Math.max(target, v.speed - brakeLimit * dt);
  }

  let newS = v.s + v.speed * dt;
  let blocked = false;

  // Never pass a stop line we must respect.
  if (stopAt >= 0 && newS > stopAt) {
    newS = stopAt;
    v.speed = 0;
    blocked = true;
  }

  // Following distance behind the leader.
  if (leader) {
    const required = (VEHICLE_SPECS[leader.cls].length + spec.length) / 2 + spec.gap;
    const maxS = leader.s - required;
    if (newS > maxS) {
      newS = Math.max(v.s, maxS);
      v.speed = Math.min(v.speed, leader.speed);
      blocked = true;
    }
  }

  v.odo += newS - v.s;
  v.s = newS;

  // Smoothed acceleration, brake lamp state (decelerating, or held at a stop line / behind a leader).
  const a = (v.speed - oldSpeed) / dt;
  v.accel += (a - v.accel) * Math.min(1, dt * 6);
  v.holding = v.speed < 0.4 && (blocked || stopAt >= 0);
  v.braking = v.accel < -0.9 || v.holding;

  // Heading follows the path tangent a little ahead, low-passed so corners turn smoothly.
  poseAt(pm, Math.min(v.s + HEADING_LOOKAHEAD, pm.length), sys.pose);
  const diff = wrapAngle(sys.pose.heading - v.heading);
  let rate = diff * HEADING_GAIN;
  if (rate > MAX_YAW_RATE) rate = MAX_YAW_RATE;
  else if (rate < -MAX_YAW_RATE) rate = -MAX_YAW_RATE;
  let dh = rate * dt;
  if (Math.abs(dh) > Math.abs(diff)) dh = diff;
  v.heading = wrapAngle(v.heading + dh);
  const yaw = dh / dt;
  v.yawRate += (yaw - v.yawRate) * Math.min(1, dt * 8);
  v.indicator = v.yawRate > 0.12 ? 1 : v.yawRate < -0.12 ? -1 : 0;

  v.standT = v.speed < 0.2 ? v.standT + dt : 0;
  syncPose(sys, pm, v);

  // Horn triggers (own rng; see HORN_*). A pedestrian holding the vehicle at a green light for a while.
  if (v.pedHold && v.speed < 0.5) {
    v.pedHeldT += dt;
    if (v.pedHeldT >= HORN_PED_HOLD_S) {
      v.pedHeldT = 0;
      sys.tryHorn(v);
    }
  } else {
    v.pedHeldT = 0;
  }
  if (v.accel < HORN_HARD_BRAKE && v.speed > 2 && sys.hornRng() < HORN_HARD_BRAKE_RATE * dt) sys.tryHorn(v);
}
