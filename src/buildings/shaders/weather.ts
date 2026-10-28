// Weather look for shared surface materials: one `uWet` and one `uSnow` uniform (both default 0, so
// the dry look is unchanged). Written as a generic patch that works on any MeshStandardMaterial
// (building body, street and ground materials): it only needs the view-space normal and a world
// position varying, so it needs no extra vertex attributes.
//
//  - wet: darker albedo, lower roughness, world-space noise puddles on upward faces, a faint sky
//    reflection (uWetSky, written by the weather controller; black = off).
//  - snow: white cover that only forms on upward-facing surfaces, ragged edge from noise.
import * as THREE from 'three';

export const weatherUniforms = {
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uWetSky: { value: new THREE.Color(0, 0, 0) },
};

export const WEATHER_VERTEX_COMMON = /* glsl */ `
varying vec3 vWxPos;
`;

/** Placed after `#include <project_vertex>`: view-space position back to world space. */
export const WEATHER_VERTEX_AFTER_PROJECT = /* glsl */ `
vWxPos = cameraPosition + transpose(mat3(viewMatrix)) * mvPosition.xyz;
`;

export const WEATHER_FRAGMENT_COMMON = /* glsl */ `
uniform float uWet;
uniform float uSnow;
uniform vec3 uWetSky;
varying vec3 vWxPos;
float wxHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wxNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wxHash(i), wxHash(i + vec2(1.0, 0.0)), f.x),
             mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

/** Placed after `#include <emissivemap_fragment>`: normal, diffuseColor and roughnessFactor are final here. */
export const WEATHER_FRAGMENT_AFTER_EMISSIVE = /* glsl */ `
if (uWet > 0.001 || uSnow > 0.001) {
  vec3 wxN = inverseTransformDirection(normal, viewMatrix);
  float wxUp = smoothstep(0.55, 0.9, wxN.y);
  float wxBig = wxNoise(vWxPos.xz * 0.23);
  float wxFine = wxNoise(vWxPos.xz * 1.1 + 7.0);
  if (uWet > 0.001) {
    float wxPud = smoothstep(0.62 - 0.30 * uWet, 0.80 - 0.30 * uWet, wxBig * 0.7 + wxFine * 0.3) * wxUp * uWet;
    float wxDamp = uWet * (0.55 + 0.45 * wxUp);
    diffuseColor.rgb *= mix(1.0, 0.64, wxDamp) * mix(1.0, 0.78, wxPud);
    roughnessFactor = mix(roughnessFactor, 0.16, clamp(wxDamp * 0.55 + wxPud * 0.6, 0.0, 0.92));
    vec3 wxV = normalize(vViewPosition);
    float wxFres = pow(1.0 - clamp(abs(dot(normal, wxV)), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += uWetSky * (0.05 + 0.5 * wxFres) * (wxPud + 0.25 * wxDamp * wxUp);
  }
  if (uSnow > 0.001) {
    float wxEdge = (wxBig - 0.5) * 0.5 + (wxFine - 0.5) * 0.25;
    float wxCover = smoothstep(0.0, 1.0, clamp(uSnow * 1.35 + wxEdge, 0.0, 1.0)) * smoothstep(0.62, 0.84, wxN.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 1.0) * (0.96 + 0.04 * wxFine), wxCover);
    roughnessFactor = mix(roughnessFactor, 0.92, wxCover);
  }
}
`;

type ShaderLike = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };

/** Splices the weather code and binds the shared uniforms. Safe on shaders that lack an anchor. */
export function patchWeather(shader: ShaderLike): void {
  shader.uniforms.uWet = weatherUniforms.uWet;
  shader.uniforms.uSnow = weatherUniforms.uSnow;
  shader.uniforms.uWetSky = weatherUniforms.uWetSky;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WEATHER_VERTEX_COMMON}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${WEATHER_VERTEX_AFTER_PROJECT}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${WEATHER_FRAGMENT_COMMON}`)
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${WEATHER_FRAGMENT_AFTER_EMISSIVE}`);
}

/**
 * Makes any MeshStandardMaterial react to uWet and uSnow (street, ground and furniture materials).
 * Chains onto an existing onBeforeCompile; calling it twice is harmless.
 */
export function attachWeather<T extends THREE.Material>(material: T): T {
  if (material.userData.hasWeather) return material;
  material.userData.hasWeather = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    patchWeather(shader as unknown as ShaderLike);
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${prevKey.call(material)}|wx1`;
  material.needsUpdate = true;
  return material;
}
