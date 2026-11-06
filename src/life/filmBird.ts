// Film carrier bird (auto film). A single flyer that keeps close to the film camera, a pure function of film time.
// No React, no Math.random, no wall-clock time, no traffic or pedestrian input, no sound, no shadow.
// Not the pigeon or flock systems: those are stateful and draw per-frame RNG.
import * as THREE from 'three';
import { trafficLife } from '../config/tuning';
import { buildFlyerGeometry } from './geometry';
import { attachAnim, createAnimalMaterial } from './material';
import { setPose } from './common';

/**
 * Camera pose at film time (same shape as AutoPose in film/autoPath.ts): position x/y/z and look-at tx/ty/tz.
 * Minimal type until src/scene/filmPath.ts exists; the path sampler must be compatible with it.
 */
export interface FilmPathPose {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
}

/** Path sampler: camera pose at film time t (seconds). Must be pure. */
export type FilmPathSampler = (t: number) => FilmPathPose;

/** Bird pose at film time t. heading is a unit vector; yaw and pitch are the setPose angles (radians). */
export interface FilmBirdPose {
  t: number;
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  hz: number;
  yaw: number;
  pitch: number;
}

// Flight shape (algorithm constants, not designer knobs). The bird is centred on the look direction.
/** Half-step of the central difference used for the heading (film seconds). */
const HEADING_EPS_S = 0.05;
/** Flap amplitude and wingbeat speed sent to the flyer shader (aAnim.x and aAnim.z). */
const FLAP_AMP = 0.8;
const FLAP_SPEED = 1;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Bird position at film time t, written into out. Centred on the camera's look direction, exactly max(distance, minDistance) ahead. */
function birdPosition(_t: number, cam: FilmPathPose, out: Vec3): void {
  let fx = cam.tx - cam.x;
  let fy = cam.ty - cam.y;
  let fz = cam.tz - cam.z;
  const fl = Math.hypot(fx, fy, fz);
  if (fl > 1e-9) {
    fx /= fl;
    fy /= fl;
    fz /= fl;
  } else {
    fx = 0;
    fy = 0;
    fz = -1;
  }
  const d = Math.max(trafficLife.filmBirdDistanceM, trafficLife.filmBirdMinDistanceM);
  out.x = cam.x + fx * d;
  out.y = cam.y + fy * d;
  out.z = cam.z + fz * d;
}

/**
 * Bird pose at film time t, from the camera path. Same input gives the same output.
 * Heading is the bird's own direction of motion (central difference); falls back to the camera's forward when still.
 */
export function birdPoseAt(t: number, pathPose: FilmPathSampler): FilmBirdPose {
  const cam = pathPose(t);
  const p = { x: 0, y: 0, z: 0 };
  birdPosition(t, cam, p);

  const a = { x: 0, y: 0, z: 0 };
  const b = { x: 0, y: 0, z: 0 };
  birdPosition(t - HEADING_EPS_S, pathPose(t - HEADING_EPS_S), a);
  birdPosition(t + HEADING_EPS_S, pathPose(t + HEADING_EPS_S), b);
  let hx = b.x - a.x;
  let hy = b.y - a.y;
  let hz = b.z - a.z;
  let hl = Math.hypot(hx, hy, hz);
  if (!(hl > 1e-9)) {
    hx = cam.tx - cam.x;
    hy = cam.ty - cam.y;
    hz = cam.tz - cam.z;
    hl = Math.hypot(hx, hy, hz);
    if (!(hl > 1e-9)) {
      hx = 0;
      hy = 0;
      hz = -1;
      hl = 1;
    }
  }
  hx /= hl;
  hy /= hl;
  hz /= hl;

  return {
    t,
    x: p.x,
    y: p.y,
    z: p.z,
    hx,
    hy,
    hz,
    yaw: Math.atan2(hx, hz),
    pitch: Math.atan2(hy, Math.hypot(hx, hz)),
  };
}

export interface FilmBird {
  /** Add to the film scene. Holds exactly one mesh (one draw call), never casts shadows. */
  readonly group: THREE.Group;
  /** Places the bird from a pose returned by birdPoseAt. Drives the flap from film time. */
  update(pose: FilmBirdPose): void;
  dispose(): void;
}

/** Film carrier bird: one InstancedMesh with one instance, the existing 'flyer' material. */
export function createFilmBird(): FilmBird {
  const geometry = buildFlyerGeometry();
  const { material, uniforms } = createAnimalMaterial('flyer');
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.name = 'film-bird';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const anim = attachAnim(mesh, 1);
  anim[0] = FLAP_AMP;
  anim[1] = 0;
  anim[2] = FLAP_SPEED;
  anim[3] = 0;

  const group = new THREE.Group();
  group.name = 'film-bird';
  group.add(mesh);

  return {
    group,
    update(pose: FilmBirdPose): void {
      setPose(mesh, 0, pose.x, pose.y, pose.z, pose.yaw, pose.pitch, 0, trafficLife.filmBirdScale);
      mesh.instanceMatrix.needsUpdate = true;
      (geometry.attributes.aAnim as THREE.BufferAttribute).needsUpdate = true;
      uniforms.uTime.value = pose.t;
    },
    dispose(): void {
      group.remove(mesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
