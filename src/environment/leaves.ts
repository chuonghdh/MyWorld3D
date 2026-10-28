// Falling leaves and the leaf devil (a swirling vortex that lifts leaves off the road).
// One InstancedMesh holds every leaf, so the draw call count stays at 1.
// The number of live leaves is bounded by leafAmount (percent of MAX_LEAVES).
// leafSize is a multiplier on the leaf quad (1 = default size).

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { Season } from '../core/types';

/** Hard cap on the number of leaf instances. */
export const MAX_LEAVES = 600;
/** Distance in metres from the camera within which leaves fade out by shrinking. */
const LEAF_NEAR_FADE = 10;

const GROUND_Y = 0.05;
const FALL_SPEED = 0.8; // m/s, terminal fall speed
const WIND_DRAG = 0.5; // 1/s, how fast a leaf adopts the wind velocity
const GROUND_LIFETIME_S = 25;
const DEVIL_RADIUS = 5; // m
const DEVIL_HEIGHT = 9; // m, top of the vortex
const DEVIL_SPEED = 2.2; // m/s, roaming speed of the vortex centre
const LEAF_COLORS = ['#c8552a', '#d4862a', '#e0b23a', '#a8452a', '#b9a02e'];

export interface LeafBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LeafSettings {
  /** Percent of MAX_LEAVES that may be live at once, 0-100. */
  leafAmount: number;
  /** Size multiplier of each leaf, 1 = default. */
  leafSize: number;
  season: Season;
}

export interface LeafSystemOptions {
  bounds: LeafBounds;
  seed?: number;
}

interface Point2 {
  x: number;
  z: number;
}

type State = 0 | 1 | 2 | 3;
const INACTIVE: State = 0;
const FALLING: State = 1;
const GROUND: State = 2;
const CAPTURED: State = 3;

interface Devil {
  x: number;
  z: number;
  vx: number;
  vz: number;
  age: number;
  life: number;
}

interface Leaf {
  state: State;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rot: number;
  phase: number;
  /** Ground lifetime, or time left inside a devil. */
  timer: number;
  orbitAngle: number;
  orbitR: number;
  captor: Devil | null;
}

export class LeafSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly leaves: Leaf[] = [];
  private readonly devils: Devil[] = [];
  private readonly rng: () => number;
  private readonly bounds: LeafBounds;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private trees: Point2[] = [];
  private limit = 0;
  private size = 1;
  private season: Season = 'autumn';
  private spawnAcc = 0;
  private time = 0;

  constructor(opts: LeafSystemOptions) {
    this.bounds = opts.bounds;
    this.rng = createRng(opts.seed ?? 1337);

    const geometry = new THREE.PlaneGeometry(0.5, 0.35);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    // A leaf that drifts close to the camera would fill the screen as a giant slab, so each leaf
    // shrinks to nothing within LEAF_NEAR_FADE metres of the camera.
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 leafWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float leafDist = distance(leafWorld, cameraPosition);
  transformed *= smoothstep(${LEAF_NEAR_FADE.toFixed(1)} * 0.35, ${LEAF_NEAR_FADE.toFixed(1)}, leafDist);
#endif`,
      );
    };
    material.customProgramCacheKey = () => 'leaf-near-fade-v1';
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_LEAVES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;

    for (let i = 0; i < MAX_LEAVES; i++) {
      this.leaves.push({
        state: INACTIVE,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rot: 0,
        phase: this.rng() * Math.PI * 2,
        timer: 0,
        orbitAngle: 0,
        orbitR: 0,
        captor: null,
      });
      this.color.set(LEAF_COLORS[Math.floor(this.rng() * LEAF_COLORS.length)]);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Tree positions on the ground. Autumn leaves fall from these points. */
  setTreePoints(points: readonly Point2[]): void {
    this.trees = points.map((p) => ({ x: p.x, z: p.z }));
  }

  /** Number of leaves currently in use (falling, resting or in a devil). */
  activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.limit; i++) if (this.leaves[i].state !== INACTIVE) n++;
    return n;
  }

  /** Number of active leaf devils. */
  devilCount(): number {
    return this.devils.length;
  }

  /** Start a leaf devil at (x, z) on the road. It roams for `life` seconds. */
  spawnLeafDevil(x: number, z: number, life = 12): void {
    if (this.devils.length >= 2) return;
    const angle = this.rng() * Math.PI * 2;
    this.devils.push({
      x,
      z,
      vx: Math.cos(angle) * DEVIL_SPEED,
      vz: Math.sin(angle) * DEVIL_SPEED,
      age: 0,
      life,
    });
  }

  /** Clear all leaves and devils. */
  reset(): void {
    for (const leaf of this.leaves) {
      leaf.state = INACTIVE;
      leaf.timer = 0;
      leaf.captor = null;
    }
    this.devils.length = 0;
    this.spawnAcc = 0;
    this.time = 0;
    this.mesh.count = 0;
  }

  /**
   * Advance the simulation.
   * @param dt seconds since the last call (clamped to 0.1s)
   * @param wind wind velocity on the ground plane, (east, south) in m/s
   * @param settings optional live settings from WorldSettings
   */
  update(dt: number, wind: { x: number; z: number }, settings?: Partial<LeafSettings>): void {
    const step = Math.min(Math.max(dt, 0), 0.1);
    this.time += step;

    if (settings) {
      if (settings.leafAmount !== undefined) {
        const pct = Math.min(100, Math.max(0, settings.leafAmount));
        this.limit = Math.floor((MAX_LEAVES * pct) / 100);
      }
      if (settings.leafSize !== undefined) this.size = Math.max(0.05, settings.leafSize);
      if (settings.season !== undefined) this.season = settings.season;
    }

    const windSpeed = Math.hypot(wind.x, wind.z);

    // In autumn, spawn falling leaves from trees at a rate that fills the limit in about 12s.
    if (this.season === 'autumn' && this.trees.length > 0) {
      this.spawnAcc += step * (this.limit / 12);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnFromTree();
      }
    }

    for (let i = this.devils.length - 1; i >= 0; i--) {
      this.stepDevil(this.devils[i], step);
      if (this.devils[i].age >= this.devils[i].life) this.devils.splice(i, 1);
    }

    for (let i = 0; i < this.limit; i++) {
      const leaf = this.leaves[i];
      if (leaf.state === CAPTURED) this.stepCaptured(leaf, step);
      else this.stepLeaf(leaf, step, wind, windSpeed);
    }

    this.writeInstances();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }

  private spawnFromTree(): void {
    let leaf: Leaf | undefined;
    for (let i = 0; i < this.limit; i++) {
      if (this.leaves[i].state === INACTIVE) {
        leaf = this.leaves[i];
        break;
      }
    }
    if (!leaf) return;
    const tree = this.trees[Math.floor(this.rng() * this.trees.length)];
    leaf.state = FALLING;
    leaf.x = tree.x + (this.rng() - 0.5) * 4;
    leaf.z = tree.z + (this.rng() - 0.5) * 4;
    leaf.y = 6 + this.rng() * 6;
    leaf.vx = 0;
    leaf.vy = -FALL_SPEED;
    leaf.vz = 0;
    leaf.rot = this.rng() * Math.PI * 2;
  }

  private stepLeaf(leaf: Leaf, dt: number, wind: { x: number; z: number }, windSpeed: number): void {
    if (leaf.state === INACTIVE) return;

    if (leaf.state === FALLING) {
      // Adopt the wind velocity gradually, add a flutter, then fall.
      const k = Math.min(1, WIND_DRAG * dt);
      leaf.vx += (wind.x * 0.4 - leaf.vx) * k;
      leaf.vz += (wind.z * 0.4 - leaf.vz) * k;
      leaf.vy += (-FALL_SPEED - leaf.vy) * Math.min(1, dt * 2);
      const flutter = Math.sin(this.time * 2.3 + leaf.phase) * 0.4;
      leaf.x += (leaf.vx + flutter) * dt;
      leaf.z += (leaf.vz + flutter * 0.5) * dt;
      leaf.y += leaf.vy * dt;
      leaf.rot += dt * (1 + windSpeed * 0.2);
      if (leaf.y <= GROUND_Y) {
        leaf.y = GROUND_Y;
        leaf.state = GROUND;
        leaf.timer = GROUND_LIFETIME_S * (0.7 + 0.6 * this.rng());
      }
      this.keepInBounds(leaf);
      return;
    }

    if (leaf.state === GROUND) {
      leaf.timer -= dt;
      // Strong gusts slide resting leaves and occasionally lift them again.
      if (windSpeed > 4) {
        leaf.x += wind.x * 0.05 * dt;
        leaf.z += wind.z * 0.05 * dt;
        if (this.rng() < (dt * 0.15 * (windSpeed - 4)) / 4) {
          leaf.state = FALLING;
          leaf.y = GROUND_Y + 0.5;
          leaf.vy = 1.5;
        }
      }
      if (leaf.timer <= 0) leaf.state = INACTIVE;
    }
  }

  /** Advance a devil's roaming and try to capture nearby leaves. */
  private stepDevil(devil: Devil, dt: number): void {
    devil.age += dt;
    // Wander with a slowly turning heading.
    const turn = (this.rng() - 0.5) * dt * 1.5;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const vx = devil.vx * cos - devil.vz * sin;
    const vz = devil.vx * sin + devil.vz * cos;
    devil.vx = vx;
    devil.vz = vz;
    devil.x += devil.vx * dt;
    devil.z += devil.vz * dt;
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (devil.x < minX || devil.x > maxX) devil.vx = -devil.vx;
    if (devil.z < minZ || devil.z > maxZ) devil.vz = -devil.vz;
    devil.x = Math.min(maxX, Math.max(minX, devil.x));
    devil.z = Math.min(maxZ, Math.max(minZ, devil.z));

    // Strength ramps up and down over the devil's life.
    const strength = Math.min(1, devil.age / 1.5, (devil.life - devil.age) / 1.5);
    if (strength <= 0) return;

    for (let i = 0; i < this.limit; i++) {
      const leaf = this.leaves[i];
      if (leaf.state !== GROUND && leaf.state !== FALLING) continue;
      const dx = leaf.x - devil.x;
      const dz = leaf.z - devil.z;
      const d = Math.hypot(dx, dz);
      if (d < DEVIL_RADIUS && leaf.y < DEVIL_HEIGHT && this.rng() < dt * 3 * strength) {
        leaf.state = CAPTURED;
        leaf.captor = devil;
        leaf.orbitR = Math.max(0.8, d);
        leaf.orbitAngle = Math.atan2(dz, dx);
        leaf.timer = 4 + this.rng() * 4;
      }
    }
  }

  /** Move a leaf caught in a devil's vortex, or release it when the devil ends or the timer runs out. */
  private stepCaptured(leaf: Leaf, dt: number): void {
    const devil = leaf.captor;
    leaf.timer -= dt;
    if (!devil || devil.age >= devil.life || leaf.timer <= 0) {
      // Release with the tangential velocity of the orbit.
      leaf.state = FALLING;
      leaf.captor = null;
      leaf.vx = -Math.sin(leaf.orbitAngle) * 3;
      leaf.vz = Math.cos(leaf.orbitAngle) * 3;
      leaf.vy = 0.5;
      return;
    }
    leaf.orbitAngle += (3.5 / Math.max(leaf.orbitR, 1)) * dt * 2;
    leaf.orbitR = Math.min(DEVIL_RADIUS, leaf.orbitR + dt * 0.5);
    const targetY = DEVIL_HEIGHT * (0.3 + 0.7 * Math.min(1, leaf.timer / 3));
    leaf.y += (targetY - leaf.y) * Math.min(1, dt * 2);
    leaf.x = devil.x + Math.cos(leaf.orbitAngle) * leaf.orbitR;
    leaf.z = devil.z + Math.sin(leaf.orbitAngle) * leaf.orbitR;
    leaf.rot += dt * 6;
  }

  private keepInBounds(leaf: Leaf): void {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    if (leaf.x < minX || leaf.x > maxX || leaf.z < minZ || leaf.z > maxZ) {
      leaf.state = INACTIVE;
    }
  }

  private writeInstances(): void {
    const limit = this.limit;
    this.mesh.count = limit;
    for (let i = 0; i < limit; i++) {
      const leaf = this.leaves[i];
      const d = this.dummy;
      if (leaf.state === INACTIVE) {
        d.position.set(0, -1000, 0);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0);
      } else {
        d.position.set(leaf.x, leaf.y, leaf.z);
        d.rotation.set(-Math.PI / 2 + Math.sin(leaf.rot) * 0.5, leaf.rot, 0);
        d.scale.setScalar(this.size);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
