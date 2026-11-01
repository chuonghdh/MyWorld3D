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

/** Hard cap on the number of leaf instances. */
export const MAX_LEAVES = skyEnvironment.leaves.maxLeaves;
/** Distance in metres from the camera within which leaves fade out by shrinking. */
const LEAF_NEAR_FADE = skyEnvironment.leaves.nearFadeM;

const GROUND_Y = 0.05;
const WIND_DRAG = 0.5; // 1/s, how fast a leaf adopts the wind velocity
const DEVIL_RADIUS = 5; // m
const DEVIL_HEIGHT = 9; // m, top of the vortex
const DEVIL_SPEED = 2.2; // m/s, roaming speed of the vortex centre
/** Default distance (metres, ground plane) from the camera focus within which crowns spawn leaves. */
const FOCUS_RADIUS_DEFAULT = skyEnvironment.leaves.focusRadiusM;
/** Seconds an autumn leaf lies on the ground before it fades out. */
const LEAF_REST_SECONDS = skyEnvironment.leaves.restS;
/** Height of a resting leaf above the ground, so it does not z-fight the ground plane. */
const REST_LIFT = 0.01;
/** Leaf silhouette scale (outline, curl, bend and vein together): 70% of the earlier 1.3 x size (about 0.29 m by 0.35 m). */
const LEAF_SCALE = skyEnvironment.leaves.leafScale;
/** Edge lift along the midrib at the outer edge, metres before LEAF_SCALE. */
const LEAF_CURL = 0.05;
/** Lengthwise bend towards the concave (upper) side, metres at the tip and stem ends, before LEAF_SCALE. */
const LEAF_BEND = 0.04;
/** Vein lift above the crest, metres before LEAF_SCALE. */
const VEIN_LIFT = 0.006;
const VEIN_COLOR = '#6b4a2b';

/** A crown: world centre and radius of one broadleaf tree's leaf mass. Autumn leaves fall from inside these discs. */
export interface CrownDisc {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** A solid a leaf can rest on: world-space footprint and the height of its top surface (metres). */
export interface SurfaceBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
}

/** Lengthwise bend along leaf-local y (midrib centre at y = -0.06): tip and stem lift, the middle stays down. */
function leafBendZ(y: number): number {
  const u = (y + 0.06) / 0.19;
  return LEAF_BEND * Math.min(1, u * u);
}

/** Leaf outline with a notched tip, a stem at the base, a fold along the midrib and a bend along its length. */
function leafGeometry(): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.25);
  s.bezierCurveTo(0.15, -0.15, 0.16, 0.05, 0.05, 0.13);
  s.lineTo(0, 0.07);
  s.lineTo(-0.05, 0.13);
  s.bezierCurveTo(-0.16, 0.05, -0.15, -0.15, 0, -0.25);
  const geo = new THREE.ShapeGeometry(s, 4);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, (LEAF_CURL * Math.abs(pos.getX(i))) / 0.16 + leafBendZ(pos.getY(i)));
  }
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * LEAF_SCALE, pos.getY(i) * LEAF_SCALE, pos.getZ(i) * LEAF_SCALE);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Main vein: a thin brown strip down the midrib, following the leaf's bend and lifted just above the crest. */
function veinGeometry(): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(0.012, 0.32, 1, 10);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - 0.06;
    pos.setXYZ(i, pos.getX(i) * LEAF_SCALE, y * LEAF_SCALE, (leafBendZ(y) + VEIN_LIFT) * LEAF_SCALE);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Shrinks each instance to nothing near the camera (see LEAF_NEAR_FADE). Shared by the leaf and vein meshes. */
function applyNearFade(material: THREE.MeshStandardMaterial): void {
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
}

export interface LeafBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface LeafSettings {
  /** Fraction of MAX_LEAVES that may be live at once, 0-1 (UI slider value). */
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

/**
 * Crown discs read from a broadleaf tree group (streets/natureTrees.ts names its leaf meshes `nature-leaves-<type>`;
 * the shadow copies are skipped). Each instance gives its leaf sphere transformed by its matrix. Empty when the group
 * has no leaf meshes (procedural trees or assets not loaded yet).
 */
export function crownDiscsFromGroup(group: THREE.Object3D): CrownDisc[] {
  const out: CrownDisc[] = [];
  const m = new THREE.Matrix4();
  const sc = new THREE.Vector3();
  group.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    if (!o.name.startsWith('nature-leaves-') || o.name.startsWith('nature-leaves-shadow-')) return;
    const geo = o.geometry as THREE.BufferGeometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const sphere = geo.boundingSphere;
    if (!sphere) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      const c = sphere.center.clone().applyMatrix4(m);
      sc.setFromMatrixScale(m);
      out.push({ x: c.x, y: c.y, z: c.z, r: sphere.radius * Math.max(sc.x, sc.y, sc.z) });
    }
  });
  return out;
}

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
  private crowns: CrownDisc[] = [];
  private surfaces: SurfaceBox[] = [];
  /** Camera view for the crown gates (setCameraView). Null until a frame gives one: then every crown is eligible. */
  private view: { focusX: number; focusZ: number; radius: number } | null = null;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  /** Crowns passing both gates this frame, rebuilt at most once per frame and only when a leaf is due to spawn. */
  private eligible: CrownDisc[] = [];
  private eligibleStale = true;
  /** Highest surface top in `surfaces`, so falling leaves skip the scan until they are that low. */
  private maxSurfaceTop = GROUND_Y;
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
    this.crowns = discs.filter((d) => d.r > 0);
    this.eligibleStale = true;
  }

  /**
   * Camera gates for crown spawning, called once per frame. A crown spawns leaves only when its bounding sphere is in
   * the camera frustum and its centre is within `radius` metres (ground plane) of the focus point. Without a call,
   * every crown is eligible.
   */
  setCameraView(camera: THREE.Camera, focus: { x: number; z: number }, radius = FOCUS_RADIUS_DEFAULT): void {
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.view = { focusX: focus.x, focusZ: focus.z, radius };
    this.eligibleStale = true;
  }

  /** Crowns that pass the camera gates this frame. Rebuilt at most once per frame. */
  private eligibleCrowns(): CrownDisc[] {
    if (!this.eligibleStale) return this.eligible;
    const view = this.view;
    this.eligible = this.crowns.filter((c) => {
      if (view) {
        if (Math.hypot(c.x - view.focusX, c.z - view.focusZ) > view.radius + c.r) return false;
        this.sphere.center.set(c.x, c.y, c.z);
        this.sphere.radius = c.r;
        if (!this.frustum.intersectsSphere(this.sphere)) return false;
      }
      return true;
    });
    this.eligibleStale = false;
    return this.eligible;
  }

  /**
   * Solids leaves can land on (pavement and kerb tops, car roofs and bonnets). Ground outside every box is the road at
   * GROUND_Y. Moving vehicles: resting leaves stay where they landed.
   */
  setSurfaces(boxes: readonly SurfaceBox[]): void {
    this.surfaces = boxes.slice();
    this.maxSurfaceTop = this.surfaces.reduce((m, b) => Math.max(m, b.top), GROUND_Y);
  }

  /** Top of the highest surface under (x, z) that a leaf falling from `fromY` has not yet passed through; GROUND_Y otherwise. */
  private surfaceTop(x: number, z: number, fromY: number): number {
    let top = GROUND_Y;
    for (const b of this.surfaces) {
      if (b.top > top && b.top <= fromY + 0.05 && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) top = b.top;
    }
    return top;
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
    if (this.profile.density > 0 && (this.trees.length > 0 || this.crowns.length > 0)) {
      this.spawnAcc += step * ((this.limit * this.profile.density) / 12);
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
    const fromCrown = p.kind === 'leaf' && this.crowns.length > 0;
    const spread = p.kind === 'pollen' ? 7 : p.kind === 'leaf' ? 6 : 4;
    if (fromCrown) {
      // Autumn: only crowns that pass the camera gates; none in view means no spawn this tick.
      const eligible = this.eligibleCrowns();
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

  private stepLeaf(leaf: Leaf, dt: number, wind: { x: number; z: number }, windSpeed: number): void {
    if (leaf.state === INACTIVE) return;

    if (leaf.state === FALLING) {
      // Adopt the wind velocity gradually, add a flutter, then fall.
      const k = Math.min(1, WIND_DRAG * dt);
      leaf.vx += (wind.x * 0.4 - leaf.vx) * k;
      leaf.vz += (wind.z * 0.4 - leaf.vz) * k;
      const p = this.profile;
      leaf.vy += (-p.fallSpeed - leaf.vy) * Math.min(1, dt * 2);
      const flutter = Math.sin(this.time * 2.3 + leaf.phase) * p.flutter;
      if (p.airLife > 0) {
        leaf.timer -= dt;
        if (leaf.timer <= 0) {
          leaf.state = INACTIVE;
          return;
        }
      }
      const fromY = leaf.y;
      leaf.x += (leaf.vx + flutter) * dt;
      leaf.z += (leaf.vz + flutter * 0.5) * dt;
      leaf.y += leaf.vy * dt;
      leaf.rot += dt * (1 + windSpeed * 0.2);
      // Land on the highest surface under the leaf (pavement, car roof or road), never below it.
      const top = leaf.y <= this.maxSurfaceTop ? this.surfaceTop(leaf.x, leaf.z, fromY) : GROUND_Y;
      if (leaf.y <= top) {
        leaf.y = top;
        if (p.groundLifetime > 0) {
          leaf.state = GROUND;
          // Autumn leaves lie flat for a short fixed time; other kinds keep their seasonal lifetime.
          leaf.timer = p.kind === 'leaf' ? LEAF_REST_SECONDS * (0.9 + 0.2 * this.rng()) : p.groundLifetime * (0.7 + 0.6 * this.rng());
        } else {
          leaf.state = INACTIVE;
        }
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
      leaf.timer = this.profile.airLife;
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
