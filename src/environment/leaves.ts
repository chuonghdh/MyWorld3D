// Falling leaves and the leaf devil (a swirling vortex that lifts leaves off the road).
// One InstancedMesh holds every particle, so the draw call count stays at 1. The particle kind
// follows the season (see seasons.ts): spring petals, summer pollen motes, autumn leaves, none in winter.
// The number of live leaves is bounded by leafAmount (fraction of MAX_LEAVES, 0-1).
// leafSize is a multiplier on the leaf quad (1 = default size).

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { Season } from '../core/types';
import { particleProfile, type ParticleProfile } from './seasons';
import { skyEnvironment } from '../config/tuning';
import { applyNearFade, leafGeometry, veinGeometry } from './leafShapes';
import { CrownGate, type CrownDisc } from './leafCrowns';
import { DEVIL_SPEED, stepCaptured, stepDevil } from './leafDevil';
import { stepLeaf } from './leafMotion';
import { CAPTURED, FALLING, GROUND, INACTIVE, type Devil, type Leaf, type LeafBounds, type LeafSettings, type LeafSystemOptions, type Point2 } from './leafState';
import { LandingSurfaces, type SurfaceBox } from './leafSurfaces';

export { crownDiscsFromGroup, type CrownDisc } from './leafCrowns';
export type { LeafBounds, LeafSettings, LeafSystemOptions } from './leafState';
export type { SurfaceBox } from './leafSurfaces';

/** Hard cap on the number of leaf instances. */
export const MAX_LEAVES = skyEnvironment.leaves.maxLeaves;

/** Default distance (metres, ground plane) from the camera focus within which crowns spawn leaves. */
const FOCUS_RADIUS_DEFAULT = skyEnvironment.leaves.focusRadiusM;
/** Height of a resting leaf above the ground, so it does not z-fight the ground plane. */
const REST_LIFT = 0.01;
const VEIN_COLOR = '#6b4a2b';





export class LeafSystem {
  readonly mesh: THREE.InstancedMesh;
  /** Brown midrib strips, one per leaf, driven by the same matrices as `mesh`. Add it to the scene beside `mesh`. */
  readonly veinMesh: THREE.InstancedMesh;
  private readonly leaves: Leaf[] = [];
  private readonly devils: Devil[] = [];
  private readonly rng: () => number;
  private readonly bounds: LeafBounds;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private trees: Point2[] = [];
  private readonly gate = new CrownGate();
  private readonly surfaces = new LandingSurfaces();
  private limit = 0;
  private size = 1;
  private season: Season = 'autumn';
  private profile: ParticleProfile = particleProfile('autumn');
  private readonly colorRng: () => number;
  private spawnAcc = 0;
  private time = 0;

  constructor(opts: LeafSystemOptions) {
    this.bounds = opts.bounds;
    this.rng = createRng(opts.seed ?? 1337);
    this.colorRng = createRng((opts.seed ?? 1337) + 99);

    // A leaf that drifts close to the camera would fill the screen as a giant slab, so each leaf
    // shrinks to nothing within LEAF_NEAR_FADE metres of the camera.
    const material = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide });
    applyNearFade(material);
    this.mesh = new THREE.InstancedMesh(leafGeometry(), material, MAX_LEAVES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;

    const veinMaterial = new THREE.MeshStandardMaterial({ color: VEIN_COLOR, roughness: 0.8, side: THREE.DoubleSide });
    applyNearFade(veinMaterial);
    this.veinMesh = new THREE.InstancedMesh(veinGeometry(), veinMaterial, MAX_LEAVES);
    this.veinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.veinMesh.frustumCulled = false;
    this.veinMesh.count = 0;

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
    }
    this.paint();
  }

  /** Gives every instance a colour from the current season's palette. */
  private paint(): void {
    const colors = this.profile.colors;
    for (let i = 0; i < MAX_LEAVES; i++) {
      this.color.set(colors[Math.floor(this.colorRng() * colors.length)]);
      this.mesh.setColorAt(i, this.color);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Current particle kind: 'petal', 'pollen', 'leaf' or 'none'. */
  particleKind(): ParticleProfile['kind'] {
    return this.profile.kind;
  }

  /** Tree positions on the ground. Autumn leaves fall from these points. */
  setTreePoints(points: readonly Point2[]): void {
    this.trees = points.map((p) => ({ x: p.x, z: p.z }));
  }

  /**
   * Crown discs of the broadleaf trees. In autumn, leaves spawn inside these discs at crown height; with none set,
   * they fall from the trunk points given to setTreePoints (the old behaviour).
   */
  setCrownDiscs(discs: readonly CrownDisc[]): void {
    this.gate.setCrowns(discs);
  }

  /**
   * Camera gates for crown spawning, called once per frame. A crown spawns leaves only when its bounding sphere is in
   * the camera frustum and its centre is within `radius` metres (ground plane) of the focus point. Without a call,
   * every crown is eligible.
   */
  setCameraView(camera: THREE.Camera, focus: { x: number; z: number }, radius = FOCUS_RADIUS_DEFAULT): void {
    this.gate.setView(camera, focus, radius);
  }

  /** Solids leaves can land on (pavement and kerb tops, car roofs and bonnets). Resting leaves stay where they landed. */
  setSurfaces(boxes: readonly SurfaceBox[]): void {
    this.surfaces.set(boxes);
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
    this.veinMesh.count = 0;
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
        const frac = Math.min(1, Math.max(0, settings.leafAmount));
        this.limit = Math.floor(MAX_LEAVES * frac);
      }
      if (settings.leafSize !== undefined) this.size = Math.max(0.05, settings.leafSize);
      if (settings.season !== undefined && settings.season !== this.season) {
        this.season = settings.season;
        this.profile = particleProfile(this.season);
        // Particles of the old season do not carry over: clear them and repaint the palette.
        for (const leaf of this.leaves) {
          leaf.state = INACTIVE;
          leaf.captor = null;
        }
        this.spawnAcc = 0;
        this.paint();
      }
    }

    const windSpeed = Math.hypot(wind.x, wind.z);

    // Spawn particles from trees at a rate that fills the seasonal share of the limit in about 12s.
    if (this.profile.density > 0 && (this.trees.length > 0 || this.gate.count > 0)) {
      this.spawnAcc += step * ((this.limit * this.profile.density) / 12);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        this.spawnFromTree();
      }
    }

    for (let i = this.devils.length - 1; i >= 0; i--) {
      stepDevil(this.devils[i], step, this.leaves, this.limit, this.bounds, this.rng);
      if (this.devils[i].age >= this.devils[i].life) this.devils.splice(i, 1);
    }

    for (let i = 0; i < this.limit; i++) {
      const leaf = this.leaves[i];
      if (leaf.state === CAPTURED) stepCaptured(leaf, step, this.profile.airLife);
      else stepLeaf(leaf, step, wind, windSpeed, this.profile, this.time, this.rng, this.surfaces, this.bounds);
    }

    this.writeInstances();
  }

  dispose(): void {
    for (const m of [this.mesh, this.veinMesh]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.dispose();
    }
  }

  private spawnFromTree(): void {
    const p = this.profile;
    let leaf: Leaf | undefined;
    let live = 0;
    for (let i = 0; i < this.limit; i++) {
      const s = this.leaves[i];
      if (s.state === INACTIVE) leaf ??= s;
      // Resting leaves do not count against the seasonal share: they are recycled when the pool runs out.
      else if (s.state !== GROUND) live++;
    }
    // Pool full: recycle the resting leaf closest to fading out.
    leaf ??= this.oldestResting();
    if (!leaf || live >= Math.floor(this.limit * p.density)) return;
    const fromCrown = p.kind === 'leaf' && this.gate.count > 0;
    const spread = p.kind === 'pollen' ? 7 : p.kind === 'leaf' ? 6 : 4;
    if (fromCrown) {
      // Autumn: only crowns that pass the camera gates; none in view means no spawn this tick.
      const eligible = this.gate.list();
      if (eligible.length === 0) return;
      leaf.state = FALLING;
      // A random point inside a random eligible crown disc, at crown height.
      const d = eligible[Math.floor(this.rng() * eligible.length)];
      const a = this.rng() * Math.PI * 2;
      const rad = Math.sqrt(this.rng()) * d.r * 0.9;
      leaf.x = d.x + Math.cos(a) * rad;
      leaf.z = d.z + Math.sin(a) * rad;
      leaf.y = d.y + (this.rng() - 0.5) * d.r * 0.4;
    } else {
      leaf.state = FALLING;
      const tree = this.trees[Math.floor(this.rng() * this.trees.length)];
      leaf.x = tree.x + (this.rng() - 0.5) * spread;
      leaf.z = tree.z + (this.rng() - 0.5) * spread;
      leaf.y = p.spawnLow + this.rng() * (p.spawnHigh - p.spawnLow);
    }
    leaf.vx = 0;
    leaf.vy = -p.fallSpeed;
    leaf.vz = 0;
    leaf.rot = this.rng() * Math.PI * 2;
    leaf.timer = p.airLife;
  }

  private oldestResting(): Leaf | undefined {
    let best: Leaf | undefined;
    for (let i = 0; i < this.limit; i++) {
      const s = this.leaves[i];
      if (s.state === GROUND && (!best || s.timer < best.timer)) best = s;
    }
    return best;
  }

  private writeInstances(): void {
    const limit = this.limit;
    this.mesh.count = limit;
    this.veinMesh.count = limit;
    const base = this.size * this.profile.sizeScale;
    for (let i = 0; i < limit; i++) {
      const leaf = this.leaves[i];
      const d = this.dummy;
      if (leaf.state === INACTIVE) {
        d.position.set(0, -1000, 0);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0);
      } else if (leaf.state === GROUND) {
        // Resting: lies flat on the ground and fades out over its last second.
        d.position.set(leaf.x, leaf.y + REST_LIFT, leaf.z);
        d.rotation.set(-Math.PI / 2, leaf.rot, 0, 'YXZ');
        d.scale.setScalar(base * Math.max(0, Math.min(1, leaf.timer)));
      } else {
        d.position.set(leaf.x, leaf.y, leaf.z);
        d.rotation.set(-Math.PI / 2 + Math.sin(leaf.rot) * 0.5, leaf.rot, 0);
        d.scale.setScalar(base);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      this.veinMesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.veinMesh.instanceMatrix.needsUpdate = true;
  }
}
