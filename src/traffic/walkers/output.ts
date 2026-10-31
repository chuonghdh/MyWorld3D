// Render records for the mesh layer: walkers and dogs in view.

import type { PedestrianRender } from './types';
import type { Pedestrians } from '../pedestrians';

/** Visible walkers. The returned array and its objects are reused every call. */
export function getPedestrians(sys: Pedestrians): PedestrianRender[] {
  const out = sys.out;
  let n = 0;
  for (let i = 0; i < sys.cap; i++) {
    if (sys.vis[i] === 0) continue;
    const r = sys.pool[i];
    r.id = sys.ids[i];
    r.position.x = sys.ox[i];
    r.position.z = sys.oz[i];
    r.y = sys.oy[i];
    r.heading = sys.oh[i];
    r.body = sys.body[i];
    r.female = sys.female[i];
    r.hairStyle = sys.hairStyle[i];
    r.top = sys.top[i];
    r.pants = sys.pants[i];
    r.hair = sys.hair[i];
    r.skin = sys.skin[i];
    r.accent = sys.accent[i];
    r.traits = sys.traits[i];
    r.pose = sys.opose[i];
    r.speed = sys.ospeed[i];
    r.phase = sys.phase[i];
    r.umbrellaRank = sys.rank[i];
    r.scale = sys.scale[i];
    const d = sys.dogIndex[i];
    if (d >= 0) {
      const dr = sys.dogPool[d];
      dr.position.x = sys.dogX[d];
      dr.position.z = sys.dogZ[d];
      dr.heading = sys.dogH[d];
      dr.phase = sys.dogPhase[d];
      dr.speed = sys.dogSpeed[d];
      dr.coat = sys.dogCoat[d];
      dr.leashHand.x = sys.handX[d];
      dr.leashHand.z = sys.handZ[d];
      r.dog = dr;
    } else {
      r.dog = null;
    }
    out[n++] = r;
  }
  out.length = n;
  return out;
}
