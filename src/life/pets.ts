// Cats, squirrels, butterflies and bees. Instanced, shader-animated, state in typed arrays.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { CityLayout } from '../city/layout';
import { trafficLife } from '../config/tuning';
import { angleDiff, clamp, scaledCount, setPose } from './common';
import type { EmitFn, LifeContext, LifeQuality } from './common';
import { buildCatGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import type { AnimalUniforms } from './material';
import { openSpaceSpots, roofHeight, roofSpots } from './spots';

const CURB = 0.15;
const CAT_SCALE = 1.25;

export function triCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}

export function disposeMesh(m: THREE.InstancedMesh): void {
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

// Population counts for the squirrel, butterfly and bee systems (their classes live in squirrels.ts and butterflies.ts).
export function squirrelCountFor(quality: LifeQuality): number {
  return scaledCount(trafficLife.squirrelCount, quality);
}

export function butterflyCountFor(quality: LifeQuality): number {
  return scaledCount(trafficLife.butterflyCount, quality);
}

/** Bees among n butterflies (one in five). */
export function beeCountFor(n: number): number {
  return Math.floor(n * trafficLife.beeShare);
}


// roofHeight is re-exported for tests that want to check perch heights.
export { roofHeight };
