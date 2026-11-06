// Builds a NatureAsset (baked bark, leaves, snow and materials) from a parsed GLB.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { hashString } from '../environment/forest';
import { applyWindSway, type WindUniforms } from '../environment/trees';
import { attachWeather, weatherUniforms } from '../shaders/wetSurface';
import type { NatureAsset, NatureType } from './natureTypes';
import { PINE_SNOW_COVER, PINE_SNOW_UP } from './natureTypes';
import { addLeafClusters, leafIslands, snowCap, splitFoliage } from './natureGeometry';
import { applyLeafVariety, setIslandVariety } from './natureLeafMaterial';

/** Snow cover on upward-facing bark and needle tops (winter only). */
const SNOW = new THREE.Color('#f1f4f7');

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
  const leaves = addLeafClusters(join(split.foliage ? [...leafParts, split.foliage] : leafParts), type.evergreen === true);
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
  if (type.evergreen) {
    // Pine foliage: the upward threshold of the snow cover. The shared GLSL is patched after the weather code is
    // injected, so only this material changes.
    const [lo, hi] = PINE_SNOW_UP;
    const prev = leafMat.onBeforeCompile;
    leafMat.onBeforeCompile = (shader, renderer) => {
      prev.call(leafMat, shader, renderer);
      // Pine snow uniform: live view of the shared snow cover, capped at PINE_SNOW_COVER for this material only.
      shader.uniforms.uSnow = {
        get value() {
          return Math.min(weatherUniforms.uSnow.value, PINE_SNOW_COVER);
        },
      };
      shader.fragmentShader = shader.fragmentShader.replace(
        'smoothstep(0.62, 0.84, wxN.y)',
        `smoothstep(${lo.toFixed(3)}, ${hi.toFixed(3)}, wxN.y)`,
      );
    };
    leafMat.needsUpdate = true;
  }
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
  // Conifers: no snow geometry; snow comes from the weather shader on the leaf material (upward faces).
  const snowLeaves = type.evergreen ? null : snowCap(leaves);
  return { type, bark, leaves, islands, barkMat, leafMat, snowBark, snowLeaves, snowMat, snowLeafMat };
}
