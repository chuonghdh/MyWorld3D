// Walking on the graph: edges, turns, crossing rules and spawning at edges.

import { MAX_WALKERS, WALKERS_PER_ROAD, WAIT_DIST, CROSS_MARGIN, GIVE_UP_WAIT, TURN_RATE, S_WALK, S_WAIT, S_LOOK, S_CHAT, S_SIT, S_MOVE, S_HIDDEN } from './constants';
import { redRemaining } from './density';
import { tryIdle, releaseBench, startDoor, startReturn, emerge, stepMove } from './behaviour';
import { resolve } from './resolve';
import type { Pedestrians } from '../pedestrians';

export function setCap(sys: Pedestrians): void {
  let cap = Math.min(MAX_WALKERS, Math.floor(sys.multiplier * WALKERS_PER_ROAD * sys.layout.roads.length));
  // Never split a pair across the cap.
  if (cap > 0 && cap < MAX_WALKERS && sys.follower[cap - 1] === cap) cap += 1;
  const old = sys.cap;
  sys.cap = cap;
  for (let i = cap; i < old; i++) vanish(sys, i);
}

export function vanish(sys: Pedestrians, i: number): void {
  if (sys.bench[i] >= 0) {
    sys.benchOcc[sys.bench[i]] = -1;
    sys.bench[i] = -1;
  }
  sys.state[i] = S_HIDDEN;
  sys.timer[i] = 0;
  sys.vis[i] = 0;
  doorFromEdge(sys, i);
}

/** Puts a hidden slot's door on a random building edge. */
export function doorFromEdge(sys: Pedestrians, i: number): void {
  const g = sys.g;
  const e = pickSpawnEdge(sys);
  const s = sys.rng() * g.len[e];
  sys.edge[i] = e;
  sys.S[i] = s;
  sys.dirv[i] = sys.rng() < 0.5 ? 1 : -1;
  const wall = g.build[e] === 1 ? 1.4 : 0;
  sys.doorX[i] = g.ax[e] + g.dx[e] * s + g.inx[e] * wall;
  sys.doorZ[i] = g.az[e] + g.dz[e] * s + g.inz[e] * wall;
}

export function populateInitial(sys: Pedestrians): void {
  for (let i = 0; i < sys.cap; i++) {
    if (sys.leader[i] >= 0) continue;
    if (!(sys.rank[i] < sys.density)) {
      doorFromEdge(sys, i);
      const f = sys.follower[i];
      if (f >= 0) doorFromEdge(sys, f);
      continue;
    }
    const e = pickSpawnEdge(sys);
    sys.edge[i] = e;
    sys.S[i] = sys.rng() * sys.g.len[e];
    sys.dirv[i] = sys.rng() < 0.5 ? 1 : -1;
    sys.state[i] = S_WALK;
    sys.committed[i] = 0;
    snapToEdge(sys, i);
    const f = sys.follower[i];
    if (f >= 0) {
      sys.state[f] = S_WALK;
      sys.edge[f] = e;
    }
  }
  resolve(sys, 0.016);
}

export function pickSpawnEdge(sys: Pedestrians): number {
  const g = sys.g;
  const r = sys.rng() * g.spawnTotal;
  let lo = 0;
  let hi = g.edgeCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (g.spawnCum[mid] >= r) hi = mid;
    else lo = mid + 1;
  }
  // spawnCum is flat across crossing edges; step forward to a real sidewalk edge.
  let e = lo;
  while (e < g.edgeCount && g.cross[e] === 1) e++;
  if (e >= g.edgeCount) {
    e = lo;
    while (e > 0 && g.cross[e] === 1) e--;
  }
  return e;
}

export function stepLeader(sys: Pedestrians, i: number, dt: number): void {
  const g = sys.g;
  switch (sys.state[i]) {
    case S_WALK: {
      // Off duty: head for the nearest door and stay inside.
      if (!(sys.rank[i] < sys.density + 0.02)) {
        const e = sys.edge[i];
        if (g.cross[e] === 0 && g.build[e] === 1 && sys.S[i] > 2 && sys.S[i] < g.len[e] - 2) {
          startDoor(sys, i, 0);
          return;
        }
      }
      stepWalk(sys, i, dt);
      if (sys.state[i] === S_WALK && g.cross[sys.edge[i]] === 0) {
        sys.idleTimer[i] -= dt;
        if (sys.idleTimer[i] <= 0) tryIdle(sys, i);
      }
      break;
    }
    case S_WAIT: {
      sys.timer[i] += dt;
      const e = sys.edge[i];
      const sp = Math.max(0.5, sys.speed[i] * sys.speedMul);
      if (crossAllowed(sys, e, g.len[e] / sp)) {
        sys.state[i] = S_WALK;
        sys.committed[i] = 1;
      } else if (sys.timer[i] > GIVE_UP_WAIT) {
        sys.dirv[i] = -sys.dirv[i] as 1 | -1;
        sys.committed[i] = 1;
        sys.state[i] = S_WALK;
      }
      faceAlong(sys, i);
      placeOnEdge(sys, i, dt);
      break;
    }
    case S_LOOK:
    case S_CHAT: {
      sys.timer[i] -= dt;
      turn(sys, i, sys.faceTo[i], dt);
      if (sys.timer[i] <= 0) startReturn(sys, i);
      break;
    }
    case S_SIT: {
      sys.timer[i] -= dt;
      turn(sys, i, sys.faceTo[i], dt);
      if (sys.timer[i] <= 0) {
        releaseBench(sys, i);
        startReturn(sys, i);
      }
      break;
    }
    case S_MOVE: {
      stepMove(sys, i, dt);
      break;
    }
    case S_HIDDEN: {
      sys.timer[i] -= dt;
      if (sys.timer[i] <= 0 && sys.rank[i] < sys.density) emerge(sys, i);
      break;
    }
    default:
      break;
  }
}

export function stepWalk(sys: Pedestrians, i: number, dt: number): void {
  const g = sys.g;
  const e = sys.edge[i];
  const dir = sys.dirv[i];
  const len = g.len[e];
  const sp = sys.speed[i] * sys.speedMul;
  const ns = sys.S[i] + dir * sp * dt;

  if (g.cross[e] === 1 && sys.committed[i] === 0) {
    const p = dir > 0 ? ns : len - ns;
    if (p >= WAIT_DIST) {
      if (crossAllowed(sys, e, len / Math.max(0.5, sp))) {
        sys.committed[i] = 1;
      } else {
        sys.S[i] = dir > 0 ? WAIT_DIST : len - WAIT_DIST;
        sys.state[i] = S_WAIT;
        sys.timer[i] = 0;
        sys.statsData.waits++;
        faceAlong(sys, i);
        placeOnEdge(sys, i, dt);
        return;
      }
    }
  }

  if (ns < 0 || ns > len) {
    const atB = ns > len;
    const node = atB ? g.nodeB[e] : g.nodeA[e];
    const over = Math.min(atB ? ns - len : -ns, 0.3);
    const wasCross = g.cross[e] === 1;
    const ne = chooseNext(sys, i, e, node, dir);
    sys.edge[i] = ne;
    const ndir = g.nodeA[ne] === node ? 1 : -1;
    sys.dirv[i] = ndir;
    sys.S[i] = ndir > 0 ? over : g.len[ne] - over;
    sys.committed[i] = 0;
    if (wasCross) sys.statsData.crossings++;
    if (g.cross[ne] === 0) sys.idleTimer[i] = Math.min(sys.idleTimer[i], 40);
  } else {
    sys.S[i] = ns;
  }
  faceAlong(sys, i);
  placeOnEdge(sys, i, dt);
}

export function faceAlong(sys: Pedestrians, i: number): void {
  const g = sys.g;
  const e = sys.edge[i];
  const d = sys.dirv[i];
  sys.faceTo[i] = Math.atan2(g.dx[e] * d, g.dz[e] * d);
}

export function turn(sys: Pedestrians, i: number, target: number, dt: number): void {
  let d = target - sys.hd[i];
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  const m = TURN_RATE * dt;
  sys.hd[i] += d > m ? m : d < -m ? -m : d;
}

/** Writes the on-edge position (without the decaying correction) and turns toward the walking direction. */
export function placeOnEdge(sys: Pedestrians, i: number, dt: number): void {
  const g = sys.g;
  const e = sys.edge[i];
  turn(sys, i, sys.faceTo[i], dt);
  const h = sys.hd[i];
  const lx = Math.cos(h);
  const lz = -Math.sin(h);
  let lat = sys.lat[i];
  if (g.cross[e] === 1 && lat > 0.8) lat = 0.8;
  if (g.cross[e] === 1 && lat < -0.8) lat = -0.8;
  const s = sys.S[i];
  sys.px[i] = g.ax[e] + g.dx[e] * s + lx * lat;
  sys.pz[i] = g.az[e] + g.dz[e] * s + lz * lat;
}

export function snapToEdge(sys: Pedestrians, i: number): void {
  faceAlong(sys, i);
  sys.hd[i] = sys.faceTo[i];
  placeOnEdge(sys, i, 0);
  sys.cx[i] = 0;
  sys.cz[i] = 0;
}

export function crossAllowed(sys: Pedestrians, e: number, crossTime: number): boolean {
  const g = sys.g;
  if (g.ctl[e] === 0) return true;
  const t = sys.lights ? sys.lights.elapsed : sys.time;
  const rem = redRemaining(g.cycle[e], g.nsG[e], g.ewG[e], g.yel[e], g.axis[e], t, g.allR[e]);
  return rem >= crossTime + CROSS_MARGIN;
}

export function chooseNext(sys: Pedestrians, i: number, e: number, node: number, dir: number): number {
  const g = sys.g;
  const start = g.nodeStart[node];
  const end = g.nodeStart[node + 1];
  if (end - start <= 1) return e; // dead end: turn around
  const cdx = g.dx[e] * dir;
  const cdz = g.dz[e] * dir;
  const rainFactor = 1 - 0.5 * sys.rain;
  let sum = 0;
  for (let k = start; k < end; k++) sum += candidateWeight(sys, g.nodeEdges[k], e, node, cdx, cdz, rainFactor);
  let r = sys.rng() * sum;
  let pick = e;
  for (let k = start; k < end; k++) {
    const ee = g.nodeEdges[k];
    const w = candidateWeight(sys, ee, e, node, cdx, cdz, rainFactor);
    if (w <= 0) continue;
    pick = ee;
    r -= w;
    if (r <= 0) break;
  }
  void i;
  return pick;
}

export function candidateWeight(sys: Pedestrians, ee: number, cur: number, node: number, cdx: number, cdz: number, rainFactor: number): number {
  if (ee === cur) return 0;
  const g = sys.g;
  const sgn = g.nodeA[ee] === node ? 1 : -1;
  const dot = g.dx[ee] * sgn * cdx + g.dz[ee] * sgn * cdz;
  if (g.cross[ee] === 1) return 1.1 * g.weight[ee] * rainFactor;
  if (dot > 0.7) return 3 * g.weight[ee];
  if (dot < -0.7) return 0.05;
  return 1.2 * g.weight[ee];
}

export function clamp(sys: Pedestrians, i: number): void {
  if (sys.ox[i] < sys.boundMinX) sys.ox[i] = sys.boundMinX;
  else if (sys.ox[i] > sys.boundMaxX) sys.ox[i] = sys.boundMaxX;
  if (sys.oz[i] < sys.boundMinZ) sys.oz[i] = sys.boundMinZ;
  else if (sys.oz[i] > sys.boundMaxZ) sys.oz[i] = sys.boundMaxZ;
}
