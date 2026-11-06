// Pigeon motion: scatter state machine, spot claims and the per-frame update. PigeonSystem (birds.ts) delegates here.
// Runtime motion uses the pigeon RNG (never Math.random). Constants come from birds.ts.

import type { LifeContext } from './common';
import { angleDiff, clamp } from './common';
import type { PigeonSystem } from './birds';
import { CIRCLE, CLIMB, LAND, PECK, PERCH, SCARED, SCARE_RADIUS, WALK } from './birds';

function release(sys: PigeonSystem, i: number): void {
  const k = sys.spotIdx[i];
  if (k < 0) return;
  if (sys.spotKind[i] === 1) sys.occR[k] = 0;
  else sys.occG[k] = 0;
  sys.spotIdx[i] = -1;
}

/** Picks and claims a free spot of the given kind (falls back to the other kind), stores it as target. */
export function claim(sys: PigeonSystem, i: number, kind: number, rnd: () => number): void {
  for (let attempt = 0; attempt < 8; attempt++) {
    const useRoof = attempt < 6 ? kind === 1 : kind !== 1;
    const set = useRoof ? sys.roof : sys.ground;
    if (set.n === 0) continue;
    const occ = useRoof ? sys.occR : sys.occG;
    const k = Math.floor(rnd() * set.n);
    if (occ[k] && attempt < 7) continue;
    occ[k] = 1;
    sys.spotKind[i] = useRoof ? 1 : 0;
    sys.spotIdx[i] = k;
    const jx = useRoof ? 0 : (rnd() - 0.5) * 0.8;
    const jz = useRoof ? 0 : (rnd() - 0.5) * 0.8;
    sys.tx[i] = set.x[k] + jx;
    sys.ty[i] = set.y[k];
    sys.tz[i] = set.z[k] + jz;
    return;
  }
  // no spots at all: stay where we are
  sys.tx[i] = sys.x[i];
  sys.ty[i] = sys.y[i];
  sys.tz[i] = sys.z[i];
}

function takeoff(sys: PigeonSystem, i: number, awayAngle: number, mode: number, windScale: number, wantRoof: boolean): void {
  const r = sys.rng;
  release(sys, i);
  claim(sys, i, wantRoof || sys.roofMode ? 1 : r() < 0.7 ? 0 : 1, r);
  sys.state[i] = CLIMB;
  sys.tm[i] = 2.2 + r() * 1.2;
  sys.spd[i] = 3;
  sys.hd[i] = awayAngle;
  const high = mode === 0;
  sys.alt[i] = high
    ? Math.max(sys.y[i] + 4, (14 + r() * 10) * windScale)
    : Math.max(sys.y[i], sys.ty[i]) + 2.5 + r() * 2;
  sys.circ[i] = high ? (5 + r() * 10) * (windScale < 1 ? 0.5 : 1) : 0;
  sys.cdir[i] = r() < 0.5 ? -1 : 1;
  sys.cr[i] = 8 + r() * 10;
  sys.landT[i] = 0;
  sys.peckTarget[i] = 0;
}

function scare(sys: PigeonSystem, i: number, fromX: number, fromZ: number, delay: number, windScale: number): void {
  const away = Math.atan2(sys.x[i] - fromX, sys.z[i] - fromZ) + (sys.rng() - 0.5) * 1.2;
  takeoff(sys, i, away, 0, windScale, false);
  if (delay > 0) {
    sys.state[i] = SCARED;
    sys.tm[i] = delay;
  }
}

// ---- update ----
export function pigeonUpdate(sys: PigeonSystem, dt: number, ctx: LifeContext): void {
  sys.uniforms.uTime.value = ctx.time;
  sys.frame++;
  if (!(dt > 0)) {
    sys.writeAll();
    return;
  }
  if (dt > 0.1) dt = 0.1;
  sys.scatterCooldown -= dt;
  const windSpd = Math.hypot(ctx.wind.x, ctx.wind.z);
  const windScale = windSpd > 9 ? 0.4 : 1;
  const rain = ctx.rain ?? 0;
  const wantRoof = ctx.night || rain > 0.3;
  sys.roofMode = wantRoof;
  const veh = ctx.vehicles;
  const ped = ctx.pedestrians;
  const b = sys.bounds;
  const r = sys.rng;
  const n = sys.capacity;
  const turnK = Math.min(1, dt * 8);

  for (let i = 0; i < n; i++) {
    const st = sys.state[i];
    // ---- disturbance check (staggered: every fifth frame per pigeon) ----
    if ((st === PECK || st === WALK || st === LAND || st === PERCH) && (i + sys.frame) % 5 === 0) {
      const px = sys.x[i];
      const pz = sys.z[i];
      const dy = sys.y[i] - 0.9;
      const r2 = SCARE_RADIUS * SCARE_RADIUS - dy * dy;
      if (r2 > 0) {
        let hit = false;
        let hx = 0;
        let hz = 0;
        for (let k = 0; k < ped.length && !hit; k++) {
          const q = ped[k].position;
          const dx = q.x - px;
          const dz = q.z - pz;
          if (dx * dx + dz * dz < r2) { hit = true; hx = q.x; hz = q.z; }
        }
        for (let k = 0; k < veh.length && !hit; k++) {
          const q = veh[k].position;
          const dx = q.x - px;
          const dz = q.z - pz;
          if (dx * dx + dz * dz < r2) { hit = true; hx = q.x; hz = q.z; }
        }
        if (hit) {
          scare(sys, i, hx, hz, 0, windScale);
          if (sys.scatterCooldown <= 0) {
            sys.emit('pigeon-scatter', px, pz);
            sys.scatterCooldown = 0.9;
          }
          // contagion: nearby grounded pigeons follow shortly after
          for (let j = 0; j < n; j++) {
            if (j === i) continue;
            const sj = sys.state[j];
            if (sj !== PECK && sj !== WALK && sj !== PERCH) continue;
            const ddx = sys.x[j] - px;
            const ddz = sys.z[j] - pz;
            if (ddx * ddx + ddz * ddz < 49 && Math.abs(sys.y[j] - sys.y[i]) < 2) {
              scare(sys, j, hx, hz, 0.05 + r() * 0.35, windScale);
            }
          }
          continue;
        }
      }
    }

    // ---- per-state behaviour ----
    let flapT = 0;
    let spreadT = 0;
    let moving = false;
    switch (sys.state[i]) {
      case PERCH: {
        sys.peckTarget[i] = 0;
        sys.tm[i] -= dt;
        if (sys.tm[i] <= 0) {
          if (r() < 0.22 && sys.roof.n > 1) takeoff(sys, i, sys.hd[i], 1, windScale, true);
          else sys.tm[i] = 15 + r() * 40;
        }
        break;
      }
      case PECK: {
        sys.tm[i] -= dt;
        sys.sub[i] -= dt;
        if (sys.sub[i] <= 0) {
          const pecking = sys.peckTarget[i] > 0.5;
          sys.peckTarget[i] = pecking || ctx.night ? 0 : 1;
          sys.sub[i] = pecking ? 0.4 + r() * 1.2 : 0.8 + r() * 2.2;
        }
        if (wantRoof && sys.tm[i] > 20) sys.tm[i] = r() * 20;
        if (sys.tm[i] <= 0) {
          if (wantRoof) {
            takeoff(sys, i, sys.hd[i], 1, windScale, true);
          } else {
            const roll = r();
            if (roll < 0.62) {
              // shuffle to a nearby point
              const a = r() * Math.PI * 2;
              const d = 0.6 + r() * 2;
              sys.tx[i] = sys.x[i] + Math.sin(a) * d;
              sys.tz[i] = sys.z[i] + Math.cos(a) * d;
              sys.state[i] = WALK;
              sys.peckTarget[i] = -1;
            } else if (roll < 0.74) {
              takeoff(sys, i, sys.hd[i], 1, windScale, false);
            } else {
              sys.tm[i] = 3 + r() * 8;
            }
          }
        }
        break;
      }
      case WALK: {
        const dx = sys.tx[i] - sys.x[i];
        const dz = sys.tz[i] - sys.z[i];
        const d = Math.hypot(dx, dz);
        if (d < 0.12) {
          sys.state[i] = PECK;
          sys.tm[i] = 4 + r() * 10;
          sys.peckTarget[i] = 0;
          sys.sub[i] = 0.5;
        } else {
          const want = Math.atan2(dx, dz);
          sys.hd[i] += angleDiff(sys.hd[i], want) * Math.min(1, dt * 7);
          const s = 0.55;
          sys.x[i] += Math.sin(sys.hd[i]) * s * dt;
          sys.z[i] += Math.cos(sys.hd[i]) * s * dt;
        }
        break;
      }
      case SCARED: {
        sys.tm[i] -= dt;
        sys.peckTarget[i] = 0;
        if (sys.tm[i] <= 0) sys.state[i] = CLIMB;
        break;
      }
      case CLIMB: {
        flapT = 1; spreadT = 1; moving = true;
        sys.tm[i] -= dt;
        sys.spd[i] += (6.5 - sys.spd[i]) * Math.min(1, dt * 2);
        const rate = 3.2 + (sys.alt[i] - sys.y[i]) * 0.8;
        sys.y[i] = Math.min(sys.alt[i], sys.y[i] + Math.min(rate, 6.5) * dt);
        if (sys.tm[i] <= 0 || sys.y[i] >= sys.alt[i] - 0.3) {
          if (sys.circ[i] > 0) sys.state[i] = CIRCLE;
          else { sys.state[i] = LAND; sys.landT[i] = 0; }
        }
        break;
      }
      case CIRCLE: {
        flapT = clamp((Math.sin(ctx.time * 2.2 + sys.ph[i]) + 0.3) * 1.5, 0.12, 1);
        spreadT = 1; moving = true;
        sys.circ[i] -= dt;
        sys.spd[i] += (7 - sys.spd[i]) * Math.min(1, dt * 2);
        sys.hd[i] += (sys.cdir[i] * sys.spd[i]) / sys.cr[i] * dt;
        const ty = sys.alt[i] + Math.sin(ctx.time * 0.7 + sys.ph[i]) * 1.2;
        sys.y[i] += clamp(ty - sys.y[i], -2 * dt, 2 * dt);
        if (sys.circ[i] <= 0) { sys.state[i] = LAND; sys.landT[i] = 0; }
        break;
      }
      case LAND: {
        spreadT = 1; moving = true;
        sys.landT[i] += dt;
        const dx = sys.tx[i] - sys.x[i];
        const dz = sys.tz[i] - sys.z[i];
        const d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        sys.hd[i] += clamp(angleDiff(sys.hd[i], want), -2.8 * dt, 2.8 * dt);
        const speed = clamp(d * 1.1, 1.6, 7);
        sys.spd[i] += (speed - sys.spd[i]) * Math.min(1, dt * 3);
        const glideY = sys.ty[i] + Math.min(d * 0.55, Math.max(0, sys.y[i] - sys.ty[i]));
        sys.y[i] += clamp(glideY - sys.y[i], -6 * dt, 3 * dt);
        flapT = d < 3.5 ? 1 : 0.3;
        if (d < 0.35 || sys.landT[i] > 14) {
          sys.x[i] = sys.tx[i];
          sys.z[i] = sys.tz[i];
          sys.y[i] = sys.ty[i];
          sys.spd[i] = 0;
          sys.pitch[i] = 0;
          sys.bank[i] = 0;
          if (sys.spotKind[i] === 1) {
            sys.state[i] = PERCH;
            sys.tm[i] = 10 + r() * 40;
            const k = sys.spotIdx[i];
            if (k >= 0) sys.hd[i] = sys.roof.face[k];
          } else {
            sys.state[i] = PECK;
            sys.tm[i] = 3 + r() * 10;
            sys.sub[i] = 0.4;
            sys.hd[i] = r() * Math.PI * 2;
          }
          sys.peckTarget[i] = 0;
          moving = false;
          flapT = 0; spreadT = 0;
        }
        break;
      }
      default:
        break;
    }

    // ---- flight integration ----
    if (moving) {
      const px = sys.x[i];
      const pz = sys.z[i];
      // keep inside the town (soft wall)
      const m = 14;
      if (px < b.minX + m || px > b.maxX - m || pz < b.minZ + m || pz > b.maxZ - m) {
        const want = Math.atan2(-px, -pz);
        sys.hd[i] += clamp(angleDiff(sys.hd[i], want), -2.5 * dt, 2.5 * dt);
      }
      const oldHd = sys.hd[i];
      sys.x[i] += Math.sin(oldHd) * sys.spd[i] * dt;
      sys.z[i] += Math.cos(oldHd) * sys.spd[i] * dt;
    }

    // ---- pose smoothing ----
    sys.flap[i] += (flapT - sys.flap[i]) * Math.min(1, dt * 8);
    sys.spread[i] += (spreadT - sys.spread[i]) * Math.min(1, dt * 10);
    const pt = sys.peckTarget[i];
    sys.peck[i] += (pt - sys.peck[i]) * turnK;
    if (Math.abs(sys.peck[i]) < 0.03 && pt === 0) sys.peck[i] = 0;
    const sp = moving ? 1 : 0;
    const stNow = sys.state[i];
    const climbPitch = stNow === CLIMB ? 0.55 : stNow === LAND ? -0.25 : 0.05;
    sys.pitch[i] += ((sp ? climbPitch : 0) - sys.pitch[i]) * Math.min(1, dt * 4);
    const bankT = stNow === CIRCLE ? -sys.cdir[i] * 0.5 : 0;
    sys.bank[i] += (bankT - sys.bank[i]) * Math.min(1, dt * 3);
  }
  sys.writeAll();
}

