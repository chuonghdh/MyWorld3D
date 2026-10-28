// Sun light constants and the shadow-frustum fit used by the town.
import * as THREE from 'three';
import type { Rect } from '../city';

// The sun module returns intensities on a 0-1.2 scale; three.js lights are physically based,
// so they are scaled up here to give a bright, warm miniature look.
export const SUN_GAIN = 3.4;
export const HEMI_GAIN = 3;
export const AMBIENT_GAIN = 0.5;

/**
 * Lowest elevation used for the shadow-casting light. Real golden-hour sun is only a few degrees
 * up, which would put every facade in shadow; keeping its colour but lifting its angle reads better.
 */
const MIN_LIGHT_ELEVATION_DEG = 24;

export function lightDirection(dir: { x: number; y: number; z: number; altitudeDeg: number }): THREE.Vector3 {
  const alt = THREE.MathUtils.degToRad(Math.max(dir.altitudeDeg, MIN_LIGHT_ELEVATION_DEG));
  const flat = new THREE.Vector2(dir.x, dir.z);
  if (flat.lengthSq() < 1e-6) flat.set(0, 1);
  flat.normalize().multiplyScalar(Math.cos(alt));
  return new THREE.Vector3(flat.x, Math.sin(alt), flat.y);
}

export const SUN_DISTANCE = 220;
/** Shadow bias the whole-town fit was tuned with. */
const SHADOW_NORMAL_BIAS = 0.04;

/**
 * Half-extent of the shadow frustum for a camera at `dist` metres from its ground target.
 * Zoomed out it is the whole-town fit (identical to the fixed frustum used before); zoomed in it
 * shrinks around the target, in 10 m steps so zooming does not make the shadow edges crawl.
 */
export function shadowHalfExtent(dist: number, fullHalf: number): number {
  const wanted = Math.max(50, dist * 0.8);
  const stepped = Math.ceil(wanted / 10) * 10;
  return stepped >= fullHalf ? fullHalf : stepped;
}

const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _centre = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);

/**
 * Fits the sun's shadow camera around where the camera is looking and snaps its centre to whole
 * shadow texels along the light's own axes, so shadows stay still while the view pans.
 */
export function fitSunShadow(
  light: THREE.DirectionalLight,
  camera: THREE.Camera,
  sunDir: THREE.Vector3,
  sunDistance: number,
  bounds: Rect,
  mapSize: number,
): void {
  const fullHalf = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 20;

  // Ground point under the view centre (camera ray meets y = 0); the origin when looking level or up.
  camera.getWorldDirection(_fwd);
  _centre.set(0, 0, 0);
  let dist = Infinity;
  if (_fwd.y < -0.02) {
    const along = Math.min(camera.position.y / -_fwd.y, 400);
    dist = along;
    _centre.copy(camera.position).addScaledVector(_fwd, along);
    _centre.y = 0;
    _centre.x = THREE.MathUtils.clamp(_centre.x, bounds.minX, bounds.maxX);
    _centre.z = THREE.MathUtils.clamp(_centre.z, bounds.minZ, bounds.maxZ);
  }
  const half = shadowHalfExtent(dist, fullHalf);
  if (half >= fullHalf) _centre.set(0, 0, 0);

  // Light axes (the shadow camera looks along -sunDir, with world up as its up hint).
  _right.crossVectors(_worldUp, sunDir);
  if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
  _right.normalize();
  _up.crossVectors(sunDir, _right).normalize();
  if (half < fullHalf) {
    const texel = (2 * half) / mapSize;
    const cr = _centre.dot(_right);
    const cu = _centre.dot(_up);
    _centre.addScaledVector(_right, Math.round(cr / texel) * texel - cr);
    _centre.addScaledVector(_up, Math.round(cu / texel) * texel - cu);
  }

  light.target.position.copy(_centre);
  light.target.updateMatrixWorld();
  light.position.copy(_centre).addScaledVector(sunDir, sunDistance);

  const cam = light.shadow.camera;
  if (cam.right !== half) {
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
  }
  // World-space normal offset scales with the texel size; the depth bias is range-based and stays.
  light.shadow.normalBias = Math.max(0.015, SHADOW_NORMAL_BIAS * (half / fullHalf));
}
