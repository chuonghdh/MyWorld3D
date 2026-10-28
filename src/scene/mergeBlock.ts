// Merges many building groups (each made of meshes sharing the city-wide materials)
// into one mesh per material, so a whole block of houses costs about three draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface PlacedObject {
  object: THREE.Object3D;
  /** World transform to bake into the geometry. */
  matrix: THREE.Matrix4;
}

export function mergeByMaterial(items: readonly PlacedObject[], name: string): THREE.Group {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const local = new THREE.Matrix4();

  for (const { object, matrix } of items) {
    object.updateMatrixWorld(true);
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const material = child.material as THREE.Material;
      // child.matrixWorld is relative to the (unparented) building root.
      local.multiplyMatrices(matrix, child.matrixWorld);
      const geo = (child.geometry as THREE.BufferGeometry).clone().applyMatrix4(local);
      const list = buckets.get(material);
      if (list) list.push(geo);
      else buckets.set(material, [geo]);
      (child.geometry as THREE.BufferGeometry).dispose();
    });
  }

  const group = new THREE.Group();
  group.name = name;
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = material.name || 'merged';
    mesh.castShadow = material.name === 'building-body';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Frees the merged geometry of a group built by mergeByMaterial. Materials are shared and kept. */
export function disposeMerged(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) (child.geometry as THREE.BufferGeometry).dispose();
  });
}
