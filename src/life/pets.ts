// Cats, squirrels, butterflies and bees. Instanced, shader-animated, state in typed arrays.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { CityLayout } from '../city/layout';
import { trafficLife } from '../config/tuning';
import { angleDiff, clamp, scaledCount, setPose } from './common';
import type { EmitFn, LifeContext, LifeQuality } from './common';
import { buildButterflyGeometry, buildCatGeometry, buildSquirrelGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import type { AnimalUniforms } from './material';
import { openSpaceSpots, roofHeight, roofSpots } from './spots';

const CURB = 0.15;
const CAT_SCALE = 1.25;
const SQUIRREL_SCALE = 1.6;

function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}

function disposeMesh(m: THREE.InstancedMesh): void {
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
  m.dispose();
}

// ---------------------------------------------------------------------------------------------
// Cats

const CAT_TINTS = [0xe5a050, 0x9a9ca4, 0x2a2a30, 0xeadcc0, 0xa07a50, 0xf2f2f0, 0xd78a3c];

export class CatSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms: AnimalUniforms;
  readonly capacity: number;
  readonly triangles: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vis: Float32Array;
  /** 0 doorstep, 1 bench, 2 roof, 3 walker, 4 courtyard. */
  readonly kind: Uint8Array;

  private readonly hd: Float32Array;
  private readonly pose: Float32Array;
  private readonly ph: Float32Array;
  private readonly tx: Float32Array;
  private readonly tz: Float32Array;
  private readonly ax: Float32Array;
  private readonly az: Float32Array;
  private readonly bx: Float32Array;
  private readonly bz: Float32Array;
  private readonly tm: Float32Array;
  private readonly walking: Uint8Array;
  private readonly anim: Float32Array;
  private readonly emit: EmitFn;
  private readonly rng: () => number;
  private meowTimer = 20;
  private visCount = 0;

  constructor(layout: CityLayout, seed: number, quality: LifeQuality, emit: EmitFn) {
    this.emit = emit;
    const place = createRng((seed ^ 0xca7ca7) >>> 0);
    this.rng = createRng((seed ^ 0x1badcafe) >>> 0);
    const n = scaledCount(trafficLife.catCount, quality);
    this.capacity = n;
    const geo = buildCatGeometry();
    this.triangles = triCount(geo);
    const { material, uniforms } = createAnimalMaterial('cat');
    this.uniforms = uniforms;
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'life-cats';
    this.mesh.count = 0;
    this.anim = attachAnim(this.mesh, n);

    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.vis = f(); this.hd = f(); this.pose = f(); this.ph = f();
    this.tx = f(); this.tz = f(); this.ax = f(); this.az = f(); this.bx = f(); this.bz = f(); this.tm = f();
    this.kind = new Uint8Array(n);
    this.walking = new Uint8Array(n);

    // candidate pools
    const roofs = roofSpots(layout, place, 30, 2);
    const yards = openSpaceSpots(layout, place, 30);
    const lots = layout.lots;
    const benches = layout.benches;
    // interleaved kinds so small counts still get variety
    const order = [0, 3, 1, 2, 4, 0, 3, 2, 0, 1, 4, 3, 0, 2, 1, 4];
    const tint = new THREE.Color();
    const usedBench = new Set<number>();
    const usedRoof = new Set<number>();
    for (let i = 0; i < n; i++) {
      let kind = order[i % order.length];
      // fall back when a pool is empty
      if (kind === 1 && benches.length === 0) kind = 0;
      if (kind === 2 && roofs.length === 0) kind = 0;
      if (kind === 4 && yards.length === 0) kind = 0;
      if ((kind === 0 || kind === 3) && lots.length === 0 && layout.roads.length === 0) kind = roofs.length ? 2 : 4;
      this.kind[i] = kind;
      this.ph[i] = place() * 6.28;
      this.vis[i] = 1;
      this.pose[i] = place() < 0.45 ? 1 : 0;
      this.tm[i] = 3 + place() * 10;
      let px = 0;
      let py = 0;
      let pz = 0;
      let face = place() * Math.PI * 2;
      if (kind === 0 && lots.length > 0) {
        const lot = lots[Math.floor(place() * lots.length)];
        const fx = Math.sin(lot.facing);
        const fz = Math.cos(lot.facing);
        const u = (place() - 0.5) * Math.max(0.5, lot.width - 2);
        px = lot.position.x + fx * (lot.depth / 2 + 0.45) + fz * u;
        pz = lot.position.z + fz * (lot.depth / 2 + 0.45) - fx * u;
        py = CURB;
        face = lot.facing + (place() - 0.5) * 1.4;
      } else if (kind === 1) {
        let bi = Math.floor(place() * benches.length);
        for (let g = 0; g < 8 && usedBench.has(bi); g++) bi = Math.floor(place() * benches.length);
        usedBench.add(bi);
        const bn = benches[bi];
        px = bn.position.x + Math.cos(bn.facing) * (place() - 0.5) * 0.8;
        pz = bn.position.z - Math.sin(bn.facing) * (place() - 0.5) * 0.8;
        py = 0.5;
        face = bn.facing + (place() < 0.5 ? 0 : Math.PI / 2);
      } else if (kind === 2) {
        let ri = Math.floor(place() * roofs.length);
        for (let g = 0; g < 8 && usedRoof.has(ri); g++) ri = Math.floor(place() * roofs.length);
        usedRoof.add(ri);
        const s = roofs[ri];
        px = s[0]; py = s[1] - 0.35; pz = s[2]; face = s[3];
      } else if (kind === 3 && layout.roads.length > 0) {
        const r = layout.roads[Math.floor(place() * layout.roads.length)];
        const side = place() < 0.5 ? -1 : 1;
        const off = side * (r.width / 2 + 0.55);
        const len = 6 + place() * 8;
        const t = place() * 0.6 + 0.2;
        if (r.orientation === 'horizontal') {
          const x0 = r.start.x + (r.end.x - r.start.x) * t;
          this.ax[i] = x0; this.bx[i] = x0 + len; this.az[i] = r.start.z + off; this.bz[i] = r.start.z + off;
        } else {
          const z0 = r.start.z + (r.end.z - r.start.z) * t;
          this.ax[i] = r.start.x + off; this.bx[i] = r.start.x + off; this.az[i] = z0; this.bz[i] = z0 + len;
        }
        px = this.ax[i]; pz = this.az[i]; py = CURB;
        this.walking[i] = 1;
        this.pose[i] = 2;
        this.tx[i] = this.bx[i]; this.tz[i] = this.bz[i];
        this.tm[i] = place() * 6;
        face = Math.atan2(this.tx[i] - px, this.tz[i] - pz);
      } else if (kind === 4 && yards.length > 0) {
        const s = yards[Math.floor(place() * yards.length)];
        px = s[0]; py = 0.04; pz = s[2]; face = s[3];
        this.pose[i] = 1;
      } else {
        // empty layout: park the cat at the origin
        px = 0; pz = 0; py = 0;
      }
      this.x[i] = px; this.y[i] = py; this.z[i] = pz; this.hd[i] = face;
      tint.set(CAT_TINTS[Math.floor(place() * CAT_TINTS.length)]);
      this.mesh.setColorAt(i, tint);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get visibleCount(): number {
    return this.visCount;
  }

  update(dt: number, ctx: LifeContext): void {
    this.uniforms.uTime.value = ctx.time;
    this.uniforms.uNight.value += ((ctx.night ? 1 : 0) - this.uniforms.uNight.value) * (dt > 0 ? Math.min(1, dt * 1.5) : 0);
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    const rain = ctx.rain ?? 0;
    const target = rain > 0.35 ? 0 : 1;
    const cam = ctx.camera;
    let k = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.vis[i] += clamp(target - this.vis[i], -dt * 0.6, dt * 0.6);
      if (dt > 0 && this.walking[i]) this.stepWalker(i, dt);
      if (this.vis[i] <= 0.02) continue;
      let glow = 0;
      if (ctx.night) {
        if (cam) {
          const dx = cam.x - this.x[i];
          const dy = cam.y - this.y[i];
          const dz = cam.z - this.z[i];
          glow = dx * dx + dy * dy + dz * dz < 3600 ? 1 : 0;
        } else glow = 1;
      }
      setPose(this.mesh, k, this.x[i], this.y[i], this.z[i], this.hd[i], 0, 0, CAT_SCALE * this.vis[i]);
      const o = k * 4;
      this.anim[o] = glow;
      this.anim[o + 1] = this.ph[i];
      this.anim[o + 2] = 0.9;
      this.anim[o + 3] = this.pose[i];
      this.copyColour(i, k);
      k++;
    }
    this.visCount = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    (this.mesh.geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;

    if (dt > 0 && target > 0 && this.capacity > 0) {
      this.meowTimer -= dt;
      if (this.meowTimer <= 0) {
        this.meowTimer = 25 + this.rng() * 50;
        const i = Math.floor(this.rng() * this.capacity);
        if (this.vis[i] > 0.5) this.emit('cat-meow', this.x[i], this.z[i]);
      }
    }
  }

  private stepWalker(i: number, dt: number): void {
    if (this.tm[i] > 0) {
      // sitting pause between walks
      this.tm[i] -= dt;
      this.pose[i] = this.tm[i] > 0 ? 0 : 2;
      return;
    }
    this.pose[i] = 2;
    const dx = this.tx[i] - this.x[i];
    const dz = this.tz[i] - this.z[i];
    const d = Math.hypot(dx, dz);
    if (d < 0.2) {
      const toB = this.tx[i] === this.bx[i] && this.tz[i] === this.bz[i];
      this.tx[i] = toB ? this.ax[i] : this.bx[i];
      this.tz[i] = toB ? this.az[i] : this.bz[i];
      this.tm[i] = 4 + this.rng() * 10;
      this.pose[i] = 0;
      return;
    }
    const want = Math.atan2(dx, dz);
    this.hd[i] += angleDiff(this.hd[i], want) * Math.min(1, dt * 4);
    const s = 0.6;
    this.x[i] += Math.sin(this.hd[i]) * s * dt;
    this.z[i] += Math.cos(this.hd[i]) * s * dt;
  }

  private colourSrc: Float32Array | null = null;
  private copyColour(src: number, dst: number): void {
    const attr = this.mesh.instanceColor;
    if (!attr) return;
    if (!this.colourSrc) this.colourSrc = new Float32Array(attr.array as Float32Array);
    const a = attr.array as Float32Array;
    a[dst * 3] = this.colourSrc[src * 3];
    a[dst * 3 + 1] = this.colourSrc[src * 3 + 1];
    a[dst * 3 + 2] = this.colourSrc[src * 3 + 2];
  }

  dispose(): void {
    disposeMesh(this.mesh);
  }
}

// ---------------------------------------------------------------------------------------------
// Squirrels

const S_FREEZE = 0;
const S_HOP = 1;
const S_CLIMB_UP = 2;
const S_TREE = 3;
const S_CLIMB_DOWN = 4;
const TRUNK = 0.32;

export class SquirrelSystem {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms: AnimalUniforms;
  readonly capacity: number;
  readonly triangles: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vis: Float32Array;
  readonly state: Uint8Array;

  private readonly hd: Float32Array;
  private readonly pitch: Float32Array;
  private readonly tx: Float32Array;
  private readonly tz: Float32Array;
  private readonly treeX: Float32Array;
  private readonly treeZ: Float32Array;
  private readonly trunkAng: Float32Array;
  private readonly wander: Float32Array;
  private readonly climbTo: Float32Array;
  private readonly tm: Float32Array;
  private readonly hop: Float32Array;
  private readonly fleeing: Uint8Array;
  private readonly ph: Float32Array;
  private readonly anim: Float32Array;
  private readonly rng: () => number;
  private frame = 0;
  private visCount = 0;
  private readonly bounds: CityLayout['townBounds'];

  constructor(layout: CityLayout, seed: number, quality: LifeQuality) {
    const place = createRng((seed ^ 0x5017e1) >>> 0);
    this.rng = createRng((seed ^ 0x2468ace) >>> 0);
    this.bounds = layout.townBounds;
    const n = layout.streetTrees.length > 0 ? scaledCount(trafficLife.squirrelCount, quality) : 0;
    this.capacity = n;
    const geo = buildSquirrelGeometry();
    this.triangles = triCount(geo);
    const { material, uniforms } = createAnimalMaterial('squirrel');
    this.uniforms = uniforms;
    this.mesh = new THREE.InstancedMesh(geo, material, Math.max(1, n));
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'life-squirrels';
    this.mesh.count = 0;
    this.anim = attachAnim(this.mesh, Math.max(1, n));

    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.vis = f(); this.hd = f(); this.pitch = f();
    this.tx = f(); this.tz = f(); this.treeX = f(); this.treeZ = f(); this.trunkAng = f(); this.wander = f();
    this.climbTo = f(); this.tm = f(); this.hop = f(); this.ph = f();
    this.state = new Uint8Array(n);
    this.fleeing = new Uint8Array(n);
    const trees = layout.streetTrees;
    for (let i = 0; i < n; i++) {
      const t = trees[Math.floor(place() * trees.length)];
      this.treeX[i] = t.position.x;
      this.treeZ[i] = t.position.z;
      this.trunkAng[i] = place() * Math.PI * 2;
      this.wander[i] = t.setting === 'street' ? 1.3 : 3.5;
      this.ph[i] = place() * 6.28;
      const a = place() * Math.PI * 2;
      const r = 0.6 + place() * this.wander[i];
      this.x[i] = this.treeX[i] + Math.sin(a) * r;
      this.z[i] = this.treeZ[i] + Math.cos(a) * r;
      this.y[i] = 0.1;
      this.state[i] = S_FREEZE;
      this.tm[i] = place() * 4;
      this.hd[i] = place() * Math.PI * 2;
      this.mesh.setColorAt(i, new THREE.Color(0xffffff));
    }
  }

  get visibleCount(): number {
    return this.visCount;
  }

  /** How many squirrels the season allows. */
  static allowed(season: LifeContext['season'], capacity: number): number {
    if (season === 'winter') return 0;
    if (season === 'summer') return Math.ceil(capacity * 0.5);
    return capacity;
  }

  update(dt: number, ctx: LifeContext): void {
    this.uniforms.uTime.value = ctx.time;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.frame++;
    const rain = ctx.rain ?? 0;
    const allowed = ctx.night || rain > 0.5 ? 0 : SquirrelSystem.allowed(ctx.season, this.capacity);
    const ped = ctx.pedestrians;
    const r = this.rng;
    let k = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.vis[i] += clamp((i < allowed ? 1 : 0) - this.vis[i], -dt * 0.8, dt * 0.8);
      if (dt > 0 && this.vis[i] > 0.02) {
        // flee from walkers (staggered)
        if (this.state[i] !== S_CLIMB_UP && this.state[i] !== S_TREE && this.state[i] !== S_CLIMB_DOWN && (i + this.frame) % 4 === 0) {
          for (let p = 0; p < ped.length; p++) {
            const q = ped[p].position;
            const dx = q.x - this.x[i];
            const dz = q.z - this.z[i];
            if (dx * dx + dz * dz < 9) {
              this.fleeing[i] = 1;
              this.toTrunk(i);
              break;
            }
          }
        }
        this.step(i, dt, r);
      }
      if (this.vis[i] <= 0.02) continue;
      const up = this.state[i] === S_CLIMB_UP || this.state[i] === S_TREE || this.state[i] === S_CLIMB_DOWN;
      let yaw = this.hd[i];
      let px = this.x[i];
      let pz = this.z[i];
      let py = this.y[i];
      if (up) {
        // belly to the trunk: face the tree, stand on its surface
        yaw = this.state[i] === S_CLIMB_DOWN ? this.trunkAng[i] : this.trunkAng[i] + Math.PI;
        px = this.treeX[i] + Math.sin(this.trunkAng[i]) * (TRUNK + 0.03);
        pz = this.treeZ[i] + Math.cos(this.trunkAng[i]) * (TRUNK + 0.03);
      }
      setPose(this.mesh, k, px, py, pz, yaw, this.pitch[i], 0, SQUIRREL_SCALE * this.vis[i]);
      const o = k * 4;
      this.anim[o] = this.state[i] === S_FREEZE || this.state[i] === S_TREE ? 1 : 0.2;
      this.anim[o + 1] = this.ph[i];
      this.anim[o + 2] = 0;
      this.anim[o + 3] = 0;
      k++;
    }
    this.visCount = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;
  }

  private toTrunk(i: number): void {
    this.tx[i] = this.treeX[i] + Math.sin(this.trunkAng[i]) * (TRUNK + 0.1);
    this.tz[i] = this.treeZ[i] + Math.cos(this.trunkAng[i]) * (TRUNK + 0.1);
    this.state[i] = S_HOP;
    this.hop[i] = 0;
  }

  private step(i: number, dt: number, r: () => number): void {
    switch (this.state[i]) {
      case S_FREEZE: {
        this.tm[i] -= dt;
        this.pitch[i] += (0.9 - this.pitch[i]) * Math.min(1, dt * 6);
        this.y[i] += (0.0 - this.y[i]) * Math.min(1, dt * 8);
        if (this.tm[i] <= 0) {
          if (r() < 0.3) {
            this.toTrunk(i);
          } else {
            const a = r() * Math.PI * 2;
            const d = 0.4 + r() * this.wander[i];
            let nx = this.treeX[i] + Math.sin(a) * d;
            let nz = this.treeZ[i] + Math.cos(a) * d;
            nx = clamp(nx, this.bounds.minX + 2, this.bounds.maxX - 2);
            nz = clamp(nz, this.bounds.minZ + 2, this.bounds.maxZ - 2);
            this.tx[i] = nx;
            this.tz[i] = nz;
            this.state[i] = S_HOP;
            this.hop[i] = 0;
          }
        }
        break;
      }
      case S_HOP: {
        const dx = this.tx[i] - this.x[i];
        const dz = this.tz[i] - this.z[i];
        const d = Math.hypot(dx, dz);
        const speed = this.fleeing[i] ? 4.2 : 2.0;
        this.hop[i] += dt * (this.fleeing[i] ? 9 : 5);
        const bound = Math.abs(Math.sin(this.hop[i]));
        this.y[i] = bound * 0.13;
        this.pitch[i] += (0.15 + 0.25 * Math.cos(this.hop[i]) - this.pitch[i]) * Math.min(1, dt * 12);
        if (d < 0.12) {
          if (Math.hypot(this.tx[i] - this.treeX[i], this.tz[i] - this.treeZ[i]) < TRUNK + 0.2) {
            this.state[i] = S_CLIMB_UP;
            this.climbTo[i] = 1.6 + r() * 1.8;
            this.trunkAng[i] = Math.atan2(this.x[i] - this.treeX[i], this.z[i] - this.treeZ[i]);
            this.y[i] = 0.05;
          } else {
            this.state[i] = S_FREEZE;
            this.tm[i] = 1 + r() * 3.5;
            this.y[i] = 0;
          }
        } else {
          const want = Math.atan2(dx, dz);
          this.hd[i] += angleDiff(this.hd[i], want) * Math.min(1, dt * 14);
          const s = Math.min(d / Math.max(dt, 1e-3), speed * (0.4 + bound));
          this.x[i] += (dx / d) * s * dt;
          this.z[i] += (dz / d) * s * dt;
        }
        break;
      }
      case S_CLIMB_UP: {
        this.pitch[i] += (1.45 - this.pitch[i]) * Math.min(1, dt * 8);
        this.y[i] += 1.3 * dt * (0.6 + Math.abs(Math.sin(this.ph[i] + this.y[i] * 9)));
        if (this.y[i] >= this.climbTo[i]) {
          this.state[i] = S_TREE;
          this.tm[i] = this.fleeing[i] ? 5 + r() * 5 : 2 + r() * 5;
        }
        break;
      }
      case S_TREE: {
        this.tm[i] -= dt;
        this.pitch[i] += (1.45 - this.pitch[i]) * Math.min(1, dt * 8);
        if (this.tm[i] <= 0) this.state[i] = S_CLIMB_DOWN;
        break;
      }
      case S_CLIMB_DOWN: {
        this.pitch[i] += (-1.45 - this.pitch[i]) * Math.min(1, dt * 8);
        this.y[i] -= 1.6 * dt;
        if (this.y[i] <= 0.06) {
          this.y[i] = 0;
          this.fleeing[i] = 0;
          this.x[i] = this.treeX[i] + Math.sin(this.trunkAng[i]) * (TRUNK + 0.1);
          this.z[i] = this.treeZ[i] + Math.cos(this.trunkAng[i]) * (TRUNK + 0.1);
          this.hd[i] = this.trunkAng[i];
          this.state[i] = S_FREEZE;
          this.tm[i] = 1.5 + r() * 3;
        }
        break;
      }
      default:
        break;
    }
  }

  dispose(): void {
    disposeMesh(this.mesh);
  }
}

// ---------------------------------------------------------------------------------------------
// Butterflies and bees (polish)

const BF_TINTS = [0xffd23a, 0xf28a2e, 0xf4f4ee, 0x6aa7e8, 0xe879b0, 0xc9e04a];

export class ButterflySystem {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms: AnimalUniforms;
  readonly capacity: number;
  readonly triangles: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vis: Float32Array;

  private readonly hd: Float32Array;
  private readonly ax: Float32Array;
  private readonly az: Float32Array;
  private readonly rad: Float32Array;
  private readonly fa: Float32Array;
  private readonly fb: Float32Array;
  private readonly p1: Float32Array;
  private readonly p2: Float32Array;
  private readonly p3: Float32Array;
  private readonly bee: Uint8Array;
  private readonly anim: Float32Array;
  private visCount = 0;
  private colourSrc: Float32Array | null = null;

  constructor(layout: CityLayout, seed: number, quality: LifeQuality) {
    const place = createRng((seed ^ 0xb077e5) >>> 0);
    const n = scaledCount(trafficLife.butterflyCount, quality);
    this.capacity = n;
    const geo = buildButterflyGeometry();
    this.triangles = triCount(geo);
    const { material, uniforms } = createAnimalMaterial('butterfly');
    this.uniforms = uniforms;
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'life-butterflies';
    this.mesh.count = 0;
    this.anim = attachAnim(this.mesh, n);
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.z = f(); this.vis = f(); this.hd = f();
    this.ax = f(); this.az = f(); this.rad = f(); this.fa = f(); this.fb = f(); this.p1 = f(); this.p2 = f(); this.p3 = f();
    this.bee = new Uint8Array(n);

    // anchors: courtyard and plaza trees first, then courtyard centres, then any tree
    const anchors: number[][] = [];
    for (const t of layout.streetTrees) if (t.setting !== 'street') anchors.push([t.position.x, t.position.z, 2.5]);
    for (const b of layout.blocks) {
      if (b.courtyard) {
        const c = b.courtyard;
        anchors.push([(c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2, Math.min(5, (c.maxX - c.minX) / 3)]);
      }
    }
    if (anchors.length === 0) for (const t of layout.streetTrees) anchors.push([t.position.x, t.position.z, 1.6]);
    if (anchors.length === 0) anchors.push([0, 0, 3]);
    const bees = Math.floor(n * 0.2);
    const tint = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = anchors[Math.floor(place() * anchors.length)];
      this.ax[i] = a[0];
      this.az[i] = a[1];
      this.bee[i] = i >= n - bees ? 1 : 0;
      this.rad[i] = this.bee[i] ? 0.8 + place() * 1.2 : 1.2 + place() * a[2];
      this.fa[i] = (this.bee[i] ? 0.9 : 0.35) + place() * 0.35;
      this.fb[i] = (this.bee[i] ? 1.1 : 0.45) + place() * 0.35;
      this.p1[i] = place() * 6.28;
      this.p2[i] = place() * 6.28;
      this.p3[i] = place() * 6.28;
      tint.set(this.bee[i] ? 0xe3a61f : BF_TINTS[Math.floor(place() * BF_TINTS.length)]);
      this.mesh.setColorAt(i, tint);
      this.pos(i, 0);
    }
  }

  get visibleCount(): number {
    return this.visCount;
  }

  private pos(i: number, t: number): void {
    const r = this.rad[i];
    this.x[i] = this.ax[i] + Math.sin(t * this.fa[i] + this.p1[i]) * r + Math.sin(t * this.fa[i] * 2.3 + this.p2[i]) * r * 0.35;
    this.z[i] = this.az[i] + Math.cos(t * this.fb[i] + this.p2[i]) * r + Math.cos(t * this.fb[i] * 1.9 + this.p3[i]) * r * 0.35;
    const base = this.bee[i] ? 0.45 : 0.6;
    this.y[i] = base + (0.5 + 0.5 * Math.sin(t * 0.6 + this.p3[i])) * (this.bee[i] ? 0.6 : 1.3);
  }

  /** Daytime window for flying insects, in hours. */
  static isActive(season: LifeContext['season'], timeOfDay: number, rain: number, windSpeed: number, night: boolean): boolean {
    if (season === 'autumn' || season === 'winter') return false;
    if (night || rain > 0.2 || windSpeed > 7.5) return false;
    return timeOfDay >= 8 && timeOfDay <= 18.5;
  }

  update(dt: number, ctx: LifeContext): void {
    this.uniforms.uTime.value = ctx.time;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    const windSpd = Math.hypot(ctx.wind.x, ctx.wind.z);
    const on = ButterflySystem.isActive(ctx.season, ctx.timeOfDay, ctx.rain ?? 0, windSpd, ctx.night);
    const allowed = ctx.season === 'summer' ? this.capacity : Math.ceil(this.capacity * 0.8);
    let k = 0;
    for (let i = 0; i < this.capacity; i++) {
      this.vis[i] += clamp((on && i < allowed ? 1 : 0) - this.vis[i], -dt * 0.7, dt * 0.7);
      if (this.vis[i] <= 0.02) continue;
      const px = this.x[i];
      const pz = this.z[i];
      this.pos(i, ctx.time);
      if (dt > 0) {
        const dx = this.x[i] - px;
        const dz = this.z[i] - pz;
        if (dx * dx + dz * dz > 1e-8) {
          const want = Math.atan2(dx, dz);
          this.hd[i] += angleDiff(this.hd[i], want) * Math.min(1, dt * 5);
        }
      }
      const sc = (this.bee[i] ? 2.2 : 3.2) * this.vis[i];
      setPose(this.mesh, k, this.x[i], this.y[i], this.z[i], this.hd[i], 0, Math.sin(ctx.time * 1.7 + this.p1[i]) * 0.3, sc);
      const o = k * 4;
      this.anim[o] = 0;
      this.anim[o + 1] = this.p1[i];
      this.anim[o + 2] = (this.p2[i] % 3);
      this.anim[o + 3] = this.bee[i];
      this.copyColour(i, k);
      k++;
    }
    this.visCount = k;
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    (this.mesh.geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;
  }

  private copyColour(src: number, dst: number): void {
    const attr = this.mesh.instanceColor;
    if (!attr) return;
    if (!this.colourSrc) this.colourSrc = new Float32Array(attr.array as Float32Array);
    const a = attr.array as Float32Array;
    a[dst * 3] = this.colourSrc[src * 3];
    a[dst * 3 + 1] = this.colourSrc[src * 3 + 1];
    a[dst * 3 + 2] = this.colourSrc[src * 3 + 2];
  }

  dispose(): void {
    disposeMesh(this.mesh);
  }
}

// roofHeight is re-exported for tests that want to check perch heights.
export { roofHeight };
