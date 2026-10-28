// One animal shader family: a MeshStandardMaterial patched with onBeforeCompile so animals still get the
// scene lighting, fog and tone mapping, while wings, heads, tails and legs animate in the vertex shader.
//
// Per-vertex: 'aPart' (see geometry.ts). Per-instance: 'aAnim' (vec4), meaning depends on the mode:
//   pigeon    x = flap amplitude, y = phase, z = spread (0 folded, 1 open), w = peck (+) / walk bob (-)
//   flyer     x = flap amplitude, y = phase, z = wingbeat speed multiplier
//   cat       x = eye glow, y = phase, z = walk speed, w = pose (0 sit, 1 lie, 2 walk)
//   squirrel  x = tail twitch, y = phase
//   butterfly y = phase, z = speed offset, w = 1 for bees

import * as THREE from 'three';

export type AnimalMode = 'pigeon' | 'flyer' | 'cat' | 'squirrel' | 'butterfly';

export interface AnimalUniforms {
  uTime: { value: number };
  uNight: { value: number };
}

const HEADER = /* glsl */ `
attribute float aPart;
attribute vec4 aAnim;
varying float vPart;
varying float vGlow;
uniform float uTime;
vec3 rotX(vec3 p, vec3 o, float a){ p -= o; float c = cos(a), s = sin(a); return vec3(p.x, p.y*c - p.z*s, p.y*s + p.z*c) + o; }
vec3 rotY(vec3 p, vec3 o, float a){ p -= o; float c = cos(a), s = sin(a); return vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c) + o; }
vec3 wingFlap(vec3 p, vec3 h, float s, float a){
  p -= h;
  float c = cos(s*a), sn = sin(s*a);
  return vec3(p.x*c - p.y*sn, p.x*sn + p.y*c, p.z) + h;
}
`;

const PIGEON = /* glsl */ `
float flap = aAnim.x; float ph = aAnim.y; float spread = aAnim.z; float peck = aAnim.w;
if (aPart > 0.5 && aPart < 2.5) {
  float s = aPart < 1.5 ? -1.0 : 1.0;
  vec3 h = vec3(s*0.02, 0.185, 0.02);
  vec3 q = transformed - h;
  q.x *= mix(0.3, 1.0, spread);
  q.z *= mix(0.85, 1.0, spread);
  transformed = q + h;
  float a = flap * sin(uTime*38.0 + ph) * 0.9 + mix(-0.75, 0.2, spread);
  transformed = wingFlap(transformed, h, s, a);
} else if (aPart > 2.5 && aPart < 3.5) {
  vec3 pivot = vec3(0.0, 0.15, 0.09);
  if (peck > 0.0) {
    float cyc = 0.5 + 0.5*sin(uTime*9.0 + ph);
    transformed = rotX(transformed, pivot, peck * (0.15 + 0.85*pow(cyc, 1.5)) * 0.9);
  } else if (peck < 0.0) {
    transformed.z += sin(uTime*11.0 + ph) * 0.022;
  } else {
    transformed = rotY(transformed, pivot, sin(uTime*0.9 + ph*3.0) * 0.5 * step(0.4, sin(uTime*0.37 + ph)));
  }
}
if (spread > 0.5) { transformed.y += sin(uTime*38.0 + ph) * 0.012 * flap; }
`;

const FLYER = /* glsl */ `
float flap = aAnim.x; float ph = aAnim.y;
if (aPart > 0.5 && aPart < 2.5) {
  float s = aPart < 1.5 ? -1.0 : 1.0;
  vec3 h = vec3(s*0.016, 0.012, 0.01);
  float a = sin(uTime*30.0*aAnim.z + ph) * (0.25 + 0.65*flap) + 0.12;
  transformed = wingFlap(transformed, h, s, a);
}
`;

const CAT = /* glsl */ `
float ph = aAnim.y; float pose = aAnim.w;
vec3 p = transformed;
bool upper = aPart < 0.5 || (aPart > 2.5 && aPart < 3.5) || (aPart > 4.5 && aPart < 5.5);
// head turn (about the neck)
if ((aPart > 2.5 && aPart < 3.5) || (aPart > 4.5 && aPart < 5.5)) {
  float turn = 0.85 * clamp(sin(uTime*0.21 + ph*2.0) * 3.0, -1.0, 1.0);
  if (pose > 1.5) turn *= 0.2;
  p = rotY(p, vec3(0.0, 0.25, 0.14), turn);
}
// tail
if (aPart > 3.5 && aPart < 4.5) {
  float w = clamp((-p.z - 0.17) * 6.0, 0.0, 1.0);
  float flick = pow(max(0.0, sin(uTime*0.43 + ph*3.0)), 10.0);
  float sway = sin(uTime*1.4 + ph) * 0.4 + flick * 1.2 * sin(uTime*13.0);
  if (pose < 1.5) {
    float sg = sin(ph * 7.0) > 0.0 ? 1.0 : -1.0;
    p = rotY(p, vec3(0.0, 0.0, -0.19), sg * (1.05 + sway * w * 0.15));
    p.y *= 0.4;
  } else {
    p.y += w * 0.05;
    p.x += sway * w * 0.04;
  }
}
// legs (walk)
if (aPart > 5.5) {
  if (pose > 1.5) {
    float dir = aPart < 6.5 ? 1.0 : -1.0;
    float zc = p.z > 0.0 ? 0.12 : -0.13;
    p = rotX(p, vec3(0.0, 0.15, zc), sin(uTime*9.0*aAnim.z + ph)*0.7*dir);
  }
}
// pose
if (pose < 0.5) {
  // sitting: haunches down, torso upright
  if (upper) { p = rotX(p, vec3(0.0, 0.1, -0.12), -0.62); }
  if (aPart > 5.5 && p.z < 0.0) { p.y *= 0.5; }
  if (aPart > 5.5 && p.z > 0.0) { p.z -= 0.105; }
  p.y -= 0.05;
} else if (pose < 1.5) {
  // lying loaf: compress height, stretch a touch
  p.y *= (aPart > 5.5 ? 0.26 : 0.62); p.z *= 1.04;
  if (aPart > 5.5) { p.x *= 0.45; }
} else {
  p.y += abs(sin(uTime*9.0*aAnim.z + ph)) * 0.008;
}
transformed = p;
vGlow = aAnim.x;
`;

const SQUIRREL = /* glsl */ `
if (aPart > 3.5 && aPart < 4.5) {
  float w = clamp((-transformed.z - 0.1) * 8.0, 0.0, 1.0);
  transformed.x += sin(uTime*7.0 + aAnim.y) * aAnim.x * w * 0.05;
  transformed.y += sin(uTime*2.3 + aAnim.y) * 0.004 * w;
}
`;

const BUTTERFLY = /* glsl */ `
if (aPart > 0.5 && aPart < 2.5) {
  float s = aPart < 1.5 ? -1.0 : 1.0;
  vec3 h = vec3(s*0.004, 0.0, 0.0);
  bool bee = aAnim.w > 0.5;
  vec3 q = transformed - h;
  if (bee) { q *= 0.55; }
  transformed = q + h;
  float f = bee ? 70.0 : (13.0 + aAnim.z);
  float amp = bee ? 0.45 : 1.0;
  float a = 0.35 + sin(uTime*f + aAnim.y) * amp;
  transformed = wingFlap(transformed, h, s, a);
}
`;

const CODE: Record<AnimalMode, string> = {
  pigeon: PIGEON,
  flyer: FLYER,
  cat: CAT,
  squirrel: SQUIRREL,
  butterfly: BUTTERFLY,
};

export function createAnimalMaterial(mode: AnimalMode): { material: THREE.MeshStandardMaterial; uniforms: AnimalUniforms } {
  const uniforms: AnimalUniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uNight = uniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEADER}`)
      .replace('#include <color_vertex>', `#include <color_vertex>\n#ifdef USE_COLOR\nif (aPart > 4.5 && aPart < 5.5) vColor = color;\n#endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvPart = aPart; vGlow = 0.0;\n${CODE[mode]}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPart;\nvarying float vGlow;\nuniform float uNight;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\nif (vPart > 4.5 && vPart < 5.5) { totalEmissiveRadiance += vec3(0.95, 1.0, 0.35) * uNight * vGlow * 2.2; }`,
      );
  };
  material.customProgramCacheKey = () => `life-${mode}`;
  return { material, uniforms };
}

/** Per-instance animation attribute (vec4), dynamic. */
export function attachAnim(mesh: THREE.InstancedMesh, capacity: number): Float32Array {
  const arr = new Float32Array(capacity * 4);
  const attr = new THREE.InstancedBufferAttribute(arr, 4);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aAnim', attr);
  return arr;
}
