// LAB COPY of src/streets/natureTrees.ts (cloned from the city file). Lab edits stay here until the user approves a merge.
// Imports are the city's shared modules (environment, shaders, core, city types), not cloned.
// City trees from the Quaternius pack (public/models/quaternius). Replaces the procedural street, courtyard and
// plaza trees. Each tree type is one InstancedMesh for bark and one for leaves, in the main and shadow passes.
// Leaves are thinned per season by whole islands (seeded order, density from seasonLeafDensity), as the
// procedural trees were. Instance origins sit at the tree base, so applyWindSway measures height from the base.
// Pure: no GLB loading here (see src/scene/useNatureTrees.ts). Deterministic: one seeded stream per layout.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Season, TreeSpecies } from '../../core/types';
import { createRng } from '../../core/rng';
import type { CityLayout } from '../../city/layout';
import { hashString, type TreeField } from '../../environment/forest';
import { applyWindSway, seasonLeafColor, seasonLeafDensity, type WindUniforms } from '../../environment/trees';
import { attachWeather } from '../../shaders/wetSurface';
import {
  AUTUMN_ORANGE,
  AUTUMN_RED,
  AUTUMN_YELLOW,
  GREEN_TEAL,
  GREEN_YELLOW,
  leafVarietyGlsl,
} from '../../environment/leafVariety';

export interface NatureType {
  file: string;
  barkTex: string;
  leafTex: string;
  species: TreeSpecies;
  /** Conifers keep their needles all year: green in autumn, snow-capped in winter. */
  evergreen?: boolean;
}

const WHITE = new THREE.Color(0xffffff);
/** Snow cover on upward-facing bark and needle tops (winter only). */
const SNOW = new THREE.Color('#f1f4f7');

/** The six tree types used in the city, in slot order. */
export const NATURE_TYPES: readonly NatureType[] = [
  { file: 'Tree_5', barkTex: 'Tree_Bark.jpg', leafTex: 'Tree_Leaves.png', species: 'oak' },
  { file: 'Tree_6', barkTex: 'Tree_Bark.jpg', leafTex: 'Tree_Leaves.png', species: 'oak' },
  { file: 'Pine_5', barkTex: 'Tree_Bark.jpg', leafTex: 'Pine_Leaves.png', species: 'ginkgo', evergreen: true },
  { file: 'Pine_2', barkTex: 'Tree_Bark.jpg', leafTex: 'Pine_Leaves.png', species: 'ginkgo', evergreen: true },
  { file: 'Birch_6', barkTex: 'Birch_Bark.png', leafTex: 'Birch_Leaves_Green.png', species: 'birch' },
  { file: 'Birch_10', barkTex: 'Birch_Bark.png', leafTex: 'Birch_Leaves_Green.png', species: 'birch' },
];

/** Seed salt for the type and yaw stream. Separate from every other city stream. */
export const NATURE_SALT = 0x5a17c3e1;

/** Baked geometry and materials for one tree type. */
export interface NatureAsset {
  type: NatureType;
  bark: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
  /** Triangle indices of each leaf island (shared vertex index). */
  islands: number[][];
  barkMat: THREE.Material;
  leafMat: THREE.Material;
  /** Snow caps on upward-facing bark and leaf crowns (all types), winter only. Null when none. */
  snowBark: THREE.BufferGeometry | null;
  snowLeaves: THREE.BufferGeometry | null;
  snowMat: THREE.Material;
  /** White, alpha-tested with the leaf texture so snow follows leaf shapes and gaps. */
  snowLeafMat: THREE.Material;
}

/** City tree scale on top of the layout scale. Same value as useTownGreenery.ts TREE_SCALE. */
export const TREE_SCALE = 1.35;

/** Optional overrides for natureItems. Default (undefined) keeps the layout scale and slot types. */
export interface NatureOverrides {
  /** Multiplies the layout scale; replaces TREE_SCALE when set. */
  treeScale?: number;
  /** Tree id to type index (NATURE_TYPES); other trees keep their slot type. */
  types?: Record<string, number>;
}

export interface NatureSlot {
  type: number;
  yaw: number;
}

/** One type and yaw per street, avenue, courtyard and plaza tree, in layout order: two draws per slot, always. */
/** Conifers are about a tenth of the city: only on the outer sidewalk ring, plazas and merged-block yards. */
export const PINE_SHARE = 0.6;
/** Outer sidewalk ring depth (m) from the town edge, where street trees count as the pedestrian border. */
export const BORDER_DEPTH = 6;

const BROADLEAF_TYPES = NATURE_TYPES.flatMap((t, i) => (t.evergreen ? [] : [i]));
const CONIFER_TYPES = NATURE_TYPES.flatMap((t, i) => (t.evergreen ? [i] : []));

/** One tree type and yaw per street tree, in layout order. Each slot draws the same numbers whatever its setting. */
export function natureSlots(layout: CityLayout, seed: number): NatureSlot[] {
  const rng = createRng((seed ^ NATURE_SALT) >>> 0);
  const b = layout.townBounds;
  const mergedYards = layout.blocks.flatMap((blk) => (blk.courtyard?.merged ? [blk.courtyard] : []));
  const inYard = (x: number, z: number) =>
    mergedYards.some((c) => x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ);
  return layout.streetTrees.map((t) => {
    const x = t.position.x;
    const z = t.position.z;
    const edge = Math.min(x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z);
    const coniferSpot =
      t.setting === 'plaza' || (t.setting === 'street' && edge < BORDER_DEPTH) || (t.setting === 'courtyard' && inYard(x, z));
    const broadleaf = BROADLEAF_TYPES[Math.floor(rng() * BROADLEAF_TYPES.length)];
    const conifer = CONIFER_TYPES[Math.floor(rng() * CONIFER_TYPES.length)];
    const takeConifer = coniferSpot && rng() < PINE_SHARE;
    const yaw = rng() * Math.PI * 2;
    return { type: takeConifer ? conifer : broadleaf, yaw };
  });
}

export interface NatureTreeItem {
  id: string;
  position: { x: number; z: number };
  scale: number;
  type: number;
  yaw: number;
}

/**
 * Tree items for the field: the layout's positions and scales (times TREE_SCALE), with the slot's type and yaw.
 * `overrides` is optional; without it the output is the default city.
 */
export function natureItems(layout: CityLayout, seed: number, overrides?: NatureOverrides): NatureTreeItem[] {
  const slots = natureSlots(layout, seed);
  const k = overrides?.treeScale ?? TREE_SCALE;
  return layout.streetTrees.map((t, i) => ({
    id: t.id,
    position: { x: t.position.x, z: t.position.z },
    scale: t.scale * k,
    type: overrides?.types?.[t.id] ?? slots[i].type,
    yaw: slots[i].yaw,
  }));
}

/** Leaf islands: triangle indices grouped by shared vertex index (union-find). */
export function leafIslands(geo: THREE.BufferGeometry): number[][] {
  const vcount = geo.getAttribute('position').count;
  const idx = geo.index ? geo.index.array : null;
  const tcount = (idx ? idx.length : vcount) / 3;
  const v = (t: number, k: number) => (idx ? idx[3 * t + k] : 3 * t + k);
  const parent = new Int32Array(vcount);
  for (let i = 0; i < vcount; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let t = 0; t < tcount; t++) {
    const ra = find(v(t, 0));
    const rb = find(v(t, 1));
    if (rb !== ra) parent[rb] = ra;
    const rc = find(v(t, 2));
    const rr = find(ra);
    if (rc !== rr) parent[rc] = rr;
  }
  const byRoot = new Map<number, number[]>();
  for (let t = 0; t < tcount; t++) {
    const r = find(v(t, 0));
    const list = byRoot.get(r);
    if (list) list.push(t);
    else byRoot.set(r, [t]);
  }
  return [...byRoot.values()];
}

/** Non-indexed copy of the given triangles, all attributes kept. */
function subsetGeometry(src: THREE.BufferGeometry, tris: number[]): THREE.BufferGeometry {
  const idx = src.index ? src.index.array : null;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name);
    const arr = new Float32Array(tris.length * 3 * a.itemSize);
    tris.forEach((t, ti) => {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[3 * t + k] : 3 * t + k;
        for (let c = 0; c < a.itemSize; c++) arr[(ti * 3 + k) * a.itemSize + c] = a.array[vi * a.itemSize + c];
      }
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  out.computeBoundingSphere();
  return out;
}

/**
 * Leaves kept at a density: a seeded shuffle of the islands (seed from the type file), the first round(n * density)
 * kept. Same order for every season, so spring and autumn are subsets of summer. Null when density is 0.
 */
export function thinnedLeaves(asset: NatureAsset, density: number): THREE.BufferGeometry | null {
  if (density <= 0) return null;
  if (density >= 1) return asset.leaves;
  const rng = createRng(hashString(asset.type.file) >>> 0);
  const order = asset.islands.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const kept = order.slice(0, Math.round(order.length * density));
  return subsetGeometry(asset.leaves, kept.flatMap((i) => asset.islands[i]).sort((a, b) => a - b));
}

/** Layer of the broadleaf shadow copies: drawn only by the sun's shadow camera (Town.tsx enables it there). */
export const SHADOW_LAYER = 1;
/** Share of the (seasonal) broadleaf leaves that cast shadows. The main pass draws all of them. */
export const SHADOW_LEAF_FRACTION = 0.5;

/** Bark islands that do not touch the trunk and start above this height are foliage clusters, not wood. */
export const FOLIAGE_MIN_Y = 2.5;

/** Bounding box of an island's vertices (metres). */
function islandBox(tris: number[], pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, idx: ArrayLike<number>): { size: number[]; count: number } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const seen = new Set<number>();
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const v = idx[3 * t + k];
      if (seen.has(v)) continue;
      seen.add(v);
      const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      for (let c = 0; c < 3; c++) {
        lo[c] = Math.min(lo[c], p[c]);
        hi[c] = Math.max(hi[c], p[c]);
      }
    }
  }
  return { size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], count: seen.size };
}

/** A compact clump (not a twig or a sheet): every side at most 3 m, shortest side at least 40% of the longest, 30+ vertices. */
function isCluster(box: { size: number[]; count: number }): boolean {
  const max = Math.max(...box.size);
  const min = Math.min(...box.size);
  return box.count >= 30 && max <= 3 && min >= 0.4 * max;
}

/**
 * The Quaternius "Bark" primitives also carry crown clusters: floating islands high in the crown that are
 * not joined to the trunk. They move to the leaf geometry, so winter hides them with the leaves and the trunk
 * and connected branches stay. Indexed input only; returns the bark unchanged when there is nothing to move.
 */
export function splitFoliage(bark: THREE.BufferGeometry): { bark: THREE.BufferGeometry; foliage: THREE.BufferGeometry | null } {
  if (!bark.index) return { bark, foliage: null };
  const pos = bark.getAttribute('position');
  const idx = bark.index.array;
  const islands = leafIslands(bark);
  let trunk = -1;
  let trunkY = Infinity;
  const minY = islands.map((tris, i) => {
    let y = Infinity;
    for (const t of tris) for (let k = 0; k < 3; k++) y = Math.min(y, pos.getY(idx[3 * t + k]));
    if (y < trunkY) {
      trunkY = y;
      trunk = i;
    }
    return y;
  });
  const foliageTris: number[] = [];
  const woodTris: number[] = [];
  islands.forEach((tris, i) => {
    if (i !== trunk && minY[i] >= FOLIAGE_MIN_Y && isCluster(islandBox(tris, pos, idx))) foliageTris.push(...tris);
    else woodTris.push(...tris);
  });
  if (foliageTris.length === 0) return { bark, foliage: null };
  const withIndex = (tris: number[]): THREE.BufferGeometry => {
    const g = bark.clone();
    const index = new Uint32Array(tris.length * 3);
    tris.forEach((t, n) => {
      for (let k = 0; k < 3; k++) index[3 * n + k] = idx[3 * t + k];
    });
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    return g;
  };
  return { bark: withIndex(woodTris), foliage: withIndex(foliageTris) };
}

/**
 * Builds a NatureAsset from a parsed GLB. Bakes node transforms into the geometry, splits bark and leaf meshes by
 * material name, and sets materials. `maps` null leaves the materials untextured (tests); `uniforms` null skips sway.
 */
export function natureAssetFromGltf(
  type: NatureType,
  gltf: GLTF,
  maps: { bark: THREE.Texture | null; leaf: THREE.Texture | null } | null,
  uniforms: WindUniforms | null,
): NatureAsset {
  gltf.scene.updateMatrixWorld(true);
  const barkParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    (/leave|leaf/i.test(mat.name) ? leafParts : barkParts).push(g);
  });
  if (barkParts.length === 0 || leafParts.length === 0) throw new Error(`${type.file}: needs bark and leaf meshes`);
  const join = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
    if (parts.length === 1) return parts[0];
    const merged = mergeGeometries(parts, false);
    if (!merged) throw new Error(`${type.file}: merge failed`);
    return merged;
  };
  const barkAll = join(barkParts);
  const split = type.evergreen ? { bark: barkAll, foliage: null } : splitFoliage(barkAll);
  const bark = split.bark;
  const leaves = join(split.foliage ? [...leafParts, split.foliage] : leafParts);
  bark.computeBoundingSphere();
  leaves.computeBoundingSphere();

  const barkMat = new THREE.MeshStandardMaterial({
    name: `${type.file}-bark`,
    map: maps?.bark ?? null,
    flatShading: true,
    roughness: 0.95,
    metalness: 0,
  });
  const leafMat = new THREE.MeshStandardMaterial({
    name: `${type.file}-leaves`,
    map: maps?.leaf ?? null,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    flatShading: true,
    roughness: 0.85,
    metalness: 0,
  });
  if (uniforms) {
    applyWindSway(barkMat, uniforms);
    applyWindSway(leafMat, uniforms);
  }
  // Wet and snow uniforms (weather), the same ones the streets and buildings react to. Chained after the sway.
  attachWeather(barkMat);
  attachWeather(leafMat);
  const islands = leafIslands(leaves);
  setIslandVariety(leaves, islands, hashString(type.file) >>> 0);
  applyLeafVariety(leafMat);
  const snowMat = new THREE.MeshStandardMaterial({
    name: type.file + '-snow',
    color: SNOW,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
  const snowLeafMat = new THREE.MeshStandardMaterial({
    name: type.file + '-snow-leaves',
    color: SNOW,
    map: maps?.leaf ?? null,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  });
  if (uniforms) {
    applyWindSway(snowMat, uniforms);
    applyWindSway(snowLeafMat, uniforms);
  }
  const snowBark = snowCap(bark);
  const snowLeaves = snowCap(leaves);
  return { type, bark, leaves, islands, barkMat, leafMat, snowBark, snowLeaves, snowMat, snowLeafMat };
}

/**
 * Snow caps: the triangles of `geo` that face up (normal.y above minUp), pushed out by `lift` along their normal so
 * they never sit on the surface they cover. Returns null when no face is up.
 */
export function snowCap(geo: THREE.BufferGeometry, minUp = 0.5, lift = 0.05): THREE.BufferGeometry | null {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.getAttribute('position');
  const out: number[] = [];
  const uvAttr = src.getAttribute('uv');
  const uvOut: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(b, a).cross(e.subVectors(c, a)).normalize();
    if (n.y < minUp) continue;
    for (const v of [a, b, c]) out.push(v.x + n.x * lift, v.y + n.y * lift, v.z + n.z * lift);
    if (uvAttr) for (let k = 0; k < 3; k++) uvOut.push(uvAttr.getX(i + k), uvAttr.getY(i + k));
  }
  if (src !== geo) src.dispose();
  if (out.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  if (uvAttr) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvOut, 2));
  g.computeBoundingSphere();
  return g;
}

/**
 * Per-vertex `aIsland` (rA, rB, height 0..1): two seeded randoms per leaf island (seed from the type file) and the
 * island's height across the leaf mesh. Read by the leaf shader (leafVarietyGlsl) for hue, lightness and autumn ramp.
 */
export function setIslandVariety(leaves: THREE.BufferGeometry, islands: number[][], seed: number): void {
  const pos = leaves.getAttribute('position');
  const idx = leaves.index ? leaves.index.array : null;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  const span = Math.max(1e-3, maxY - minY);
  const data = new Float32Array(pos.count * 3);
  const rng = createRng(seed);
  for (const tris of islands) {
    const rA = rng();
    const rB = rng();
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx[3 * t + k] : 3 * t + k;
        data[vi * 3] = rA;
        data[vi * 3 + 1] = rB;
        data[vi * 3 + 2] = (pos.getY(vi) - minY) / span;
      }
    }
  }
  leaves.setAttribute('aIsland', new THREE.BufferAttribute(data, 3));
}

export interface LeafVarietyUniforms {
  uAutumn: { value: number };
  uVary: { value: number };
  [name: string]: { value: unknown };
}

/**
 * Adds the leaf colour variety shader (leafVarietyGlsl) to a leaf material, chained after any existing patch
 * (the wind sway). Per-island and per-tree randoms come from `aIsland` and the instance colour. The base colour
 * keeps the texture luminance: hue changes, brightness does not. Uniforms are returned and stored on
 * `material.userData.variety`; apply() sets uAutumn and uVary per season.
 */
export function applyLeafVariety(material: THREE.MeshStandardMaterial): LeafVarietyUniforms {
  const uniforms: LeafVarietyUniforms = {
    uAutumnRed: { value: new THREE.Color(AUTUMN_RED) },
    uAutumnOrange: { value: new THREE.Color(AUTUMN_ORANGE) },
    uAutumnYellow: { value: new THREE.Color(AUTUMN_YELLOW) },
    uGreenYellow: { value: new THREE.Color(GREEN_YELLOW) },
    uGreenTeal: { value: new THREE.Color(GREEN_TEAL) },
    uAutumn: { value: 0 },
    uVary: { value: 1 },
    /** Summer brightness lift factor (0 or 1), set per season in apply(). */
    uSummer: { value: 0 },
  };
  const prevBefore = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prevBefore(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = /* glsl */ `
attribute vec3 aIsland;
varying vec3 vLvIsland;
varying vec3 vLvTree;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      /* glsl */ `
#include <color_vertex>
vLvIsland = aIsland;
#ifdef USE_INSTANCING_COLOR
vLvTree = instanceColor;
#else
vLvTree = vec3(0.5);
#endif
`,
    );
    shader.fragmentShader = /* glsl */ `
varying vec3 vLvIsland;
varying vec3 vLvTree;
uniform float uSummer;
` + leafVarietyGlsl + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      /* glsl */ `
#include <color_fragment>
diffuseColor.rgb = leafVariety(diffuseColor.rgb, vLvIsland, vLvTree);
`,
    );
  };
  material.customProgramCacheKey = () => `${prevKey.call(material)}|lv1`;
  material.userData.variety = uniforms;
  return uniforms;
}

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
  const shadowUsers: { mesh: THREE.InstancedMesh; asset: NatureAsset }[] = [];
  const snowMeshes: THREE.InstancedMesh[] = [];
  const cache = new Map<string, THREE.BufferGeometry | null>();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, items: readonly NatureTreeItem[], name: string) => {
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
    const leaves = add(asset.leaves, asset.leafMat, items, `nature-leaves-${asset.type.file}`);
    if (!asset.type.evergreen) {
      // Broadleaf shadows come from a thinner copy on the shadow layer: the main pass draws the full leaves, the sun pass
      // only the shadow copy (Town.tsx enables SHADOW_LAYER on the sun's shadow camera).
      leaves.castShadow = false;
      const shadow = add(asset.leaves, asset.leafMat, items, `nature-leaves-shadow-${asset.type.file}`);
      shadow.castShadow = true;
      shadow.receiveShadow = false;
      shadow.layers.set(SHADOW_LAYER);
      shadowUsers.push({ mesh: shadow, asset });
    }
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
    for (const { mesh, asset } of shadowUsers) {
      const key = `${asset.type.file}|shadow|${sNow}`;
      let geo = cache.get(key);
      if (geo === undefined) {
        geo = thinnedLeaves(asset, seasonLeafDensity(sNow) * SHADOW_LEAF_FRACTION);
        cache.set(key, geo);
      }
      mesh.visible = geo !== null;
      if (geo) mesh.geometry = geo;
    }
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
