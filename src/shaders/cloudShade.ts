// Shared shader patch: cloud shadows on the direct sun light of every surface material (moved from
// environment/cloudShade.ts). The GLSL reads one mask texture and a few uniforms that the environment
// writes each frame (see environment/cloudShade.ts createCloudShade). Imports nothing from environment.
import * as THREE from 'three';

/** Uniforms shared by every patched material (one set for the whole town). */
export const cloudShadeUniforms = {
  uCsMask: { value: null as THREE.Texture | null },
  /** World xz of the domain centre. */
  uCsOrigin: { value: new THREE.Vector2(0, 0) },
  uCsDomain: { value: 800 },
  /** Cloud drift in metres (copied from the cloud sprites every update). */
  uCsDrift: { value: new THREE.Vector2(0, 0) },
  /** Horizontal shift toward the sun per metre of height. */
  uCsPar: { value: new THREE.Vector2(0, 0) },
  /** Effective caster height in metres. */
  uCsH: { value: 0 },
  /** Darkness of the direct light in the middle of a shadow; 0 turns the shadows off. */
  uCsK: { value: 0 },
};

const VERTEX_COMMON = /* glsl */ `
varying vec3 vCsPos;
`;
const VERTEX_AFTER_PROJECT = /* glsl */ `
vCsPos = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
`;
const FRAGMENT_COMMON = /* glsl */ `
uniform sampler2D uCsMask;
uniform vec2 uCsOrigin;
uniform float uCsDomain;
uniform vec2 uCsDrift;
uniform vec2 uCsPar;
uniform float uCsH;
uniform float uCsK;
varying vec3 vCsPos;
float cloudShadeAt(vec3 wp) {
  if (uCsK < 0.001) return 1.0;
  vec2 sp = wp.xz + uCsPar * max(uCsH - wp.y, 0.0);
  vec2 cw = (sp - uCsOrigin) / uCsDomain;
  float m = texture2D(uCsMask, cw + 0.5 - uCsDrift / uCsDomain).r;
  float edge = 1.0 - smoothstep(0.36, 0.5, max(abs(cw.x), abs(cw.y)));
  return 1.0 - uCsK * m * edge;
}
`;

/** The lights chunk with the cloud factor applied to every directional light (the sun, and the faint moon). */
const LIGHTS_ANCHOR = 'getDirectionalLightInfo( directionalLight, directLight );';
export const CLOUD_LIGHTS_CHUNK: string = (() => {
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(LIGHTS_ANCHOR)) return '';
  return `float csShade = cloudShadeAt(vCsPos);\n${chunk.replace(LIGHTS_ANCHOR, `${LIGHTS_ANCHOR}\n\t\tdirectLight.color *= csShade;`)}`;
})();

type ShaderLike = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/** True once a program source carries the cloud shadow patch. */
export function hasCloudShade(source: string): boolean {
  return source.includes('cloudShadeAt');
}

/** Splices the lookup into a MeshStandardMaterial program. Safe on shaders that lack an anchor. */
export function patchCloudShade(shader: ShaderLike): void {
  if (!CLOUD_LIGHTS_CHUNK) return;
  Object.assign(shader.uniforms, cloudShadeUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_COMMON}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_AFTER_PROJECT}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_COMMON}`)
    .replace('#include <lights_fragment_begin>', CLOUD_LIGHTS_CHUNK);
}

/**
 * Makes a MeshStandardMaterial receive cloud shadows (chained onto its onBeforeCompile; harmless twice).
 * The program cache key is extended so patched and unpatched programs never share a cache entry.
 */
export function attachCloudShade<T extends THREE.Material>(material: T): T {
  if (material.userData.hasCloudShade) return material;
  material.userData.hasCloudShade = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    patchCloudShade(shader as unknown as ShaderLike);
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${prevKey.call(material)}|cs1`;
  material.needsUpdate = true;
  return material;
}

