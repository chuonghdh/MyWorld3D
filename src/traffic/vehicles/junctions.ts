// Junction right of way: grants, conflicts between movements, gating of turns into a junction.

import type { Vec2 } from '../../core/types';
import type { StopLine, ConnectorInfo, PathModel, Vehicle } from './types';
import { VEHICLE_SPECS, REQUEST_RANGE, CONFLICT_DIST, GRANT_EXPIRY_STEPS, ONCOMING_REACH } from './constants';
import { poseAt } from './geometry';
import { decideTurn } from './turns';
import type { VehicleSystem } from '../vehicles';

/**
 * Hands out the right to enter each junction. Vehicles inside a junction always hold it. Vehicles about to
 * enter ask in order of arrival and get it when their way through the junction crosses no granted way and no
 * way of an earlier waiting vehicle.
 */
export function updateGrants(sys: VehicleSystem): void {
  const J = sys.junctionCount;
  for (let j = 0; j < J; j++) {
    const list = sys.grantedAt[j];
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (grantDone(sys, v, j)) {
        v.granted = -1;
        v.enteredJ = -1;
      } else {
        list[w++] = v;
      }
    }
    list.length = w;
    sys.askingAt[j].length = 0;
  }
  for (let pi = 0; pi < sys.models.length; pi++) {
    const pm = sys.models[pi];
    for (let k = 0; k < pm.list.length; k++) {
      const v = pm.list[k];
      v.reqLine = null;
      const inside = v.junctionIdx;
      if (inside >= 0) {
        if (v.granted !== inside) {
          if (v.granted >= 0) dropGrant(sys, v);
          v.granted = inside;
          v.grantAt = sys.stepNo;
          sys.grantedAt[inside].push(v);
        }
        v.enteredJ = inside;
        continue;
      }
      if (pm.conn || v.granted >= 0) continue;
      const front = v.s + VEHICLE_SPECS[v.cls].length / 2;
      for (let i = 0; i < pm.stops.length; i++) {
        const line = pm.stops[i];
        if (front > line.passS) continue;
        if (line.junction >= 0 && line.s - front <= REQUEST_RANGE) {
          if (v.plan < 0 || v.decided !== line.junction) decideTurn(sys, pm, v);
          if (v.waitJ !== line.junction) {
            v.waitJ = line.junction;
            v.waitSince = sys.stepNo;
          }
          v.reqLine = line;
          sys.askingAt[line.junction].push(v);
        }
        break; // only the nearest line ahead counts
      }
    }
  }
  for (let j = 0; j < J; j++) {
    const asking = sys.askingAt[j];
    if (asking.length === 0) continue;
    // Order of arrival (insertion sort: the lists are short).
    for (let a = 1; a < asking.length; a++) {
      const v = asking[a];
      let b = a - 1;
      while (b >= 0 && asking[b].waitSince > v.waitSince) {
        asking[b + 1] = asking[b];
        b--;
      }
      asking[b + 1] = v;
    }
    sys.blockedAsk.length = 0;
    for (let a = 0; a < asking.length; a++) {
      const v = asking[a];
      const line = v.reqLine as StopLine;
      const pm = sys.models[v.pathIndex];
      if (sys.lights.phaseOf(line.lightId, pm.axis) !== 'green') continue; // waits at the light, claims nothing
      let free = !(v.plan >= 0 && !gateOpen(sys, sys.models[v.plan], v));
      for (let g = 0; free && g < sys.grantedAt[j].length; g++) {
        if (movesConflict(sys, j, v, sys.grantedAt[j][g])) free = false;
      }
      for (let g = 0; free && g < sys.blockedAsk.length; g++) {
        if (movesConflict(sys, j, v, sys.blockedAsk[g])) free = false;
      }
      if (free) {
        v.granted = j;
        v.grantAt = sys.stepNo;
        sys.grantedAt[j].push(v);
      } else {
        sys.blockedAsk.push(v);
      }
    }
  }
}

export function dropGrant(sys: VehicleSystem, v: Vehicle): void {
  const list = sys.grantedAt[v.granted];
  const i = list.indexOf(v);
  if (i >= 0) list.splice(i, 1);
  v.granted = -1;
}

/** A grant ends when the vehicle has left the junction (centre and rear), or was never used for too long. */
export function grantDone(sys: VehicleSystem, v: Vehicle, j: number): boolean {
  if (v.enteredJ === j) {
    if (v.standT > 10) return true; // stuck with its tail in the junction: stop holding everyone else up
    if (junctionAt(sys, v.x, v.z) === j) return false;
    const half = VEHICLE_SPECS[v.cls].length / 2;
    return junctionAt(sys, v.x - Math.sin(v.heading) * half, v.z - Math.cos(v.heading) * half) !== j;
  }
  return sys.stepNo - v.grantAt > GRANT_EXPIRY_STEPS;
}

/** The way a vehicle takes through junction j: its source lane path, and the connector if it will turn. */
export function movesConflict(sys: VehicleSystem, j: number, a: Vehicle, b: Vehicle): boolean {
  const pa = sys.models[a.pathIndex];
  const pb = sys.models[b.pathIndex];
  const srcA = pa.conn ? pa.srcPath : a.pathIndex;
  const srcB = pb.conn ? pb.srcPath : b.pathIndex;
  if (srcA === srcB) return false; // same lane: they queue, they do not cross
  const planA = pa.conn ? a.pathIndex : a.plan;
  const planB = pb.conn ? b.pathIndex : b.plan;
  const key = j + ':' + srcA + ':' + planA + '|' + srcB + ':' + planB;
  const cached = sys.conflictCache.get(key);
  if (cached !== undefined) return cached;
  const ptsA = movementPoints(sys, j, srcA, planA);
  const ptsB = movementPoints(sys, j, srcB, planB);
  let hit = false;
  const lim = CONFLICT_DIST * CONFLICT_DIST;
  for (let i = 0; i < ptsA.length && !hit; i++) {
    for (let k = 0; k < ptsB.length; k++) {
      const dx = ptsA[i].x - ptsB[k].x;
      const dz = ptsA[i].z - ptsB[k].z;
      if (dx * dx + dz * dz < lim) {
        hit = true;
        break;
      }
    }
  }
  sys.conflictCache.set(key, hit);
  return hit;
}

/** Centre-line points of the way through junction j: straight along a lane path, or via a connector. */
export function movementPoints(sys: VehicleSystem, j: number, src: number, plan: number): Vec2[] {
  const key = j + ':' + src + ':' + plan;
  const cached = sys.movementCache.get(key);
  if (cached) return cached;
  const out: Vec2[] = [];
  const A = sys.models[src];
  const pass = A.passes.find((q) => q.junction === j);
  const pose = sys.pose;
  if (pass) {
    if (plan < 0) {
      for (let d = -9; d <= 9; d += 1.5) {
        poseAt(A, pass.sCentre + d, pose);
        out.push({ x: pose.x, z: pose.z });
      }
    } else {
      const conn = sys.models[plan];
      const ci = conn.conn as ConnectorInfo;
      const turn = A.turns.find((t) => t.model === plan);
      const entryS = turn ? turn.entryS : pass.sCentre - 5;
      for (let d = -3; d <= 0; d += 1.5) {
        poseAt(A, entryS + d, pose);
        out.push({ x: pose.x, z: pose.z });
      }
      for (const pt of conn.points) out.push({ x: pt.x, z: pt.z });
      const B = sys.models[ci.to];
      for (let d = 0; d <= 9; d += 1.5) {
        poseAt(B, ci.exitS + d, pose);
        out.push({ x: pose.x, z: pose.z });
      }
    }
  }
  sys.movementCache.set(key, out);
  return out;
}

/**
 * True when a vehicle may start this turn: room to start and to merge, and no oncoming traffic for a left
 * turn. (Pedestrians on the crosswalk it leads onto are waited for at the end of the turn, off the lane.)
 */
export function gateOpen(sys: VehicleSystem, conn: PathModel, v: Vehicle): boolean {
  const ci = conn.conn as ConnectorInfo;
  const own = VEHICLE_SPECS[v.cls].length;
  for (let i = 0; i < conn.list.length; i++) {
    const w = conn.list[i];
    if (w.s - VEHICLE_SPECS[w.cls].length / 2 < own + 2) return false;
  }
  const target = sys.models[ci.to];
  for (let i = 0; i < target.list.length; i++) {
    const w = target.list[i];
    const half = VEHICLE_SPECS[w.cls].length / 2;
    if (w.s + half > ci.exitS - 2 && w.s - half < ci.exitS + own + 2) return false;
  }
  if (conn.turn === 'left') {
    const oncoming = sys.models[sys.models[conn.srcPath].opposite];
    const pass = oncoming ? oncoming.passes.find((p) => p.junction === conn.junction) : undefined;
    if (oncoming && pass) {
      for (let i = 0; i < oncoming.list.length; i++) {
        const w = oncoming.list[i];
        const ahead = pass.sCentre - w.s; // distance of the oncoming vehicle to the junction centre
        if (ahead > -6 && ahead < ONCOMING_REACH && w.speed > 1) return false;
      }
    }
  }
  return true;
}

/** Index of the junction containing the point, or -1. */
export function junctionAt(sys: VehicleSystem, x: number, z: number): number {
  for (let i = 0; i < sys.junctions.length; i++) {
    const j = sys.junctions[i];
    if (x >= j.minX && x <= j.maxX && z >= j.minZ && z <= j.maxZ) return i;
  }
  return -1;
}
