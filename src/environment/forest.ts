// Instanced street, courtyard and plaza trees.
//
// One InstancedMesh per species and part:
//   trunk (with 2-3 main branches)      x 1 per species
//   crown variant                        x CROWN_VARIANTS per species
//   bare winter branches                 x 1 per species (only visible in winter)
// so 4 species give at most 12 visible draw calls in any season.
//
// Crowns are 5-9 merged, jittered low-poly blobs with vertex colours: 2-3 tones per crown,
// lighter on top, darker underneath. The season is a recolour of the vertex colours, no new
// geometry. Tree units: metres, base at y = 0, crown radius 2-3.5 m, total height 6-9 m at scale 1.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { Season, TreeSpecies, Vec2 } from '../core/types';
import { attachWeather } from '../shaders/wetSurface';
import { attachCloudShade } from './cloudShade';
import { TREE_SPECIES, applyWindSway, createFoliageMaterial, type WindUniforms } from './trees';
import { chooseVariant, treeTint, treeVariation, type TreeVariation } from './seasons';
import { hashString, UP } from './treeBuilder';
import { range } from './treeSpecies';
import { buildCrown, recolorCrown, type CrownGeometry } from './treeCrown';
import { buildBareBranches, buildTrunk } from './treeTrunk';

export { TriBuilder, makeWarp, hashString } from './treeBuilder';
export { TRUNK_THICKNESS, trunkFootRadius } from './treeTrunk';

export interface TreeFieldItem {
  id: string;
  position: Vec2;
  species: TreeSpecies;
  scale: number;
}

export interface TreeFieldOptions {
  season: Season;
  uniforms: WindUniforms;
  seed?: number;
}

export interface TreeField {
  group: THREE.Group;
  setSeason(season: Season): void;
  /** Tree id for a raycast hit on one of the field's InstancedMeshes, else null. */
  treeIdAt(object: THREE.Object3D, instanceId: number): string | null;
  dispose(): void;
}

/** Number of different crown shapes per species. */
export const CROWN_VARIANTS = 2;

// ---------------------------------------------------------------------------
// Tree field
// ---------------------------------------------------------------------------

interface CrownMesh {
  mesh: THREE.InstancedMesh;
  crown: CrownGeometry;
  species: TreeSpecies;
  /** Per-instance variation, in instance order, for the seasonal colour tint. */
  variations: TreeVariation[];
}

/**
 * Builds every tree as instances: one InstancedMesh per species and part.
 * The group's meshes carry `userData.treeIds` (instance index to tree id).
 */
export function createTreeField(
  trees: readonly TreeFieldItem[],
  opts: TreeFieldOptions,
): TreeField {
  const seed = opts.seed ?? 1;
  const group = new THREE.Group();
  group.name = 'tree-field';

  const foliage = createFoliageMaterial({
    species: 'maple',
    season: opts.season,
    uniforms: opts.uniforms,
    vertexColors: true,
    flatShading: true,
  });
  const bark = attachCloudShade(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  // Bare twigs take the shared snow cover (up-facing faces) like buildings and streets.
  const twigs = attachWeather(
    applyWindSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), opts.uniforms),
  );

  const geometries: THREE.BufferGeometry[] = [];
  const crowns: CrownMesh[] = [];
  const bareMeshes: THREE.InstancedMesh[] = [];
  const ours = new Set<THREE.Object3D>();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], ids: string[], name: string) => {
    const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.userData.treeIds = ids;
    group.add(mesh);
    ours.add(mesh);
    return mesh;
  };

  TREE_SPECIES.forEach((species, si) => {
    const list = trees.filter((t) => t.species === species);
    if (list.length === 0) return;
    const allMatrices: THREE.Matrix4[] = [];
    const allIds: string[] = [];
    const byVariant: { matrices: THREE.Matrix4[]; ids: string[]; variations: TreeVariation[] }[] = Array.from(
      { length: CROWN_VARIANTS },
      () => ({ matrices: [], ids: [], variations: [] }),
    );
    for (const t of list) {
      const rng = createRng((hashString(t.id) ^ Math.imul(seed, 0x9e3779b1)) >>> 0);
      const v = treeVariation(rng);
      const variant = chooseVariant(v.variantRoll, CROWN_VARIANTS);
      const sxz = t.scale * v.width;
      const sy = t.scale * v.height;
      // Yaw first, then a slight lean about the base, so no two trees stand exactly upright alike.
      const q = new THREE.Quaternion()
        .setFromAxisAngle(UP, v.yaw)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(v.leanX, 0, v.leanZ)));
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(t.position.x, 0, t.position.z),
        q,
        new THREE.Vector3(sxz * range(rng, 0.94, 1.06), sy, sxz),
      );
      allMatrices.push(m);
      allIds.push(t.id);
      byVariant[variant].matrices.push(m);
      byVariant[variant].ids.push(t.id);
      byVariant[variant].variations.push(v);
    }

    const speciesSeed = (seed * 1013 + si * 101) >>> 0;
    const trunkGeo = buildTrunk(species, createRng(speciesSeed + 1));
    const bareGeo = buildBareBranches(species, createRng(speciesSeed + 2));
    geometries.push(trunkGeo, bareGeo);
    add(trunkGeo, bark, allMatrices, allIds, `tree-trunk-${species}`);
    bareMeshes.push(add(bareGeo, twigs, allMatrices, allIds, `tree-bare-${species}`));

    byVariant.forEach((v, vi) => {
      if (v.matrices.length === 0) return;
      const crown = buildCrown(species, createRng(speciesSeed + 17 * (vi + 1)), speciesSeed + vi * 31);
      geometries.push(crown.geometry);
      const mesh = add(crown.geometry, foliage, v.matrices, v.ids, `tree-crown-${species}-${vi}`);
      mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // allocates the instance colour buffer
      crowns.push({ mesh, crown, species, variations: v.variations });
    });
  });

  const tint = new THREE.Color();
  const applyTints = (c: CrownMesh, season: Season) => {
    for (let i = 0; i < c.variations.length; i++) {
      const [r, g, b] = treeTint(c.variations[i], season);
      c.mesh.setColorAt(i, tint.setRGB(r, g, b));
    }
    if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
  };

  const setSeason = (season: Season) => {
    const winter = season === 'winter';
    for (const c of crowns) {
      c.mesh.visible = !winter;
      recolorCrown(c.crown, c.species, season);
      applyTints(c, season);
    }
    for (const m of bareMeshes) m.visible = winter;
  };
  setSeason(opts.season);

  return {
    group,
    setSeason,
    treeIdAt(object, instanceId) {
      if (!ours.has(object)) return null;
      const ids = object.userData.treeIds as string[];
      return ids[instanceId] ?? null;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const o of ours) (o as THREE.InstancedMesh).dispose();
      foliage.dispose();
      bark.dispose();
      twigs.dispose();
      group.clear();
      ours.clear();
    },
  };
}
