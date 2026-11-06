// Leaf material for tree types: per-island variety attribute and the leaf colour shader patch.
import * as THREE from 'three';
import { createRng } from '../core/rng';
import {
  AUTUMN_ORANGE,
  AUTUMN_RED,
  AUTUMN_YELLOW,
  GREEN_TEAL,
  GREEN_YELLOW,
  leafVarietyGlsl,
} from '../environment/leafVariety';

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
// The instance colour is per-tree random data for leafVariety (vLvTree), not a tint. Three would also multiply it
// into the diffuse colour (USE_COLOR), which turns spring crowns dark brown; undo that here.
vColor.xyz = vec3(1.0);
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
