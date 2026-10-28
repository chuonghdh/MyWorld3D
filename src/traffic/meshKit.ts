// Small shared helpers for the instanced traffic, people and animal meshes.
// Keep existing signatures stable: vehicleMeshes.ts, people/peopleMeshes.ts and src/life/* all use them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Geometry part with a flat vertex colour. */
export type Part = { geo: THREE.BufferGeometry; color: number };

/** Per-frame values the visuals may use (shader time, night, season). */
export interface VisualContext {
  /** Seconds since start; drives shader animation such as walk cycles. */
  time: number;
  /** True when street lights are on. */
  night: boolean;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Rain intensity 0..1; people open umbrellas when above 0.05. Optional so existing callers keep working. */
  rain?: number;
}

/** Moves a part: translate, optionally tip the cylinder so its axis runs along X. */
export function place(geo: THREE.BufferGeometry, x: number, y: number, z: number, tipToX = false): THREE.BufferGeometry {
  if (tipToX) geo.rotateZ(Math.PI / 2);
  geo.translate(x, y, z);
  return geo;
}

export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

/** Gives each part one flat vertex colour and merges all parts into one geometry. */
export function colourise(parts: Part[]): THREE.BufferGeometry {
  const colored = parts.map(({ geo, color }) => {
    const count = geo.attributes.position.count;
    const c = new THREE.Color(color);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  });
  // All parts are indexed and share position, normal, uv and color, so they merge cleanly.
  const merged = mergeGeometries(colored, false);
  if (!merged) throw new Error('traffic meshes: geometry merge failed');
  for (const g of colored) g.dispose();
  return merged;
}

export function makeInstanced(geo: THREE.BufferGeometry, capacity: number, mat: THREE.Material): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // bounds are not updated per frame
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

/** Writes a ground-level instance matrix: position (x, y, z) and yaw heading. */
export function writeInstance(mesh: THREE.InstancedMesh, index: number, x: number, z: number, heading: number, y = 0, scale = 1): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, heading, 0);
  dummy.scale.set(scale, scale, scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

export function paint(mesh: THREE.InstancedMesh, index: number, hex: string | number): void {
  tmpColor.set(hex);
  mesh.setColorAt(index, tmpColor);
}

/** Sets the live instance count and flags the buffers for upload. */
export function finish(mesh: THREE.InstancedMesh, count: number): void {
  mesh.count = count;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
