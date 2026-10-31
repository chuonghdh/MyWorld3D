// Render records for the mesh layer: positions, headings and state of the vehicles in view.

import type { VehicleRender } from './types';
import { poseAt } from './geometry';
import type { VehicleSystem } from '../vehicles';

/** Vehicles as render data for the mesh layer. The returned array and its records are reused every call. */
export function getVehicles(sys: VehicleSystem): VehicleRender[] {
  let n = 0;
  for (let pi = 0; pi < sys.models.length; pi++) {
    const pm = sys.models[pi];
    for (let k = 0; k < pm.list.length; k++) {
      const v = pm.list[k];
      if (v.x < sys.drawBounds.minX || v.x > sys.drawBounds.maxX || v.z < sys.drawBounds.minZ || v.z > sys.drawBounds.maxZ) continue;
      poseAt(pm, v.s, sys.pose);
      let r = sys.renderPool[n];
      if (!r) {
        r = {
          id: 0,
          position: { x: 0, z: 0 },
          heading: 0,
          cls: 'car',
          variant: 0,
          speed: 0,
          accel: 0,
          braking: false,
          indicator: 0,
          yawRate: 0,
          wheelPhase: 0,
          tint: 0,
        };
        sys.renderPool[n] = r;
      }
      r.id = v.id;
      r.position.x = sys.pose.x;
      r.position.z = sys.pose.z;
      r.heading = v.heading;
      r.cls = v.cls;
      r.variant = v.variant;
      r.speed = v.speed;
      r.accel = v.accel;
      r.braking = v.braking;
      r.indicator = v.indicator;
      r.yawRate = v.yawRate;
      r.wheelPhase = v.odo;
      r.tint = v.tint;
      sys.renderList[n] = r;
      n++;
    }
  }
  sys.renderList.length = n;
  return sys.renderList;
}
