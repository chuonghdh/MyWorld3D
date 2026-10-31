// Idle behaviours: benches, looking at shop windows, chatting, doors and returning.

import { S_WALK, S_LOOK, S_CHAT, S_SIT, S_MOVE, S_HIDDEN, N_WALK, N_LOOK, N_SIT, N_HIDE } from './constants';
import { inRoad } from './graph';
import { faceAlong, turn, placeOnEdge } from './movement';
import type { Pedestrians } from '../pedestrians';

export function tryIdle(sys: Pedestrians, i: number): void {
  const g = sys.g;
  const rng = sys.rng;
  const e = sys.edge[i];
  const len = g.len[e];
  const s = sys.S[i];
  if (s < 3.5 || s > len - 3.5) {
    sys.idleTimer[i] = 1.5;
    return;
  }
  const hasFollower = sys.follower[i] >= 0;
  const rainy = sys.rain > 0.3;
  const benchIdx = rainy ? -1 : findBench(sys, i);
  const wBench = benchIdx >= 0 ? 0.3 : 0;
  const wLook = g.build[e] === 1 ? 0.25 : 0;
  const wChat = hasFollower ? 0.35 : 0;
  const wDoor = g.build[e] === 1 ? 0.1 + (rainy ? 0.35 : 0) : 0;
  const total = wBench + wLook + wChat + wDoor;
  if (total <= 0) {
    sys.idleTimer[i] = 5;
    return;
  }
  let r = rng() * total;
  sys.idleTimer[i] = 25 + rng() * 60;
  if ((r -= wBench) < 0) {
    startBench(sys, i, benchIdx);
  } else if ((r -= wLook) < 0) {
    startLook(sys, i);
  } else if ((r -= wChat) < 0) {
    startChat(sys, i);
  } else {
    startDoor(sys, i, 15 + rng() * 55);
  }
}

export function findBench(sys: Pedestrians, i: number): number {
  const B = sys.benchX.length;
  let best = -1;
  let bestD = 9;
  const x = sys.px[i];
  const z = sys.pz[i];
  for (let b = 0; b < B; b++) {
    if (sys.benchOcc[b] >= 0) continue;
    const d = Math.hypot(sys.benchX[b] - x, sys.benchZ[b] - z);
    if (d >= bestD) continue;
    if (!pathClear(sys, x, z, sys.benchX[b], sys.benchZ[b])) continue;
    best = b;
    bestD = d;
  }
  return best;
}

export function pathClear(sys: Pedestrians, x0: number, z0: number, x1: number, z1: number): boolean {
  for (let k = 0; k <= 6; k++) {
    const t = k / 6;
    if (inRoad(sys.rects, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, 0.15)) return false;
  }
  return true;
}

export function startBench(sys: Pedestrians, i: number, b: number): void {
  sys.benchOcc[b] = i;
  sys.bench[i] = b;
  const f = sys.benchF[b];
  // Pairs share the bench: the leader takes the right half, the follower the left half.
  const shift = sys.follower[i] >= 0 ? -0.4 : 0;
  sys.tx[i] = sys.benchX[b] + Math.cos(f) * shift;
  sys.tz[i] = sys.benchZ[b] - Math.sin(f) * shift;
  sys.faceTo[i] = f;
  sys.next[i] = N_SIT;
  sys.state[i] = S_MOVE;
  sys.statsData.sits++;
}

export function releaseBench(sys: Pedestrians, i: number): void {
  const b = sys.bench[i];
  if (b >= 0) sys.benchOcc[b] = -1;
  sys.bench[i] = -1;
}

export function startLook(sys: Pedestrians, i: number): void {
  const g = sys.g;
  const e = sys.edge[i];
  sys.tx[i] = sys.px[i] + g.inx[e] * (0.5 + sys.rng() * 0.3);
  sys.tz[i] = sys.pz[i] + g.inz[e] * (0.5 + sys.rng() * 0.3);
  sys.faceTo[i] = Math.atan2(g.inx[e], g.inz[e]);
  sys.next[i] = N_LOOK;
  sys.state[i] = S_MOVE;
  sys.statsData.looks++;
}

export function startChat(sys: Pedestrians, i: number): void {
  sys.state[i] = S_CHAT;
  sys.timer[i] = 5 + sys.rng() * 15;
  sys.faceTo[i] = sys.hd[i];
  sys.statsData.chats++;
}

export function startDoor(sys: Pedestrians, i: number, hideFor: number): void {
  const g = sys.g;
  const e = sys.edge[i];
  const wall = 1.4;
  sys.doorX[i] = g.ax[e] + g.dx[e] * sys.S[i] + g.inx[e] * wall;
  sys.doorZ[i] = g.az[e] + g.dz[e] * sys.S[i] + g.inz[e] * wall;
  sys.tx[i] = sys.doorX[i];
  sys.tz[i] = sys.doorZ[i];
  sys.faceTo[i] = Math.atan2(g.inx[e], g.inz[e]);
  sys.timer[i] = hideFor;
  sys.next[i] = N_HIDE;
  sys.state[i] = S_MOVE;
  sys.statsData.doors++;
}

/** Walks from the current spot back to the walking line, then resumes the walk. */
export function startReturn(sys: Pedestrians, i: number): void {
  const g = sys.g;
  const e = sys.edge[i];
  const d = sys.dirv[i];
  const wh = Math.atan2(g.dx[e] * d, g.dz[e] * d);
  sys.tx[i] = g.ax[e] + g.dx[e] * sys.S[i] + Math.cos(wh) * sys.lat[i];
  sys.tz[i] = g.az[e] + g.dz[e] * sys.S[i] - Math.sin(wh) * sys.lat[i];
  sys.faceTo[i] = wh;
  sys.next[i] = N_WALK;
  sys.state[i] = S_MOVE;
}

export function emerge(sys: Pedestrians, i: number): void {
  sys.px[i] = sys.doorX[i];
  sys.pz[i] = sys.doorZ[i];
  sys.cx[i] = 0;
  sys.cz[i] = 0;
  sys.vis[i] = 1;
  sys.committed[i] = 0;
  faceAlong(sys, i);
  sys.hd[i] = sys.faceTo[i];
  sys.idleTimer[i] = 15 + sys.rng() * 50;
  startReturn(sys, i);
  const f = sys.follower[i];
  if (f >= 0) sys.vis[f] = 1;
}

export function stepMove(sys: Pedestrians, i: number, dt: number): void {
  const dx = sys.tx[i] - sys.px[i];
  const dz = sys.tz[i] - sys.pz[i];
  const d = Math.hypot(dx, dz);
  const step = sys.speed[i] * 0.8 * dt;
  if (d <= step + 1e-4) {
    sys.px[i] = sys.tx[i];
    sys.pz[i] = sys.tz[i];
    arrive(sys, i);
    return;
  }
  sys.px[i] += (dx / d) * step;
  sys.pz[i] += (dz / d) * step;
  turn(sys, i, Math.atan2(dx, dz), dt);
}

export function arrive(sys: Pedestrians, i: number): void {
  switch (sys.next[i]) {
    case N_WALK: {
      const ox = sys.px[i];
      const oz = sys.pz[i];
      sys.state[i] = S_WALK;
      faceAlong(sys, i);
      placeOnEdge(sys, i, 0);
      sys.cx[i] = ox - sys.px[i];
      sys.cz[i] = oz - sys.pz[i];
      break;
    }
    case N_LOOK:
      sys.state[i] = S_LOOK;
      sys.timer[i] = 6 + sys.rng() * 14;
      break;
    case N_SIT:
      sys.state[i] = S_SIT;
      sys.timer[i] = 10 + sys.rng() * 30;
      break;
    case N_HIDE:
      sys.state[i] = S_HIDDEN;
      sys.vis[i] = 0;
      {
        const f = sys.follower[i];
        if (f >= 0) sys.vis[f] = 0;
      }
      break;
    default:
      sys.state[i] = S_WALK;
  }
}
