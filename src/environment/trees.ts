// Tree foliage: seasonal colours per species and a wind-sway material.
// The sway is done in the vertex shader (MeshStandardMaterial + onBeforeCompile),
// so lighting and shadows still work. Each tree gets its own phase from its
// world origin, so trees do not move in unison.

import * as THREE from 'three';
import type { Season, TreeSpecies } from '../core/types';
import { attachCloudShade, patchCloudShade } from './cloudShade';

export const TREE_SPECIES: readonly TreeSpecies[] = ['maple', 'oak', 'birch', 'ginkgo'];
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

type Palette = Record<Season, string>;

const LEAF_PALETTE: Record<TreeSpecies, Palette> = {
  maple: { spring: '#9ccc5a', summer: '#2f6b2a', autumn: '#d4402a', winter: '#5b4a3a' },
  oak: { spring: '#a6c86b', summer: '#3d6b2e', autumn: '#c0782a', winter: '#5b4a3a' },
  birch: { spring: '#b8e07a', summer: '#6fa84a', autumn: '#e0c23a', winter: '#6b5e52' },
  ginkgo: { spring: '#8fd16a', summer: '#4f8f3a', autumn: '#f0c020', winter: '#5b4a3a' },
};

/**
 * Foliage colour for a species in a season. Winter returns bare-wood brown,
 * and seasonLeafDensity(winter) is 0, so no leaves are drawn.
 */
export function seasonLeafColor(species: TreeSpecies, season: Season): THREE.Color {
  return new THREE.Color(LEAF_PALETTE[species][season]);
}

/**
 * Fraction (0-1) of the full leaf canopy present in a season.
 * Winter is 0 (bare tree). Autumn is thinning, so it is below summer.
 */
export function seasonLeafDensity(season: Season): number {
  switch (season) {
    case 'spring':
      return 0.7;
    case 'summer':
      return 1;
    case 'autumn':
      return 0.6;
    case 'winter':
      return 0;
  }
}

export interface WindUniforms {
  uTime: { value: number };
  /** Wind velocity on the ground plane, (east, south) in m/s. */
  uWind: { value: THREE.Vector2 };
  /** Gust strength, 0-1. */
  uGust: { value: number };
  /** Height in metres at which the sway reaches its full amplitude. */
  uSwayHeight: { value: number };
}

export function createWindUniforms(swayHeight = 10): WindUniforms {
  return {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0, 0) },
    uGust: { value: 0 },
    uSwayHeight: { value: swayHeight },
  };
}

/** Push the current time, wind vector and gust into the shared uniforms. */
export function updateWindUniforms(
  u: WindUniforms,
  t: number,
  wind: { x: number; z: number },
  gust: number,
): void {
  u.uTime.value = t;
  u.uWind.value.set(wind.x, wind.z);
  u.uGust.value = gust;
}

export interface FoliageMaterialOptions {
  species: TreeSpecies;
  season: Season;
  uniforms: WindUniforms;
  /**
   * When true the material is white and takes its colour from the geometry's
   * `color` attribute (used by the instanced tree field). Default false.
   */
  vertexColors?: boolean;
  /** Faceted low-poly shading. Default true. */
  flatShading?: boolean;
}

/**
 * Foliage material for a species in a season. Share one WindUniforms object
 * across all trees so that they all react to the same wind.
 * Works for plain meshes and for InstancedMesh (the phase then comes from each instance).
 */
export function createFoliageMaterial(opts: FoliageMaterialOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: opts.vertexColors ? 0xffffff : seasonLeafColor(opts.species, opts.season),
    vertexColors: opts.vertexColors ?? false,
    flatShading: opts.flatShading ?? true,
    roughness: 0.85,
    metalness: 0,
  });
  applyWindSway(material, opts.uniforms);
  return material;
}

/**
 * Injects the wind sway into a material's vertex shader.
 * - Phase per tree comes from the tree origin in world space (modelMatrix, times
 *   instanceMatrix when instanced), so neighbouring trees never move in unison.
 * - Bend grows with height above the tree base ((h / uSwayHeight)^2), so the base stays fixed
 *   and the top of the crown moves most. A small per-vertex flutter makes leaves shimmer.
 */
export function applyWindSway<T extends THREE.Material>(material: T, uniforms: WindUniforms): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = uniforms.uWind;
    shader.uniforms.uGust = uniforms.uGust;
    shader.uniforms.uSwayHeight = uniforms.uSwayHeight;
    patchCloudShade(shader as unknown as Parameters<typeof patchCloudShade>[0]);

    shader.vertexShader = /* glsl */ `
uniform float uTime;
uniform vec2 uWind;
uniform float uGust;
uniform float uSwayHeight;
` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      /* glsl */ `
#include <begin_vertex>
{
  mat4 treeMatrix = modelMatrix;
#ifdef USE_INSTANCING
  treeMatrix = modelMatrix * instanceMatrix;
#endif
  vec3 origin = (treeMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 worldP = (treeMatrix * vec4(position, 1.0)).xyz;
  float phase = fract(sin(dot(origin.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
  float h = clamp((worldP.y - origin.y) / uSwayHeight, 0.0, 1.0);
  float bend = h * h;
  float gustAmp = 1.0 + 1.5 * uGust;
  float s = sin(uTime * 1.6 + phase) * 0.6 + sin(uTime * 3.7 + phase * 2.0) * 0.4;
  vec2 disp = uWind * 0.03 * gustAmp * s * bend;
  float flutter = sin(uTime * 7.0 + dot(worldP, vec3(1.7, 2.3, 1.3)) + phase)
    * 0.01 * length(uWind) * gustAmp * h;
  vec3 worldDisp = vec3(disp.x + flutter, flutter * 0.5, disp.y - flutter);
  // Convert the world-space displacement into the geometry's local frame.
  transformed += inverse(mat3(treeMatrix)) * worldDisp;
}
`,
    );
  };

  // The injected code is identical for every sway material, so one cache key is enough;
  // three.js still separates programs by its own defines (instancing, vertex colours).
  material.customProgramCacheKey = () => 'myworld3d-foliage-sway|cs1';
  return material;
}

/** Trunk material: plain bark, does not sway. */
export function createBarkMaterial(): THREE.MeshStandardMaterial {
  return attachCloudShade(new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 0.95 }));
}
