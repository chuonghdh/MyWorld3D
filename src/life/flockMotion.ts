// Flock motion: closed-loop leaders and the per-frame update of the three flocks and gulls. FlockSystem (birds.ts) delegates here.

import * as THREE from 'three';
import type { LifeContext } from './common';
import { angleDiff, clamp, setPose } from './common';
import type { FlockSystem } from './birds';
import { FLOCK_DEFS, FLYER_SCALE, GULL_SCALE } from './birds';

/** Leader position on the closed path of group g at angle th (writes tmpX/Y/Z). */
export function leaderAt(sys: FlockSystem, g: number, th: number, time: number): void {
  const hx = sys.hx * 0.72;
  const hz = sys.hz * 0.72;
  let x: number;
  let z: number;
  let y: number;
  if (g === 0) {
    x = Math.cos(th) * hx * 0.85;
    z = Math.sin(th) * hz * 0.7;
    y = FLOCK_DEFS[0].alt + Math.sin(th * 2.0) * 3;
  } else if (g === 1) {
    x = Math.cos(th) * hx * 0.95;
    z = Math.sin(th * 2.0) * hz * 0.6;
    y = FLOCK_DEFS[1].alt + Math.sin(th * 3.0 + 1) * 3.5;
  } else if (g === 2) {
    x = hx * 0.18 + Math.cos(-th) * hx * 0.5;
    z = -hz * 0.15 + Math.sin(-th) * hz * 0.85;
    y = FLOCK_DEFS[2].alt + Math.sin(th * 2.0 + 2) * 4;
  } else {
    x = Math.cos(th) * hx * 0.35 - hx * 0.1;
    z = Math.sin(th) * hz * 0.3 + hz * 0.15;
    y = 23 + Math.sin(th * 3.0) * 2;
  }
  // slow deterministic wander so the loop never repeats exactly
  x += Math.sin(th * 3.1 + g * 1.7 + time * 0.01) * hx * 0.05;
  z += Math.cos(th * 2.3 + g) * hz * 0.05;
  sys.tmpX = sys.cx + x;
  sys.tmpZ = sys.cz + z;
  sys.tmpY = y;
}


export function flockUpdate(sys: FlockSystem, dt: number, ctx: LifeContext): void {
  sys.uniforms.uTime.value = ctx.time;
  const night = ctx.night;
  const rain = ctx.rain ?? 0;
  const windSpd = Math.hypot(ctx.wind.x, ctx.wind.z);
  const groups = sys.flockN.length;
  if (dt > 0.1) dt = 0.1;
  if (dt < 0) dt = 0;

  if (dt > 0) {
    for (let g = 0; g < groups; g++) {
      const def = g < 3 ? FLOCK_DEFS[g] : null;
      const speed = def ? def.speed : 6.2;
      // advance along the path at a constant linear speed
      leaderAt(sys, g, sys.theta[g], ctx.time);
      const ax = sys.tmpX;
      const az = sys.tmpZ;
      leaderAt(sys, g, sys.theta[g] + 0.02, ctx.time);
      const seg = Math.max(0.5, Math.hypot(sys.tmpX - ax, sys.tmpZ - az));
      sys.theta[g] += (0.02 * speed * dt) / seg;
      leaderAt(sys, g, sys.theta[g], ctx.time);
      const nx = sys.tmpX;
      const nz = sys.tmpZ;
      sys.lvx[g] = (nx - sys.lx[g]) / dt;
      sys.lvz[g] = (nz - sys.lz[g]) / dt;
      sys.lx[g] = nx;
      sys.lz[g] = nz;
      const nightLower = night ? 0.75 : 1;
      sys.ly[g] = sys.tmpY * nightLower;

      // how many birds of this group are wanted
      let want = sys.flockN[g];
      if (g < 3) {
        if (night) want = Math.ceil(want * 0.15);
        else if (rain > 0.5) want = Math.ceil(want * 0.3);
        else if (ctx.timeOfDay < 6.5 || ctx.timeOfDay > 19.5) want = Math.ceil(want * 0.4);
      } else {
        want = !night && rain < 0.3 && windSpd > 4.5 ? want : 0;
      }
      sys.act[g] += (want - sys.act[g]) * Math.min(1, dt * 0.8);
    }
  }

  let k = 0;
  for (let g = 0; g < groups; g++) {
    const start = sys.flockStart[g];
    const n = sys.flockN[g];
    const hvx = sys.lvx[g];
    const hvz = sys.lvz[g];
    const hs = Math.hypot(hvx, hvz) || 1;
    const fx = hvx / hs;
    const fz = hvz / hs;
    const gull = g === 3;
    for (let s = 0; s < n; s++) {
      const i = start + s;
      const wanted = s < Math.round(sys.act[g] + 0.2) ? 1 : 0;
      if (dt > 0) {
        sys.vis[i] += clamp(wanted - sys.vis[i], -dt * 0.9, dt * 0.9);
        // target slot in the flock frame (z along heading)
        const tx = sys.lx[g] + sys.ox[i] * fz + sys.oz[i] * fx;
        const tz = sys.lz[g] - sys.ox[i] * fx + sys.oz[i] * fz;
        const ty = sys.ly[g] + sys.oy[i];
        if (sys.vis[i] <= 0.01 && wanted === 0) {
          // parked invisibly in formation so it fades in correctly
          sys.x[i] = tx; sys.y[i] = ty; sys.z[i] = tz;
          sys.vx[i] = hvx; sys.vz[i] = hvz; sys.vy[i] = 0;
          continue;
        }
        // separation from flock mates (only birds earlier in the flock to halve the cost)
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (let o = 0; o < n; o++) {
          if (o === s) continue;
          const j = start + o;
          const dx = sys.x[i] - sys.x[j];
          const dy = sys.y[i] - sys.y[j];
          const dz = sys.z[i] - sys.z[j];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 6.25 && d2 > 1e-4) {
            const inv = 1 / d2;
            sx += dx * inv; sy += dy * inv; sz += dz * inv;
          }
        }
        const t = ctx.time + sys.ph[i] * 3;
        const k1 = gull ? 0.5 : 0.9;
        let dvx = hvx + (tx - sys.x[i]) * k1 + sx * 3 + Math.sin(t * 0.9) * 1.2;
        let dvy = (ty - sys.y[i]) * 0.8 + sy * 2 + Math.sin(t * 1.3 + 1) * 0.6;
        let dvz = hvz + (tz - sys.z[i]) * k1 + sz * 3 + Math.cos(t * 0.8) * 1.2;
        const sp = Math.hypot(dvx, dvz);
        const maxSp = gull ? 8 : 15;
        if (sp > maxSp) { dvx *= maxSp / sp; dvz *= maxSp / sp; }
        dvy = clamp(dvy, -4, 4);
        const a = Math.min(1, dt * 2.2);
        sys.vx[i] += (dvx - sys.vx[i]) * a;
        sys.vy[i] += (dvy - sys.vy[i]) * a;
        sys.vz[i] += (dvz - sys.vz[i]) * a;
        sys.x[i] += sys.vx[i] * dt;
        sys.y[i] += sys.vy[i] * dt;
        sys.z[i] += sys.vz[i] * dt;
      }
      if (sys.vis[i] <= 0.01) continue;
      const hv = Math.hypot(sys.vx[i], sys.vz[i]);
      const yaw = Math.atan2(sys.vx[i], sys.vz[i]);
      const pitch = Math.atan2(sys.vy[i], Math.max(0.5, hv));
      if (dt > 0) {
        const dyaw = angleDiff(sys.yawPrev[i], yaw) / dt;
        sys.yawPrev[i] = yaw;
        sys.roll[i] += (clamp(-dyaw * 0.45, -0.7, 0.7) - sys.roll[i]) * Math.min(1, dt * 3);
      }
      const sc = (gull ? GULL_SCALE : FLYER_SCALE) * (0.35 + 0.65 * sys.vis[i]) * (sys.vis[i] > 0.05 ? 1 : sys.vis[i] / 0.05);
      setPose(sys.mesh, k, sys.x[i], sys.y[i], sys.z[i], yaw, pitch, sys.roll[i], sc);
      const o = k * 4;
      const glideBlend = 0.5 + 0.5 * Math.sin(ctx.time * 1.1 + sys.ph[i]);
      sys.anim[o] = gull ? 0.3 + 0.3 * glideBlend : clamp(0.15 + 1.2 * glideBlend, 0.15, 1);
      sys.anim[o + 1] = sys.ph[i];
      sys.anim[o + 2] = gull ? 0.32 : 0.9 + (sys.ph[i] % 0.3);
      sys.anim[o + 3] = 0;
      // colour order must follow the instance: copy tint of instance i into slot k
      copyColour(sys, i, k);
      k++;
    }
  }
  sys.visible = k;
  sys.mesh.count = k;
  sys.mesh.instanceMatrix.needsUpdate = true;
  if (sys.mesh.instanceColor) sys.mesh.instanceColor.needsUpdate = true;
  (sys.mesh.geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;

  // bird calls
  if (dt > 0 && !night) {
    sys.callTimer -= dt;
    if (sys.callTimer <= 0) {
      sys.callTimer = 6 + sys.rng() * 8;
      const g = Math.floor(sys.rng() * 3);
      if (sys.act[g] > 2) sys.emit('bird-call', sys.lx[g], sys.lz[g]);
    }
  }
}


function copyColour(sys: FlockSystem, src: number, dst: number): void {
  const attr = sys.mesh.instanceColor;
  if (!attr) return;
  if (!sys.colourCopyReady) {
    sys.colourSrc = new Float32Array(attr.array as Float32Array);
    sys.colourCopyReady = true;
  }
  const s = sys.colourSrc!;
  const a = attr.array as Float32Array;
  a[dst * 3] = s[src * 3];
  a[dst * 3 + 1] = s[src * 3 + 1];
  a[dst * 3 + 2] = s[src * 3 + 2];
}

