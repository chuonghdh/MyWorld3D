// Street surface wear: asphalt grain, block tone, worn patches, oil stains and patch seams on the road;
// stone paver joints (0.40 x 0.15 m staggered bond), base grime and scuffing on the pavement; fading and grime on the paint.
// Pure shader work on the existing surface and overlay materials: no texture, no mesh, no extra draw call.
// Road and pavement are told apart by the vertex colour (luminance), so the builders need no extra attribute.
// Every pattern is world-space and offset by a per-town seed, so the same layout always looks the same.

import * as THREE from 'three';
import { cityStreets } from '../config/tuning';
import { SIDEWALK_TOP } from './surfaces';

export type StreetWearMode = 'surface' | 'paint';

/** Shared knob uniforms. The objects are shared, so a knob change reaches every street material. */
/** A configured hex colour as the linear RGB the shader multiplies with (vec3 uniforms read x, y, z). */
function accentVector(hex: string): THREE.Vector3 {
  const c = new THREE.Color(hex);
  return new THREE.Vector3(c.r, c.g, c.b);
}

const knobUniforms = {
  uCurbTop: { value: SIDEWALK_TOP },
  uBlockTone: { value: cityStreets.roadBlockTone },
  uAggregate: { value: cityStreets.roadAggregate },
  uWornLift: { value: cityStreets.roadWornLift },
  uOilStain: { value: cityStreets.roadOilStain },
  uPatchSeam: { value: cityStreets.roadPatchSeam },
  uPavingJoint: { value: cityStreets.pavingJoint },
  uPavingGrime: { value: cityStreets.pavingGrime },
  uPavingWear: { value: cityStreets.pavingWear },
  uPavingBike: { value: cityStreets.pavingBikeTrack },
  uPavingFoot: { value: cityStreets.pavingFootprint },
  uPavingStain: { value: cityStreets.pavingStain },
  uPavingGum: { value: cityStreets.pavingGumSpot },
  uPavingPuddle: { value: cityStreets.pavingPuddleMark },
  uPavingDirtZone: { value: cityStreets.pavingDirtZone },
  uPavingJointWidth: { value: cityStreets.pavingJointWidth },
  uPavingEdgeWear: { value: cityStreets.pavingEdgeWear },
  uPavingStoneTone: { value: cityStreets.pavingStoneTone },
  uAccentShare: { value: cityStreets.pavingAccentShare },
  uAccentA: { value: accentVector(cityStreets.pavingAccentColours[0]) },
  uAccentB: { value: accentVector(cityStreets.pavingAccentColours[1]) },
  uAccentC: { value: accentVector(cityStreets.pavingAccentColours[2]) },
  uPaintWear: { value: cityStreets.paintWear },
  uPaintFade: { value: cityStreets.paintFade },
};

/**
 * Per-town offset for the world-space patterns, in metres of noise space (range [0, 97) on each axis).
 * Pure: the same seed always gives the same pattern, and different towns differ.
 */
export function streetWearSeed(seed: number): THREE.Vector2 {
  const hash = (salt: number): number => {
    let x = Math.imul((seed | 0) ^ Math.imul(salt, 0x27d4eb2d), 0x9e3779b1) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
  };
  return new THREE.Vector2(hash(1) * 97, hash(2) * 97);
}

// The noise helpers take their own names: GLSL reserves words such as `patch` and `sample`, and a clash
// fails the compile, which makes the whole surface disappear.
const WEAR_VERTEX_COMMON = /* glsl */ `
varying vec3 vWearPos;
varying vec3 vWearNormal;
`;
const WEAR_VERTEX_AFTER_PROJECT = /* glsl */ `
vWearPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWearNormal = normalize(mat3(modelMatrix) * objectNormal);
`;
const WEAR_FRAGMENT_COMMON = /* glsl */ `
varying vec3 vWearPos;
varying vec3 vWearNormal;
uniform vec2 uWearSeed;
uniform float uCurbTop;
uniform float uBlockTone;
uniform float uAggregate;
uniform float uWornLift;
uniform float uOilStain;
uniform float uPatchSeam;
uniform float uPavingJoint;
uniform float uPavingGrime;
uniform float uPavingWear;
uniform float uPavingBike;
uniform float uPavingFoot;
uniform float uPavingStain;
uniform float uPavingGum;
uniform float uPavingPuddle;
uniform float uPavingDirtZone;
uniform float uPavingJointWidth;
uniform float uPavingEdgeWear;
uniform float uPavingStoneTone;
uniform float uAccentShare;
uniform vec3 uAccentA;
uniform vec3 uAccentB;
uniform vec3 uAccentC;
uniform float uPaintWear;
uniform float uPaintFade;
float wearHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// Sine-free hash for the paver accent choice: large cell indices lose precision in sin() on some GPUs,
// which clusters the picks. This one stays uniform for any cell index.
float accentHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wearNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wearHash(i), wearHash(i + vec2(1.0, 0.0)), f.x),
             mix(wearHash(i + vec2(0.0, 1.0)), wearHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;
// Road and pavement: classified by the vertex colour luminance (asphalt is dark, pavement light, grass between).
const WEAR_SURFACE_FRAGMENT = /* glsl */ `
{
  vec2 wp = vWearPos.xz + uWearSeed;
  // Base grain (about +/-7 %) on every ground surface, as before the wear pass.
  diffuseColor.rgb *= 0.93 + 0.10 * wearNoise(wp * 0.6) + 0.04 * wearNoise(wp * 5.0);
  float wLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float wRoad = 1.0 - smoothstep(0.12, 0.2, wLuma);
  // Paving is blue-grey stone only. The warm town base and gravel under the open corners stay plain ground.
  float wBlue = smoothstep(-0.01, 0.01, diffuseColor.b - diffuseColor.r);
  float wPave = smoothstep(0.38, 0.5, wLuma) * (1.0 - wRoad) * wBlue;
  // Asphalt: block tone per 24 m cell, aggregate speckle, lighter worn patches, oil stains, faint seams every 7 m.
  float wTone = wearHash(floor(wp / 24.0)) - 0.5;
  float wGrain = wearNoise(wp * 22.0) - 0.5;
  float wWorn = smoothstep(0.55, 0.75, wearNoise(wp * 0.35 + 7.3));
  float wOil = smoothstep(0.6, 0.9, wearNoise(wp * 1.7 + 3.1));
  vec2 wSeamD = abs(fract(wp / 7.0 + 0.5) - 0.5) * 7.0;
  float wSeam = (1.0 - smoothstep(0.0, 0.05, min(wSeamD.x, wSeamD.y))) * step(0.5, wearHash(floor(wp / 7.0) + 0.5));
  float wRoadF = 1.0 + uBlockTone * wTone * 2.0 + uAggregate * wGrain * 2.0 + uWornLift * wWorn
    - uOilStain * wOil - uPatchSeam * wSeam;
  // Pavement: stone pavers 0.40 x 0.15 m in a staggered bond (every other row shifted 0.20 m),
  // joints, tone per stone, faint edge wear, grime on the vertical kerb faces near the base, scuffing.
  float wRow = floor(wp.y / 0.15);
  float wStoneU = (wp.x + 0.2 * mod(wRow, 2.0)) / 0.4;
  vec2 wStoneCell = vec2(floor(wStoneU), wRow);
  vec2 wStoneLocal = vec2(fract(wStoneU) * 0.4, fract(wp.y / 0.15) * 0.15);
  float wEdgeD = min(min(wStoneLocal.x, 0.4 - wStoneLocal.x), min(wStoneLocal.y, 0.15 - wStoneLocal.y));
  float wJointLine = 1.0 - smoothstep(uPavingJointWidth * 0.5 - 0.003, uPavingJointWidth * 0.5 + 0.003, wEdgeD);
  float wSlab = wearHash(wStoneCell) - 0.5;
  float wStoneEdge = (1.0 - smoothstep(0.0, 0.03, wEdgeD)) * (0.5 + 0.5 * wearNoise(wp * 6.0 + 29.0));
  float wFace = 1.0 - abs(normalize(vWearNormal).y);
  float wGrime = wFace * (1.0 - smoothstep(0.0, uCurbTop, vWearPos.y)) * (0.6 + 0.4 * wearNoise(wp * 3.0));
  float wScuff = smoothstep(0.6, 0.8, wearNoise(wp * 0.8 + 5.1));
  // Bicycle tracks: a narrow pair of thin lines (0.55 m apart, about 3.6 cm wide each) in short segments,
  // at a seeded angle per 40 m cell. Repeats every 4 m across the track, only in some cells and patches.
  vec2 wBCell = floor(wp / 40.0);
  float wBAng = wearHash(wBCell + 17.0) * 3.14159;
  vec2 wBDir = vec2(cos(wBAng), sin(wBAng));
  vec2 wBLocal = wp - wBCell * 40.0;
  float wBAcross = dot(wBLocal, vec2(-wBDir.y, wBDir.x));
  float wBAlong = dot(wBLocal, wBDir);
  float wBU = (fract(wBAcross / 4.0 + wearHash(wBCell)) - 0.5) * 4.0;
  float wBPair = min(abs(wBU - 0.275), abs(wBU + 0.275));
  float wBLine = 1.0 - smoothstep(0.012, 0.02, wBPair);
  float wBSeg = step(0.5, fract(wBAlong / 3.0 + wearHash(wBCell + 9.0)));
  float wBike = wBLine * wBSeg * step(0.5, wearNoise(wp * 0.25 + 19.0)) * step(0.4, wearHash(wBCell + 5.0));
  // Footprints: a sole-shaped dark mark per 2.5 m cell, seeded angle, in about a quarter of the cells.
  vec2 wFCell = floor(wp / 2.5);
  vec2 wFLocal = wp - (wFCell + 0.5) * 2.5;
  float wFAng = wearHash(wFCell + 31.0) * 6.2832;
  float wFC = cos(wFAng);
  float wFS = sin(wFAng);
  vec2 wFRot = vec2(wFC * wFLocal.x - wFS * wFLocal.y, wFS * wFLocal.x + wFC * wFLocal.y);
  float wFoot = (1.0 - smoothstep(0.8, 1.0, length(wFRot / vec2(0.1, 0.22)))) * step(0.72, wearHash(wFCell + 3.0));
  // Dirty stains: low-frequency blotches with fine breakup.
  float wStain = smoothstep(0.62, 0.78, wearNoise(wp * 0.6 + 23.0)) * (0.5 + 0.5 * wearNoise(wp * 4.0));
  // Dirt: gum spots (one candidate per 1.2 m cell), dry puddle rings (noise contours), and dirt zones per 24 m block.
  vec2 wGCell = floor(wp / 1.2);
  vec2 wGLocal = wp - (wGCell + 0.5) * 1.2;
  float wGum = (1.0 - smoothstep(0.035, 0.05, length(wGLocal))) * step(0.9, wearHash(wGCell + 53.0));
  float wPuddleN = wearNoise(wp * 0.5 + 61.0);
  float wPuddle = (1.0 - smoothstep(0.0, 0.03, abs(wPuddleN - 0.6))) * step(0.6, wearNoise(wp * 0.15 + 67.0));
  float wZone = smoothstep(0.55, 0.85, wearHash(floor(wp / 24.0) + 71.0)) * (0.5 + 0.5 * wearNoise(wp * 0.8 + 73.0));
  float wPaveF = 1.0 + uPavingStoneTone * wSlab * 2.0 - uPavingJoint * wJointLine - uPavingEdgeWear * wStoneEdge
    - uPavingGrime * wGrime - uPavingWear * wScuff
    - uPavingBike * wBike - uPavingFoot * wFoot - uPavingStain * wStain
    - uPavingGum * wGum - uPavingPuddle * wPuddle - uPavingDirtZone * wZone;
  // Accent pavers: about uAccentShare of the stones (seeded per stone) take one of three colours instead of the grey.
  float wAccentOn = step(accentHash(wStoneCell + 41.0), uAccentShare) * wPave;
  float wAccentPick = accentHash(wStoneCell + 77.0);
  vec3 wAccentCol = wAccentPick < 0.33 ? uAccentA : (wAccentPick < 0.66 ? uAccentB : uAccentC);
  diffuseColor.rgb = mix(diffuseColor.rgb, wAccentCol, wAccentOn);
  diffuseColor.rgb *= wRoad * wRoadF + wPave * wPaveF + (1.0 - wRoad - wPave);
}
`;
// Paint: light paint fades and greys in patches; the bare patches show as dull asphalt.
const WEAR_PAINT_FRAGMENT = /* glsl */ `
{
  vec2 wp = vWearPos.xz + uWearSeed;
  float wLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float wPaint = smoothstep(0.6, 0.8, wLuma);
  float wWornPaint = smoothstep(0.5, 0.8, wearNoise(wp * 0.9 + 11.0));
  float wFine = wearNoise(wp * 18.0);
  diffuseColor.rgb *= 1.0 - wPaint * (uPaintFade + uPaintWear * wWornPaint * (0.5 + 0.5 * wFine));
}
`;

/**
 * Patches one street material (surface or paint) so its colour gets the wear pattern.
 * Chains any earlier onBeforeCompile and must run before the weather and cloud patches, as the old grain did.
 */
export function attachStreetWear(material: THREE.MeshStandardMaterial, mode: StreetWearMode, seed: number): void {
  const seedUniform = { value: streetWearSeed(seed) };
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    Object.assign(shader.uniforms, knobUniforms, { uWearSeed: seedUniform });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WEAR_VERTEX_COMMON}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${WEAR_VERTEX_AFTER_PROJECT}`);
    const body = mode === 'surface' ? WEAR_SURFACE_FRAGMENT : WEAR_PAINT_FRAGMENT;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WEAR_FRAGMENT_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${body}`);
  };
  const prevKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${prevKey.call(material)}|street-wear-${mode}-v1`;
  material.needsUpdate = true;
}
