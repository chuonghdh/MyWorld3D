// Butterflies and bees: fluttering instanced flyers. Counts come from pets.ts.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { CityLayout } from '../city/layout';
import { angleDiff, clamp, setPose } from './common';
import type { LifeContext, LifeQuality } from './common';
import { buildButterflyGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import type { AnimalUniforms } from './material';
import { beeCountFor, butterflyCountFor, disposeMesh, triCount } from './pets';

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
    const n = butterflyCountFor(quality);
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
    const bees = beeCountFor(n);
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
