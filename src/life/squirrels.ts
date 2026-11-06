// Squirrels: ground foragers that climb street trees. State lives in typed arrays; the class is built by pets.ts counts.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { CityLayout } from '../city/layout';
import { angleDiff, clamp, setPose } from './common';
import type { LifeContext, LifeQuality } from './common';
import { buildSquirrelGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import type { AnimalUniforms } from './material';
import { disposeMesh, squirrelCountFor, triCount } from './pets';

const SQUIRREL_SCALE = 1.6;

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
    const n = layout.streetTrees.length > 0 ? squirrelCountFor(quality) : 0;
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
