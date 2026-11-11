// One set of per-age-group person meshes (adult, child, elder, teen) with its per-instance attribute arrays.
// peopleMeshes.ts builds two sets, near and far (distance LOD, lod.ts). They share materials,
// so each age group needs one material; the near set has its own, smoother geometry.

import * as THREE from 'three';
import { finish, writeInstance } from '../meshKit';
import { PALETTE_SIZES } from './palettes';
import type { PersonMaterials } from './rigShader';
import type { PedestrianRender } from '../pedestrians';

export interface PersonSet {
  meshes: THREE.InstancedMesh[];
  counts: Int32Array;
  gait: Float32Array[];
  gait2: Float32Array[];
  look: Float32Array[];
  look2: Float32Array[];
  capacity: number;
}

/** Per-instance values that differ from person to person (resolved once in update()). */
export interface PersonWrite {
  ped: PedestrianRender;
  scale: number;
  flags: number;
  female: number;
  angle: number;
  walking: boolean;
  amp: number;
  ease: number;
  kneeK: number;
  armK: number;
  bobK: number;
}

function instancedAttr(mesh: THREE.InstancedMesh, name: string, capacity: number): Float32Array {
  const arr = new Float32Array(capacity * 4);
  const attr = new THREE.InstancedBufferAttribute(arr, 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute(name, attr);
  return arr;
}

export function createPersonSet(
  geometries: THREE.BufferGeometry[],
  materials: PersonMaterials[],
  kinds: string[],
  namePrefix: string,
  capacity: number,
): PersonSet {
  const set: PersonSet = { meshes: [], counts: new Int32Array(geometries.length), gait: [], gait2: [], look: [], look2: [], capacity };
  geometries.forEach((geo, i) => {
    const mesh = new THREE.InstancedMesh(geo, materials[i].material, capacity);
    mesh.name = namePrefix + kinds[i];
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.customDepthMaterial = materials[i].depth;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    set.gait.push(instancedAttr(mesh, 'aGait', capacity));
    set.gait2.push(instancedAttr(mesh, 'aGait2', capacity));
    set.look.push(instancedAttr(mesh, 'aLook', capacity));
    set.look2.push(instancedAttr(mesh, 'aLook2', capacity));
    set.meshes.push(mesh);
  });
  return set;
}

/** Writes one person into the set's mesh `bi` at the next free slot. Returns false when the set is full. */
export function writePerson(set: PersonSet, bi: number, w: PersonWrite): boolean {
  const idx = set.counts[bi];
  if (idx >= set.capacity) return false;
  set.counts[bi] = idx + 1;
  const ped = w.ped;
  writeInstance(set.meshes[bi], idx, ped.position.x, ped.position.z, ped.heading, ped.y, w.scale);
  const g = set.gait[bi];
  const o4 = idx * 4;
  g[o4] = w.angle;
  g[o4 + 1] = ped.phase;
  g[o4 + 2] = w.walking ? 0 : ped.pose === 0 ? 1 : ped.pose;
  g[o4 + 3] = w.amp;
  const g2 = set.gait2[bi];
  g2[o4] = w.ease;
  g2[o4 + 1] = w.kneeK;
  g2[o4 + 2] = w.armK;
  g2[o4 + 3] = w.bobK;
  const lk = set.look[bi];
  lk[o4] = ped.top % PALETTE_SIZES.top;
  lk[o4 + 1] = ped.pants % PALETTE_SIZES.pants;
  lk[o4 + 2] = ped.hair % PALETTE_SIZES.hair;
  lk[o4 + 3] = ped.skin % PALETTE_SIZES.skin;
  const l2 = set.look2[bi];
  l2[o4] = ped.accent % PALETTE_SIZES.accent;
  l2[o4 + 1] = w.flags;
  l2[o4 + 2] = w.female;
  l2[o4 + 3] = ped.hairStyle;
  return true;
}

export function resetSet(set: PersonSet): void {
  set.counts.fill(0);
}

/** Publishes the counts and flags every per-instance attribute for upload. */
export function finishSet(set: PersonSet): void {
  for (let b = 0; b < set.meshes.length; b++) {
    const mesh = set.meshes[b];
    finish(mesh, set.counts[b]);
    for (const n of ['aGait', 'aGait2', 'aLook', 'aLook2']) (mesh.geometry.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
  }
}
