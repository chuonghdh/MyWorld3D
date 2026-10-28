// Birds: ground/roof pigeons with a scatter state machine, and flying flocks (swallows, starlings, gulls).
// State lives in typed arrays; update() allocates nothing. Placement uses the seeded RNG; runtime motion
// uses a second seeded RNG (never Math.random).

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { CityLayout } from '../city/layout';
import { angleDiff, clamp, scaledCount, setPose } from './common';
import type { EmitFn, LifeContext, LifeQuality } from './common';
import { buildFlyerGeometry, buildPigeonGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import type { AnimalUniforms } from './material';
import { buildSpotSet, openSpaceSpots, roofSpots, sidewalkSpots } from './spots';
import type { SpotSet } from './spots';

export const SCARE_RADIUS = 4;
const PIGEON_SCALE = 1.6;

const PERCH = 0;
const PECK = 1;
const WALK = 2;
const SCARED = 3;
const CLIMB = 4;
const CIRCLE = 5;
const LAND = 6;

export const PIGEON_STATE = { PERCH, PECK, WALK, SCARED, CLIMB, CIRCLE, LAND } as const;

export class PigeonSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms: AnimalUniforms;
  readonly capacity: number;
  readonly triangles: number;

  // state arrays (exposed read-only for tests and debugging)
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly hd: Float32Array;
  readonly state: Uint8Array;
  /** Index of the claimed spot and its kind (0 ground, 1 roof). */
  readonly spotKind: Uint8Array;
  readonly spotIdx: Int16Array;

  private readonly pitch: Float32Array;
  private readonly bank: Float32Array;
  private readonly spd: Float32Array;
  private readonly tm: Float32Array;
  private readonly sub: Float32Array;
  private readonly tx: Float32Array;
  private readonly ty: Float32Array;
  private readonly tz: Float32Array;
  private readonly alt: Float32Array;
  private readonly circ: Float32Array;
  private readonly cdir: Float32Array;
  private readonly cr: Float32Array;
  private readonly landT: Float32Array;
  private readonly flap: Float32Array;
  private readonly spread: Float32Array;
  private readonly peck: Float32Array;
  private readonly peckTarget: Float32Array;
  private readonly ph: Float32Array;
  private readonly anim: Float32Array;

  private readonly ground: SpotSet;
  private readonly roof: SpotSet;
  private readonly occG: Uint8Array;
  private readonly occR: Uint8Array;
  private readonly rng: () => number;
  private readonly emit: EmitFn;
  private readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private frame = 0;
  private scatterCooldown = 0;
  private roofMode = false;

  constructor(layout: CityLayout, seed: number, quality: LifeQuality, emit: EmitFn) {
    this.emit = emit;
    this.bounds = layout.townBounds;
    const n = scaledCount(80, quality);
    this.capacity = n;
    const place = createRng((seed ^ 0x51a7e1) >>> 0);
    this.rng = createRng((seed ^ 0x7777aa) >>> 0);

    // spots
    const side = sidewalkSpots(layout, place, 260);
    const open = openSpaceSpots(layout, place, 220);
    this.ground = buildSpotSet(side.concat(open));
    this.roof = buildSpotSet(roofSpots(layout, place, 220, 2));
    this.occG = new Uint8Array(this.ground.n);
    this.occR = new Uint8Array(this.roof.n);

    const geo = buildPigeonGeometry();
    this.triangles = geo.index ? geo.index.count / 3 : 0;
    const { material, uniforms } = createAnimalMaterial('pigeon');
    this.uniforms = uniforms;
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'life-pigeons';
    this.anim = attachAnim(this.mesh, n);

    const f32 = () => new Float32Array(n);
    this.x = f32(); this.y = f32(); this.z = f32(); this.hd = f32();
    this.pitch = f32(); this.bank = f32(); this.spd = f32(); this.tm = f32(); this.sub = f32();
    this.tx = f32(); this.ty = f32(); this.tz = f32(); this.alt = f32(); this.circ = f32();
    this.cdir = f32(); this.cr = f32(); this.landT = f32(); this.flap = f32(); this.spread = f32();
    this.peck = f32(); this.peckTarget = f32(); this.ph = f32();
    this.state = new Uint8Array(n);
    this.spotKind = new Uint8Array(n);
    this.spotIdx = new Int16Array(n).fill(-1);

    // initial placement: 65 percent ground, 35 percent roofs
    const tint = new THREE.Color();
    const tints = [0xd8dce6, 0xc9ccd6, 0xe9e9ee, 0xb7b1ab, 0xa89d98, 0xd0d4de];
    for (let i = 0; i < n; i++) {
      this.ph[i] = place() * 6.28;
      const wantRoof = place() < 0.35;
      this.claim(i, wantRoof ? 1 : 0, place);
      this.x[i] = this.tx[i];
      this.y[i] = this.ty[i];
      this.z[i] = this.tz[i];
      this.hd[i] = place() * Math.PI * 2;
      this.state[i] = this.spotKind[i] === 1 ? PERCH : PECK;
      this.tm[i] = 1 + place() * 12;
      this.sub[i] = place() * 2;
      tint.set(tints[Math.floor(place() * tints.length)]);
      this.mesh.setColorAt(i, tint);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = n;
    this.writeAll();
  }

  // ---- spot management ----
  private release(i: number): void {
    const k = this.spotIdx[i];
    if (k < 0) return;
    if (this.spotKind[i] === 1) this.occR[k] = 0;
    else this.occG[k] = 0;
    this.spotIdx[i] = -1;
  }

  /** Picks and claims a free spot of the given kind (falls back to the other kind), stores it as target. */
  private claim(i: number, kind: number, rnd: () => number): void {
    for (let attempt = 0; attempt < 8; attempt++) {
      const useRoof = attempt < 6 ? kind === 1 : kind !== 1;
      const set = useRoof ? this.roof : this.ground;
      if (set.n === 0) continue;
      const occ = useRoof ? this.occR : this.occG;
      const k = Math.floor(rnd() * set.n);
      if (occ[k] && attempt < 7) continue;
      occ[k] = 1;
      this.spotKind[i] = useRoof ? 1 : 0;
      this.spotIdx[i] = k;
      const jx = useRoof ? 0 : (rnd() - 0.5) * 0.8;
      const jz = useRoof ? 0 : (rnd() - 0.5) * 0.8;
      this.tx[i] = set.x[k] + jx;
      this.ty[i] = set.y[k];
      this.tz[i] = set.z[k] + jz;
      return;
    }
    // no spots at all: stay where we are
    this.tx[i] = this.x[i];
    this.ty[i] = this.y[i];
    this.tz[i] = this.z[i];
  }

  private takeoff(i: number, awayAngle: number, mode: number, windScale: number, wantRoof: boolean): void {
    const r = this.rng;
    this.release(i);
    this.claim(i, wantRoof || this.roofMode ? 1 : r() < 0.7 ? 0 : 1, r);
    this.state[i] = CLIMB;
    this.tm[i] = 2.2 + r() * 1.2;
    this.spd[i] = 3;
    this.hd[i] = awayAngle;
    const high = mode === 0;
    this.alt[i] = high
      ? Math.max(this.y[i] + 4, (14 + r() * 10) * windScale)
      : Math.max(this.y[i], this.ty[i]) + 2.5 + r() * 2;
    this.circ[i] = high ? (5 + r() * 10) * (windScale < 1 ? 0.5 : 1) : 0;
    this.cdir[i] = r() < 0.5 ? -1 : 1;
    this.cr[i] = 8 + r() * 10;
    this.landT[i] = 0;
    this.peckTarget[i] = 0;
  }

  private scare(i: number, fromX: number, fromZ: number, delay: number, windScale: number): void {
    const away = Math.atan2(this.x[i] - fromX, this.z[i] - fromZ) + (this.rng() - 0.5) * 1.2;
    this.takeoff(i, away, 0, windScale, false);
    if (delay > 0) {
      this.state[i] = SCARED;
      this.tm[i] = delay;
    }
  }

  // ---- update ----
  update(dt: number, ctx: LifeContext): void {
    this.uniforms.uTime.value = ctx.time;
    this.frame++;
    if (!(dt > 0)) {
      this.writeAll();
      return;
    }
    if (dt > 0.1) dt = 0.1;
    this.scatterCooldown -= dt;
    const windSpd = Math.hypot(ctx.wind.x, ctx.wind.z);
    const windScale = windSpd > 9 ? 0.4 : 1;
    const rain = ctx.rain ?? 0;
    const wantRoof = ctx.night || rain > 0.3;
    this.roofMode = wantRoof;
    const veh = ctx.vehicles;
    const ped = ctx.pedestrians;
    const b = this.bounds;
    const r = this.rng;
    const n = this.capacity;
    const turnK = Math.min(1, dt * 8);

    for (let i = 0; i < n; i++) {
      const st = this.state[i];
      // ---- disturbance check (staggered: every fifth frame per pigeon) ----
      if ((st === PECK || st === WALK || st === LAND || st === PERCH) && (i + this.frame) % 5 === 0) {
        const px = this.x[i];
        const pz = this.z[i];
        const dy = this.y[i] - 0.9;
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
            this.scare(i, hx, hz, 0, windScale);
            if (this.scatterCooldown <= 0) {
              this.emit('pigeon-scatter', px, pz);
              this.scatterCooldown = 0.9;
            }
            // contagion: nearby grounded pigeons follow shortly after
            for (let j = 0; j < n; j++) {
              if (j === i) continue;
              const sj = this.state[j];
              if (sj !== PECK && sj !== WALK && sj !== PERCH) continue;
              const ddx = this.x[j] - px;
              const ddz = this.z[j] - pz;
              if (ddx * ddx + ddz * ddz < 49 && Math.abs(this.y[j] - this.y[i]) < 2) {
                this.scare(j, hx, hz, 0.05 + r() * 0.35, windScale);
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
      switch (this.state[i]) {
        case PERCH: {
          this.peckTarget[i] = 0;
          this.tm[i] -= dt;
          if (this.tm[i] <= 0) {
            if (r() < 0.22 && this.roof.n > 1) this.takeoff(i, this.hd[i], 1, windScale, true);
            else this.tm[i] = 15 + r() * 40;
          }
          break;
        }
        case PECK: {
          this.tm[i] -= dt;
          this.sub[i] -= dt;
          if (this.sub[i] <= 0) {
            const pecking = this.peckTarget[i] > 0.5;
            this.peckTarget[i] = pecking || ctx.night ? 0 : 1;
            this.sub[i] = pecking ? 0.4 + r() * 1.2 : 0.8 + r() * 2.2;
          }
          if (wantRoof && this.tm[i] > 20) this.tm[i] = r() * 20;
          if (this.tm[i] <= 0) {
            if (wantRoof) {
              this.takeoff(i, this.hd[i], 1, windScale, true);
            } else {
              const roll = r();
              if (roll < 0.62) {
                // shuffle to a nearby point
                const a = r() * Math.PI * 2;
                const d = 0.6 + r() * 2;
                this.tx[i] = this.x[i] + Math.sin(a) * d;
                this.tz[i] = this.z[i] + Math.cos(a) * d;
                this.state[i] = WALK;
                this.peckTarget[i] = -1;
              } else if (roll < 0.74) {
                this.takeoff(i, this.hd[i], 1, windScale, false);
              } else {
                this.tm[i] = 3 + r() * 8;
              }
            }
          }
          break;
        }
        case WALK: {
          const dx = this.tx[i] - this.x[i];
          const dz = this.tz[i] - this.z[i];
          const d = Math.hypot(dx, dz);
          if (d < 0.12) {
            this.state[i] = PECK;
            this.tm[i] = 4 + r() * 10;
            this.peckTarget[i] = 0;
            this.sub[i] = 0.5;
          } else {
            const want = Math.atan2(dx, dz);
            this.hd[i] += angleDiff(this.hd[i], want) * Math.min(1, dt * 7);
            const s = 0.55;
            this.x[i] += Math.sin(this.hd[i]) * s * dt;
            this.z[i] += Math.cos(this.hd[i]) * s * dt;
          }
          break;
        }
        case SCARED: {
          this.tm[i] -= dt;
          this.peckTarget[i] = 0;
          if (this.tm[i] <= 0) this.state[i] = CLIMB;
          break;
        }
        case CLIMB: {
          flapT = 1; spreadT = 1; moving = true;
          this.tm[i] -= dt;
          this.spd[i] += (6.5 - this.spd[i]) * Math.min(1, dt * 2);
          const rate = 3.2 + (this.alt[i] - this.y[i]) * 0.8;
          this.y[i] = Math.min(this.alt[i], this.y[i] + Math.min(rate, 6.5) * dt);
          if (this.tm[i] <= 0 || this.y[i] >= this.alt[i] - 0.3) {
            if (this.circ[i] > 0) this.state[i] = CIRCLE;
            else { this.state[i] = LAND; this.landT[i] = 0; }
          }
          break;
        }
        case CIRCLE: {
          flapT = clamp((Math.sin(ctx.time * 2.2 + this.ph[i]) + 0.3) * 1.5, 0.12, 1);
          spreadT = 1; moving = true;
          this.circ[i] -= dt;
          this.spd[i] += (7 - this.spd[i]) * Math.min(1, dt * 2);
          this.hd[i] += (this.cdir[i] * this.spd[i]) / this.cr[i] * dt;
          const ty = this.alt[i] + Math.sin(ctx.time * 0.7 + this.ph[i]) * 1.2;
          this.y[i] += clamp(ty - this.y[i], -2 * dt, 2 * dt);
          if (this.circ[i] <= 0) { this.state[i] = LAND; this.landT[i] = 0; }
          break;
        }
        case LAND: {
          spreadT = 1; moving = true;
          this.landT[i] += dt;
          const dx = this.tx[i] - this.x[i];
          const dz = this.tz[i] - this.z[i];
          const d = Math.hypot(dx, dz);
          const want = Math.atan2(dx, dz);
          this.hd[i] += clamp(angleDiff(this.hd[i], want), -2.8 * dt, 2.8 * dt);
          const speed = clamp(d * 1.1, 1.6, 7);
          this.spd[i] += (speed - this.spd[i]) * Math.min(1, dt * 3);
          const glideY = this.ty[i] + Math.min(d * 0.55, Math.max(0, this.y[i] - this.ty[i]));
          this.y[i] += clamp(glideY - this.y[i], -6 * dt, 3 * dt);
          flapT = d < 3.5 ? 1 : 0.3;
          if (d < 0.35 || this.landT[i] > 14) {
            this.x[i] = this.tx[i];
            this.z[i] = this.tz[i];
            this.y[i] = this.ty[i];
            this.spd[i] = 0;
            this.pitch[i] = 0;
            this.bank[i] = 0;
            if (this.spotKind[i] === 1) {
              this.state[i] = PERCH;
              this.tm[i] = 10 + r() * 40;
              const k = this.spotIdx[i];
              if (k >= 0) this.hd[i] = this.roof.face[k];
            } else {
              this.state[i] = PECK;
              this.tm[i] = 3 + r() * 10;
              this.sub[i] = 0.4;
              this.hd[i] = r() * Math.PI * 2;
            }
            this.peckTarget[i] = 0;
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
        const px = this.x[i];
        const pz = this.z[i];
        // keep inside the town (soft wall)
        const m = 14;
        if (px < b.minX + m || px > b.maxX - m || pz < b.minZ + m || pz > b.maxZ - m) {
          const want = Math.atan2(-px, -pz);
          this.hd[i] += clamp(angleDiff(this.hd[i], want), -2.5 * dt, 2.5 * dt);
        }
        const oldHd = this.hd[i];
        this.x[i] += Math.sin(oldHd) * this.spd[i] * dt;
        this.z[i] += Math.cos(oldHd) * this.spd[i] * dt;
      }

      // ---- pose smoothing ----
      this.flap[i] += (flapT - this.flap[i]) * Math.min(1, dt * 8);
      this.spread[i] += (spreadT - this.spread[i]) * Math.min(1, dt * 10);
      const pt = this.peckTarget[i];
      this.peck[i] += (pt - this.peck[i]) * turnK;
      if (Math.abs(this.peck[i]) < 0.03 && pt === 0) this.peck[i] = 0;
      const sp = moving ? 1 : 0;
      const stNow = this.state[i];
      const climbPitch = stNow === CLIMB ? 0.55 : stNow === LAND ? -0.25 : 0.05;
      this.pitch[i] += ((sp ? climbPitch : 0) - this.pitch[i]) * Math.min(1, dt * 4);
      const bankT = stNow === CIRCLE ? -this.cdir[i] * 0.5 : 0;
      this.bank[i] += (bankT - this.bank[i]) * Math.min(1, dt * 3);
    }
    this.writeAll();
  }

  private writeAll(): void {
    const a = this.anim;
    for (let i = 0; i < this.capacity; i++) {
      setPose(this.mesh, i, this.x[i], this.y[i], this.z[i], this.hd[i], this.pitch[i], this.bank[i], PIGEON_SCALE);
      const o = i * 4;
      a[o] = this.flap[i];
      a[o + 1] = this.ph[i];
      a[o + 2] = this.spread[i];
      a[o + 3] = this.peck[i];
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// Flying flocks

interface FlockDef {
  kind: 0 | 1 | 2;
  count: number;
  alt: number;
  speed: number;
}

const FLOCK_DEFS: FlockDef[] = [
  { kind: 0, count: 25, alt: 26, speed: 9 },
  { kind: 1, count: 25, alt: 35, speed: 10.5 },
  { kind: 2, count: 25, alt: 44, speed: 8.5 },
];
const FLYER_SCALE = 2.6;
const GULL_SCALE = 4.2;
const FLOCK_TINTS = [0x2b2d36, 0x3a3340, 0x1f2c40];

export class FlockSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms: AnimalUniforms;
  readonly capacity: number;
  readonly triangles: number;
  readonly flockCount = FLOCK_DEFS.length;

  // per-bird state (exposed for tests)
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vis: Float32Array;

  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly ox: Float32Array;
  private readonly oy: Float32Array;
  private readonly oz: Float32Array;
  private readonly ph: Float32Array;
  private readonly yawPrev: Float32Array;
  private readonly roll: Float32Array;
  private readonly flock: Uint8Array; // 0..2 flocks, 3 gulls
  private readonly slot: Uint8Array; // index inside the flock
  private readonly anim: Float32Array;
  private readonly flockStart: number[] = [];
  private readonly flockN: number[] = [];
  private readonly theta: Float32Array;
  private readonly lx: Float32Array;
  private readonly lz: Float32Array;
  private readonly lvx: Float32Array;
  private readonly lvz: Float32Array;
  private readonly ly: Float32Array;
  private readonly act: Float32Array; // smoothed active count per flock group
  private readonly hx: number;
  private readonly hz: number;
  private readonly cx: number;
  private readonly cz: number;
  private readonly emit: EmitFn;
  private readonly rng: () => number;
  private callTimer = 4;
  private visible = 0;

  constructor(layout: CityLayout, seed: number, quality: LifeQuality, emit: EmitFn) {
    this.emit = emit;
    const place = createRng((seed ^ 0x3c3c3c) >>> 0);
    this.rng = createRng((seed ^ 0x9a9a11) >>> 0);
    const b = layout.townBounds;
    this.hx = (b.maxX - b.minX) / 2;
    this.hz = (b.maxZ - b.minZ) / 2;
    this.cx = (b.maxX + b.minX) / 2;
    this.cz = (b.maxZ + b.minZ) / 2;

    let total = 0;
    for (const d of FLOCK_DEFS) {
      const c = scaledCount(d.count, quality);
      this.flockStart.push(total);
      this.flockN.push(c);
      total += c;
    }
    const gulls = quality === 'low' ? 1 : 2;
    this.flockStart.push(total);
    this.flockN.push(gulls);
    total += gulls;
    this.capacity = total;

    const geo = buildFlyerGeometry();
    this.triangles = geo.index ? geo.index.count / 3 : 0;
    const { material, uniforms } = createAnimalMaterial('flyer');
    this.uniforms = uniforms;
    this.mesh = new THREE.InstancedMesh(geo, material, total);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'life-flocks';
    this.mesh.count = 0;
    this.anim = attachAnim(this.mesh, total);

    const f = () => new Float32Array(total);
    this.x = f(); this.y = f(); this.z = f(); this.vis = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.ox = f(); this.oy = f(); this.oz = f();
    this.ph = f(); this.yawPrev = f(); this.roll = f();
    this.flock = new Uint8Array(total);
    this.slot = new Uint8Array(total);
    const groups = this.flockN.length;
    this.theta = new Float32Array(groups);
    this.lx = new Float32Array(groups);
    this.lz = new Float32Array(groups);
    this.lvx = new Float32Array(groups);
    this.lvz = new Float32Array(groups);
    this.ly = new Float32Array(groups);
    this.act = new Float32Array(groups);

    const tint = new THREE.Color();
    for (let g = 0; g < groups; g++) {
      this.theta[g] = place() * Math.PI * 2 + g;
      this.act[g] = this.flockN[g];
      this.leaderAt(g, this.theta[g], 0);
      this.lx[g] = this.tmpX;
      this.lz[g] = this.tmpZ;
      this.ly[g] = this.tmpY;
      for (let k = 0; k < this.flockN[g]; k++) {
        const i = this.flockStart[g] + k;
        this.flock[i] = g;
        this.slot[i] = k;
        if (g < 3) {
          this.ox[i] = (place() - 0.5) * 12;
          this.oy[i] = (place() - 0.5) * 5;
          this.oz[i] = (place() - 0.5) * 14;
        } else {
          this.ox[i] = (k - 0.5) * 14;
          this.oy[i] = k * 3;
          this.oz[i] = -k * 8;
        }
        this.ph[i] = place() * 6.28;
        this.x[i] = this.lx[g] + this.ox[i];
        this.y[i] = this.ly[g] + this.oy[i];
        this.z[i] = this.lz[g] + this.oz[i];
        this.vx[i] = 0; this.vz[i] = 8; this.vy[i] = 0;
        this.vis[i] = 1;
        tint.set(g < 3 ? FLOCK_TINTS[g] : 0xf4f4f2);
        // small per-bird brightness jitter
        const j = 0.85 + place() * 0.3;
        tint.multiplyScalar(g < 3 ? j : 1);
        this.mesh.setColorAt(i, tint);
      }
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private tmpX = 0;
  private tmpY = 0;
  private tmpZ = 0;

  /** Leader position on the closed path of group g at angle th (writes tmpX/Y/Z). */
  private leaderAt(g: number, th: number, time: number): void {
    const hx = this.hx * 0.72;
    const hz = this.hz * 0.72;
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
    this.tmpX = this.cx + x;
    this.tmpZ = this.cz + z;
    this.tmpY = y;
  }

  /** Number of visible instances written last frame. */
  get visibleCount(): number {
    return this.visible;
  }

  update(dt: number, ctx: LifeContext): void {
    this.uniforms.uTime.value = ctx.time;
    const night = ctx.night;
    const rain = ctx.rain ?? 0;
    const windSpd = Math.hypot(ctx.wind.x, ctx.wind.z);
    const groups = this.flockN.length;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;

    if (dt > 0) {
      for (let g = 0; g < groups; g++) {
        const def = g < 3 ? FLOCK_DEFS[g] : null;
        const speed = def ? def.speed : 6.2;
        // advance along the path at a constant linear speed
        this.leaderAt(g, this.theta[g], ctx.time);
        const ax = this.tmpX;
        const az = this.tmpZ;
        this.leaderAt(g, this.theta[g] + 0.02, ctx.time);
        const seg = Math.max(0.5, Math.hypot(this.tmpX - ax, this.tmpZ - az));
        this.theta[g] += (0.02 * speed * dt) / seg;
        this.leaderAt(g, this.theta[g], ctx.time);
        const nx = this.tmpX;
        const nz = this.tmpZ;
        this.lvx[g] = (nx - this.lx[g]) / dt;
        this.lvz[g] = (nz - this.lz[g]) / dt;
        this.lx[g] = nx;
        this.lz[g] = nz;
        const nightLower = night ? 0.75 : 1;
        this.ly[g] = this.tmpY * nightLower;

        // how many birds of this group are wanted
        let want = this.flockN[g];
        if (g < 3) {
          if (night) want = Math.ceil(want * 0.15);
          else if (rain > 0.5) want = Math.ceil(want * 0.3);
          else if (ctx.timeOfDay < 6.5 || ctx.timeOfDay > 19.5) want = Math.ceil(want * 0.4);
        } else {
          want = !night && rain < 0.3 && windSpd > 4.5 ? want : 0;
        }
        this.act[g] += (want - this.act[g]) * Math.min(1, dt * 0.8);
      }
    }

    let k = 0;
    for (let g = 0; g < groups; g++) {
      const start = this.flockStart[g];
      const n = this.flockN[g];
      const hvx = this.lvx[g];
      const hvz = this.lvz[g];
      const hs = Math.hypot(hvx, hvz) || 1;
      const fx = hvx / hs;
      const fz = hvz / hs;
      const gull = g === 3;
      for (let s = 0; s < n; s++) {
        const i = start + s;
        const wanted = s < Math.round(this.act[g] + 0.2) ? 1 : 0;
        if (dt > 0) {
          this.vis[i] += clamp(wanted - this.vis[i], -dt * 0.9, dt * 0.9);
          // target slot in the flock frame (z along heading)
          const tx = this.lx[g] + this.ox[i] * fz + this.oz[i] * fx;
          const tz = this.lz[g] - this.ox[i] * fx + this.oz[i] * fz;
          const ty = this.ly[g] + this.oy[i];
          if (this.vis[i] <= 0.01 && wanted === 0) {
            // parked invisibly in formation so it fades in correctly
            this.x[i] = tx; this.y[i] = ty; this.z[i] = tz;
            this.vx[i] = hvx; this.vz[i] = hvz; this.vy[i] = 0;
            continue;
          }
          // separation from flock mates (only birds earlier in the flock to halve the cost)
          let sx = 0;
          let sy = 0;
          let sz = 0;
          for (let o = 0; o < n; o++) {
            if (o === s) continue;
            const j = start + o;
            const dx = this.x[i] - this.x[j];
            const dy = this.y[i] - this.y[j];
            const dz = this.z[i] - this.z[j];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 6.25 && d2 > 1e-4) {
              const inv = 1 / d2;
              sx += dx * inv; sy += dy * inv; sz += dz * inv;
            }
          }
          const t = ctx.time + this.ph[i] * 3;
          const k1 = gull ? 0.5 : 0.9;
          let dvx = hvx + (tx - this.x[i]) * k1 + sx * 3 + Math.sin(t * 0.9) * 1.2;
          let dvy = (ty - this.y[i]) * 0.8 + sy * 2 + Math.sin(t * 1.3 + 1) * 0.6;
          let dvz = hvz + (tz - this.z[i]) * k1 + sz * 3 + Math.cos(t * 0.8) * 1.2;
          const sp = Math.hypot(dvx, dvz);
          const maxSp = gull ? 8 : 15;
          if (sp > maxSp) { dvx *= maxSp / sp; dvz *= maxSp / sp; }
          dvy = clamp(dvy, -4, 4);
          const a = Math.min(1, dt * 2.2);
          this.vx[i] += (dvx - this.vx[i]) * a;
          this.vy[i] += (dvy - this.vy[i]) * a;
          this.vz[i] += (dvz - this.vz[i]) * a;
          this.x[i] += this.vx[i] * dt;
          this.y[i] += this.vy[i] * dt;
          this.z[i] += this.vz[i] * dt;
        }
        if (this.vis[i] <= 0.01) continue;
        const hv = Math.hypot(this.vx[i], this.vz[i]);
        const yaw = Math.atan2(this.vx[i], this.vz[i]);
        const pitch = Math.atan2(this.vy[i], Math.max(0.5, hv));
        if (dt > 0) {
          const dyaw = angleDiff(this.yawPrev[i], yaw) / dt;
          this.yawPrev[i] = yaw;
          this.roll[i] += (clamp(-dyaw * 0.45, -0.7, 0.7) - this.roll[i]) * Math.min(1, dt * 3);
        }
        const sc = (gull ? GULL_SCALE : FLYER_SCALE) * (0.35 + 0.65 * this.vis[i]) * (this.vis[i] > 0.05 ? 1 : this.vis[i] / 0.05);
        setPose(this.mesh, k, this.x[i], this.y[i], this.z[i], yaw, pitch, this.roll[i], sc);
        const o = k * 4;
        const glideBlend = 0.5 + 0.5 * Math.sin(ctx.time * 1.1 + this.ph[i]);
        this.anim[o] = gull ? 0.3 + 0.3 * glideBlend : clamp(0.15 + 1.2 * glideBlend, 0.15, 1);
        this.anim[o + 1] = this.ph[i];
        this.anim[o + 2] = gull ? 0.32 : 0.9 + (this.ph[i] % 0.3);
        this.anim[o + 3] = 0;
        // colour order must follow the instance: copy tint of instance i into slot k
        this.copyColour(i, k);
        k++;
      }
    }
    this.visible = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    (this.mesh.geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;

    // bird calls
    if (dt > 0 && !night) {
      this.callTimer -= dt;
      if (this.callTimer <= 0) {
        this.callTimer = 6 + this.rng() * 8;
        const g = Math.floor(this.rng() * 3);
        if (this.act[g] > 2) this.emit('bird-call', this.lx[g], this.lz[g]);
      }
    }
  }

  private colourSrc: Float32Array | null = null;
  private colourCopyReady = false;

  private copyColour(src: number, dst: number): void {
    const attr = this.mesh.instanceColor;
    if (!attr) return;
    if (!this.colourCopyReady) {
      this.colourSrc = new Float32Array(attr.array as Float32Array);
      this.colourCopyReady = true;
    }
    const s = this.colourSrc!;
    const a = attr.array as Float32Array;
    a[dst * 3] = s[src * 3];
    a[dst * 3 + 1] = s[src * 3 + 1];
    a[dst * 3 + 2] = s[src * 3 + 2];
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
