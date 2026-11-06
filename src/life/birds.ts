// Birds: ground/roof pigeons with a scatter state machine, and flying flocks (swallows, starlings, gulls).
// State lives in typed arrays; update() allocates nothing. Placement uses the seeded RNG; runtime motion
// uses a second seeded RNG (never Math.random).

import * as THREE from 'three';
import { createRng } from '../core/rng';
import { trafficLife } from '../config/tuning';
import type { CityLayout } from '../city/layout';
import { scaledCount, setPose } from './common';
import type { EmitFn, LifeContext, LifeQuality } from './common';
import { buildFlyerGeometry, buildPigeonGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import type { AnimalUniforms } from './material';
import { buildSpotSet, openSpaceSpots, roofSpots, sidewalkSpots } from './spots';
import type { SpotSet } from './spots';
import { claim, pigeonUpdate } from './pigeonMotion';
import { flockUpdate, leaderAt } from './flockMotion';

export const SCARE_RADIUS = 4;
const PIGEON_SCALE = 1.6;

export const PERCH = 0;
export const PECK = 1;
export const WALK = 2;
export const SCARED = 3;
export const CLIMB = 4;
export const CIRCLE = 5;
export const LAND = 6;

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

  readonly pitch: Float32Array;
  readonly bank: Float32Array;
  readonly spd: Float32Array;
  readonly tm: Float32Array;
  readonly sub: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly tz: Float32Array;
  readonly alt: Float32Array;
  readonly circ: Float32Array;
  readonly cdir: Float32Array;
  readonly cr: Float32Array;
  readonly landT: Float32Array;
  readonly flap: Float32Array;
  readonly spread: Float32Array;
  readonly peck: Float32Array;
  readonly peckTarget: Float32Array;
  readonly ph: Float32Array;
  readonly anim: Float32Array;

  readonly ground: SpotSet;
  readonly roof: SpotSet;
  readonly occG: Uint8Array;
  readonly occR: Uint8Array;
  readonly rng: () => number;
  readonly emit: EmitFn;
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  frame = 0;
  scatterCooldown = 0;
  roofMode = false;

  constructor(layout: CityLayout, seed: number, quality: LifeQuality, emit: EmitFn) {
    this.emit = emit;
    this.bounds = layout.townBounds;
    const n = scaledCount(trafficLife.pigeonCount, quality);
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
      claim(this, i, wantRoof ? 1 : 0, place);
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
  update(dt: number, ctx: LifeContext): void {
    pigeonUpdate(this, dt, ctx);
  }

  writeAll(): void {
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

export const FLOCK_DEFS: FlockDef[] = [
  { kind: 0, count: 25, alt: 26, speed: 9 },
  { kind: 1, count: 25, alt: 35, speed: 10.5 },
  { kind: 2, count: 25, alt: 44, speed: 8.5 },
];
export const FLYER_SCALE = 2.6;
export const GULL_SCALE = 4.2;
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

  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly ox: Float32Array;
  readonly oy: Float32Array;
  readonly oz: Float32Array;
  readonly ph: Float32Array;
  readonly yawPrev: Float32Array;
  readonly roll: Float32Array;
  readonly flock: Uint8Array; // 0..2 flocks, 3 gulls
  readonly slot: Uint8Array; // index inside the flock
  readonly anim: Float32Array;
  readonly flockStart: number[] = [];
  readonly flockN: number[] = [];
  readonly theta: Float32Array;
  readonly lx: Float32Array;
  readonly lz: Float32Array;
  readonly lvx: Float32Array;
  readonly lvz: Float32Array;
  readonly ly: Float32Array;
  readonly act: Float32Array; // smoothed active count per flock group
  readonly hx: number;
  readonly hz: number;
  readonly cx: number;
  readonly cz: number;
  readonly emit: EmitFn;
  readonly rng: () => number;
  callTimer = 4;
  visible = 0;

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
      leaderAt(this, g, this.theta[g], 0);
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

  tmpX = 0;
  tmpY = 0;
  tmpZ = 0;

  /** Number of visible instances written last frame. */
  get visibleCount(): number {
    return this.visible;
  }

  update(dt: number, ctx: LifeContext): void {
    flockUpdate(this, dt, ctx);
  }

  colourSrc: Float32Array | null = null;
  colourCopyReady = false;

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
