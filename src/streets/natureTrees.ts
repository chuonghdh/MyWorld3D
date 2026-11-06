// City trees from the Quaternius pack (public/models/quaternius). Replaces the procedural street, courtyard and
// plaza trees. Each tree type is one InstancedMesh for bark and one for leaves, in the main and shadow passes.
// Leaves are thinned per season by whole islands (seeded order, density from seasonLeafDensity), as the
// procedural trees were. Instance origins sit at the tree base, so applyWindSway measures height from the base.
// Pure: no GLB loading here (see src/scene/useNatureTrees.ts). Deterministic: one seeded stream per layout.

import * as THREE from 'three';
import type { Season } from '../core/types';
import { createRng } from '../core/rng';
import { hashString, type TreeField } from '../environment/forest';
import { seasonLeafColor, seasonLeafDensity } from '../environment/trees';
import type { NatureAsset } from './natureTypes';
import type { NatureTreeItem } from './natureLayout';
import type { LeafVarietyUniforms } from './natureLeafMaterial';
import { thinnedLeaves } from './natureGeometry';

const WHITE = new THREE.Color(0xffffff);

/**
 * Instanced field for the city trees. One InstancedMesh per type and part (bark, leaves). Instances carry the
 * tree's base position, yaw and layout scale. Leaf geometry follows the season; winter hides the leaves.
 * Matches the TreeField interface, so the scene keeps its picking and season wiring.
 */
export function createNatureTreeField(
  trees: readonly NatureTreeItem[],
  assets: readonly NatureAsset[],
  season: Season,
): TreeField {
  const group = new THREE.Group();
  group.name = 'nature-trees';
  const ours = new Set<THREE.Object3D>();
  const leafUsers: { mesh: THREE.InstancedMesh; asset: NatureAsset }[] = [];
  const snowMeshes: THREE.InstancedMesh[] = [];
  const cache = new Map<string, THREE.BufferGeometry | null>();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, items: readonly NatureTreeItem[], name: string) => {
    // Geometries made by clone or merge can lack a bounding sphere; InstancedMesh.computeBoundingSphere copies it.
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4();
    items.forEach((t, i) => {
      p.set(t.position.x, 0, t.position.z);
      q.setFromAxisAngle(up, t.yaw);
      s.setScalar(t.scale);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.treeIds = items.map((t) => t.id);
    group.add(mesh);
    ours.add(mesh);
    return mesh;
  };

  assets.forEach((asset, ai) => {
    const items = trees.filter((t) => t.type === ai);
    if (items.length === 0) return;
    add(asset.bark, asset.barkMat, items, `nature-bark-${asset.type.file}`);
    // Full leaves cast and receive shadows on layer 0 (same as conifers).
    const leaves = add(asset.leaves, asset.leafMat, items, `nature-leaves-${asset.type.file}`);
    // Per-tree seeded randoms (instance colour, read by the leaf shader): each tree differs in hue and brightness.
    const c = new THREE.Color();
    items.forEach((t, i) => {
      const r = createRng(hashString(t.id) >>> 0);
      leaves.setColorAt(i, c.setRGB(r(), r(), r()));
    });
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leafUsers.push({ mesh: leaves, asset });
    if (asset.snowBark) snowMeshes.push(add(asset.snowBark, asset.snowMat, items, 'nature-snow-bark-' + asset.type.file));
    // Broadleaf crowns are bare in winter; a snow cap on their full leaf geometry would draw the green leaf map. Conifers keep their crowns.
    if (asset.snowLeaves && asset.type.evergreen) snowMeshes.push(add(asset.snowLeaves, asset.snowLeafMat, items, 'nature-snow-leaves-' + asset.type.file));
  });

  const leafFor = (asset: NatureAsset, sNow: Season): THREE.BufferGeometry | null => {
    const key = `${asset.type.file}|${sNow}`;
    let geo = cache.get(key);
    if (geo === undefined) {
      geo = thinnedLeaves(asset, asset.type.evergreen ? 1 : seasonLeafDensity(sNow));
      cache.set(key, geo);
    }
    return geo;
  };

  const apply = (sNow: Season) => {
    for (const m of snowMeshes) m.visible = sNow === 'winter';
    for (const { mesh, asset } of leafUsers) {
      const geo = leafFor(asset, sNow);
      mesh.visible = geo !== null;
      if (geo) mesh.geometry = geo;
      const mat = asset.leafMat as THREE.MeshStandardMaterial;
      // Conifers keep their green all year. Broadleaf autumn: white base, so the luminance-matched ramp in the shader sets the colour.
      const evergreen = asset.type.evergreen === true;
      const autumn = sNow === 'autumn' && !evergreen;
      const colourSeason: Season = evergreen && (sNow === 'autumn' || sNow === 'winter') ? 'summer' : sNow;
      mat.color.copy(autumn ? WHITE : seasonLeafColor(asset.type.species, colourSeason));
      const v = mat.userData.variety as LeafVarietyUniforms | undefined;
      if (v) {
        v.uAutumn.value = autumn ? 1 : 0;
        v.uVary.value = sNow === 'spring' ? 0.6 : sNow === 'summer' ? 1 : 0.5;
        v.uSummer.value = sNow === 'summer' ? 1 : 0;
      }
    }
  };
  apply(season);

  return {
    group,
    setSeason(next: Season) {
      apply(next);
    },
    treeIdAt(object, instanceId) {
      if (!ours.has(object)) return null;
      const ids = object.userData.treeIds as string[];
      return ids[instanceId] ?? null;
    },
    dispose() {
      for (const [, geo] of cache) if (geo && !assets.some((a) => a.leaves === geo)) geo.dispose();
      for (const o of ours) (o as THREE.InstancedMesh).dispose();
      group.clear();
      ours.clear();
    },
  };
}

export * from './natureTypes';
export * from './natureLayout';
export * from './natureGeometry';
export * from './natureLeafMaterial';
export * from './natureAsset';
