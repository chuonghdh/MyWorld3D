// Per-step resolution of every walker state into the output records.

import { POSE_WALK, POSE_STAND, POSE_CHAT, POSE_SIT, BODY_CHILD, BODY_TEEN, SIDEWALK_Y, S_WALK, S_WAIT, S_LOOK, S_CHAT, S_SIT, S_MOVE, S_HIDDEN } from './constants';
import { inRoad } from './graph';
import { clamp } from './movement';
import type { Pedestrians } from '../pedestrians';

/** Computes final positions, poses, followers and dogs for every live slot. */
export function resolve(sys: Pedestrians, dt: number): void {
  const g = sys.g;
  const cap = sys.cap;
  const decay = Math.exp(-6 * dt);
  const beh = sys.behaviour;
  beh.walking = beh.crossing = beh.waiting = beh.looking = beh.chatting = beh.sitting = beh.moving = beh.hidden = 0;
  let visible = 0;
  for (let i = 0; i < cap; i++) {
    const L = sys.leader[i];
    if (L < 0) {
      const st = sys.state[i];
      if (st === S_HIDDEN) {
        sys.vis[i] = 0;
        beh.hidden++;
        const f = sys.follower[i];
        if (f >= 0) sys.vis[f] = 0;
        continue;
      }
      sys.vis[i] = 1;
      const onEdge = st === S_WALK || st === S_WAIT;
      // The correction decays so state changes never pop.
      if (onEdge) {
        sys.cx[i] *= decay;
        sys.cz[i] *= decay;
      }
      let x = sys.px[i] + (onEdge ? sys.cx[i] : 0);
      let z = sys.pz[i] + (onEdge ? sys.cz[i] : 0);
      const h = sys.hd[i];
      let pose = POSE_STAND;
      let spd = 0;
      let y = SIDEWALK_Y;
      switch (st) {
        case S_WALK:
        case S_MOVE:
          pose = POSE_WALK;
          spd = sys.speed[i] * (st === S_MOVE ? 0.8 : sys.speedMul);
          // Children are erratic: their gait rate wobbles (render only; positions are unchanged).
          if (sys.body[i] === BODY_CHILD) spd *= 1 + 0.25 * Math.sin(sys.time * 2.3 + sys.phase[i]);
          if (st === S_WALK) {
            const e = sys.edge[i];
            if (g.cross[e] === 1) {
              const dist = Math.min(sys.S[i], g.len[e] - sys.S[i]);
              const c = g.curb[e];
              y = dist <= c - 0.2 ? SIDEWALK_Y : dist >= c + 0.2 ? 0 : (SIDEWALK_Y * (c + 0.2 - dist)) / 0.4;
              beh.crossing++;
            } else beh.walking++;
          } else beh.moving++;
          break;
        case S_WAIT:
          beh.waiting++;
          break;
        case S_LOOK:
          beh.looking++;
          break;
        case S_CHAT:
          pose = POSE_CHAT;
          beh.chatting++;
          if (sys.follower[i] >= 0) {
            x -= Math.sin(h) * 0.47;
            z -= Math.cos(h) * 0.47;
          }
          break;
        case S_SIT:
          pose = POSE_SIT;
          beh.sitting++;
          break;
        default:
          break;
      }
      sys.ox[i] = x;
      sys.oz[i] = z;
      sys.oy[i] = y;
      sys.oh[i] = h;
      sys.opose[i] = pose;
      sys.ospeed[i] = spd;
      visible++;
      clamp(sys, i);
    } else {
      // Follower: mirror the leader.
      if (sys.vis[L] === 0) {
        sys.vis[i] = 0;
        continue;
      }
      sys.vis[i] = 1;
      const pose = sys.opose[L];
      const h = sys.oh[L];
      let x = sys.ox[L];
      let z = sys.oz[L];
      let hh = h;
      if (pose === POSE_CHAT) {
        x += Math.sin(h) * 0.95;
        z += Math.cos(h) * 0.95;
        hh = h + Math.PI;
      } else if (pose === POSE_SIT) {
        const w = 0.8;
        x += Math.cos(h) * w;
        z -= Math.sin(h) * w;
      } else {
        const w = sys.body[i] === BODY_CHILD ? 0.62 : 0.7;
        x += Math.cos(h) * w;
        z -= Math.sin(h) * w;
      }
      sys.ox[i] = x;
      sys.oz[i] = z;
      sys.oy[i] = sys.oy[L];
      sys.oh[i] = hh;
      sys.opose[i] = pose;
      // A follower keeps the leader's pace: a child walking with an adult goes at the adult's pace (the adult waits).
      // Children keep their own erratic wobble on top; teens take a slightly quicker rate.
      const rate = sys.body[i] === BODY_TEEN ? 1.1 : 1;
      const wobble = sys.body[i] === BODY_CHILD ? 1 + 0.25 * Math.sin(sys.time * 2.3 + sys.phase[i]) : 1;
      sys.ospeed[i] = sys.ospeed[L] * rate * wobble;
      visible++;
      clamp(sys, i);
    }
  }
  sys.visibleCount = visible;

  // Dogs trail beside their owner; the leash runs from the owner's hand to the dog.
  for (let i = 0; i < cap; i++) {
    const d = sys.dogIndex[i];
    if (d < 0 || sys.vis[i] === 0) continue;
    const h = sys.oh[i];
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const lx = Math.cos(h);
    const lz = -Math.sin(h);
    const moving = sys.ospeed[i] > 0.05;
    const back = moving ? 0.85 + 0.2 * Math.sin(sys.time * 0.9 + sys.dogPhase[d]) : 0.55;
    const side = sys.dogSide[i] * 0.5;
    // Never onto the road unless the owner is there: a dog trailing an owner who has just turned at a kerb
    // would otherwise stand in the street. The first candidate off the asphalt wins (no allocation).
    let dxp = 0;
    let dzp = 0;
    for (let c = 0; c < 3; c++) {
      const bk = c === 0 ? back : c === 1 ? 0.55 : 0;
      dxp = sys.ox[i] - fx * bk + lx * side;
      dzp = sys.oz[i] - fz * bk + lz * side;
      if (!inRoad(sys.rects, dxp, dzp, 0.05)) break;
    }
    if (dxp < sys.boundMinX) dxp = sys.boundMinX;
    if (dxp > sys.boundMaxX) dxp = sys.boundMaxX;
    if (dzp < sys.boundMinZ) dzp = sys.boundMinZ;
    if (dzp > sys.boundMaxZ) dzp = sys.boundMaxZ;
    sys.dogX[d] = dxp;
    sys.dogZ[d] = dzp;
    sys.dogH[d] = h;
    sys.dogSpeed[d] = moving ? sys.ospeed[i] : 0;
    const hx = sys.ox[i] + lx * sys.dogSide[i] * 0.22 + fx * 0.08;
    const hz = sys.oz[i] + lz * sys.dogSide[i] * 0.22 + fz * 0.08;
    sys.handX[d] = Math.min(sys.boundMaxX, Math.max(sys.boundMinX, hx));
    sys.handZ[d] = Math.min(sys.boundMaxZ, Math.max(sys.boundMinZ, hz));
  }
}
