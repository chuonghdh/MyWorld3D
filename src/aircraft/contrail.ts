// Contrails: one dynamic ribbon mesh holding a ring buffer of quads per aircraft slot.
// A quad is written once, when its sample is taken (start/end point, tangent, birth times); after that
// the GPU derives age, width and alpha from the uniform clock, so a frame does no allocation and no
// per-frame work beyond a few uniforms. The CPU functions below mirror the shader and are what the
// tests check.

import * as THREE from 'three';
import { DAY_SECONDS } from '../store/model';

/** Seconds a contrail lingers before it has fully dissipated: one in-app hour of simulated time (60 s). */
export const CONTRAIL_LIFE = DAY_SECONDS / 24;
/** Seconds between trail samples. */
export const SAMPLE_STEP = 0.4;
/** Quads per slot: enough for the whole life at the sample step, with headroom. */
export const QUADS_PER_SLOT = Math.ceil(CONTRAIL_LIFE / SAMPLE_STEP) + 8;
/** Ribbon width (m) when fresh and when fully spread. */
export const WIDTH_FRESH = 1;
export const WIDTH_SPREAD = 11;
/** Peak opacity of a fresh trail in clear air. */
export const MAX_ALPHA = 0.95;
/** Sideways and vertical wobble of the centreline (m) at the end of the trail's life, and wind drift factor. */
export const WOBBLE_MAX = 26;
export const WIND_DRIFT = 0.12;
/** Birth time of an empty quad: its age is huge, so it is invisible. */
export const EMPTY_BIRTH = -1e9;

const sm = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Width of the ribbon at `age` seconds: grows like a diffusing plume. */
export function contrailWidth(age: number): number {
  const k = Math.min(1, Math.max(0, age / CONTRAIL_LIFE));
  return WIDTH_FRESH + (WIDTH_SPREAD - WIDTH_FRESH) * Math.pow(k, 0.6);
}

/** Opacity (0..MAX_ALPHA) at `age` seconds in clear air; 0 outside [0, life). */
export function contrailAlpha(age: number): number {
  if (age < 0 || age >= CONTRAIL_LIFE) return 0;
  const fresh = sm(0, 2.5, age);
  const left = 1 - age / CONTRAIL_LIFE;
  return MAX_ALPHA * fresh * Math.pow(left, 1.3);
}

/** Centreline wobble amplitude (m) at `age` seconds: zero at the aircraft, growing to WOBBLE_MAX. */
export function contrailWobble(age: number): number {
  const k = Math.min(1, Math.max(0, age / CONTRAIL_LIFE));
  return WOBBLE_MAX * Math.pow(k, 1.3);
}

/** How strongly contrails form (0..1): only in clear or fair air, thinning with cloud, rain, snow and fog. */
export function contrailStrength(w: {
  cloudiness: number;
  rain: number;
  snowfall: number;
  fogDensityMul: number;
}): number {
  const cloud = 1 - sm(0.3, 0.8, w.cloudiness);
  const wet = 1 - sm(0.02, 0.2, w.rain);
  const snow = 1 - sm(0.02, 0.2, w.snowfall);
  const fog = 1 - sm(1.15, 2.2, w.fogDensityMul);
  return cloud * wet * snow * fog;
}

/** Contrail colour from the sun: white by day, golden at dusk, dark grey at night. Writes into `out`. */
export function contrailTint(
  sunColor: { r: number; g: number; b: number },
  sunIntensity: number,
  ambient: number,
  out: THREE.Color,
): THREE.Color {
  const lit = Math.min(1, Math.max(0, sunIntensity));
  const base = 0.2 + 0.4 * Math.min(1, ambient);
  out.setRGB(
    base + (Math.min(1, sunColor.r * 1.05) - base) * lit,
    base + (Math.min(1, sunColor.g * 1.05) - base) * lit,
    base + (Math.min(1, sunColor.b * 1.05) - base) * lit,
  );
  return out;
}

/** Visibility factor for the whole trail: it fades away as the sun sets and is almost gone at night. */
export function contrailDayFactor(sunIntensity: number, ambient: number): number {
  return 0.06 + 0.94 * sm(0.12, 0.6, sunIntensity + ambient * 0.2);
}

const VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aSide;
attribute float aBirth;
attribute float aSeed;
uniform float uTime;
uniform float uLife;
uniform float uStrength;
uniform float uWidthFresh;
uniform float uWidthSpread;
uniform float uMaxAlpha;
uniform float uWobble;
uniform float uDrift;
uniform vec2 uWind;
varying float vAlpha;
varying float vEdge;
varying float vBirth;
varying float vSeed;
varying float vAge;
#include <fog_pars_vertex>
// Low-frequency 1D noise from two sines: smooth, deterministic from (birth time, flight seed).
float wob(float b, float s) {
  return sin(b * 0.115 + s) * 0.6 + sin(b * 0.047 + s * 1.7 + 1.3) * 0.4;
}
void main() {
  float age = uTime - aBirth;
  float k = clamp(age / uLife, 0.0, 1.0);
  float left = 1.0 - k;
  float alpha = uMaxAlpha * smoothstep(0.0, 2.5, age) * pow(left, 1.3) * uStrength;
  // The centreline wanders more and more with age, and the whole plume drifts with the wind.
  float amp = uWobble * pow(k, 1.3);
  vec3 dir = normalize(aDir);
  vec3 perp = normalize(vec3(-dir.z, 0.0, dir.x) + vec3(1e-5, 0.0, 0.0));
  vec3 centre = position
    + perp * wob(aBirth, aSeed) * amp
    + vec3(0.0, wob(aBirth + 37.0, aSeed * 1.9 + 4.0) * amp * 0.5, 0.0)
    + vec3(uWind.x, 0.0, uWind.y) * (age * uDrift);
  vec3 toCam = cameraPosition - centre;
  float dist = length(toCam);
  // Gone before it can meet the near plane, and well before the far plane.
  float far = projectionMatrix[3][2] / (projectionMatrix[2][2] + 1.0);
  alpha *= smoothstep(25.0, 80.0, dist) * (1.0 - smoothstep(far * 0.6, far * 0.9, dist));
  vAlpha = (age < 0.0 || age >= uLife) ? 0.0 : alpha;
  vEdge = aSide;
  vBirth = aBirth;
  vSeed = aSeed;
  vAge = k;
  float width = mix(uWidthFresh, uWidthSpread, pow(k, 0.6));
  vec3 side = normalize(cross(dir, toCam) + vec3(1e-5, 0.0, 0.0));
  vec3 world = centre + side * aSide * width * 0.5;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  if (vAlpha < 0.003) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    gl_Position = projectionMatrix * mvPosition;
  }
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
varying float vEdge;
varying float vBirth;
varying float vSeed;
varying float vAge;
#include <fog_pars_fragment>
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float soft = 1.0 - vEdge * vEdge;
  // Old smoke breaks up: noise along the length (birth time) and across the width opens gaps with age.
  float n = vnoise(vec2(vBirth * 0.55 + vSeed, vEdge * 1.7 + vSeed * 0.37)) * 0.65
          + vnoise(vec2(vBirth * 1.9 + vSeed * 2.0, vEdge * 4.1)) * 0.35;
  float thr = 0.72 * smoothstep(0.2, 0.95, vAge);
  float holes = smoothstep(thr - 0.12, thr + 0.12, n);
  holes = mix(1.0, holes, smoothstep(0.1, 0.4, vAge));
  gl_FragColor = vec4(uColor, vAlpha * soft * holes);
  #include <fog_fragment>
}
`;

export interface ContrailRibbon {
  readonly mesh: THREE.Mesh;
  /** Appends the segment a -> b (born at times ta, tb) to the slot's ring, overwriting its oldest quad. */
  push(
    slot: number,
    ax: number,
    ay: number,
    az: number,
    ta: number,
    bx: number,
    by: number,
    bz: number,
    tb: number,
    seed: number,
  ): void;
  /** Birth time of the far (newer) end of ring entry `index` of a slot; EMPTY_BIRTH when never written. */
  birthOf(slot: number, index: number): number;
  /** Next ring index to be written for a slot. */
  headOf(slot: number): number;
  setTime(t: number): void;
  setLook(tint: THREE.Color, strength: number, windX?: number, windZ?: number): void;
  /** Empties every ring. */
  clear(): void;
  dispose(): void;
}

export function createContrailRibbon(slots: number): ContrailRibbon {
  const quads = slots * QUADS_PER_SLOT;
  const verts = quads * 4;
  const pos = new Float32Array(verts * 3);
  const dir = new Float32Array(verts * 3);
  const side = new Float32Array(verts);
  const birth = new Float32Array(verts).fill(EMPTY_BIRTH);
  const seedArr = new Float32Array(verts);
  const index = new Uint32Array(quads * 6);
  for (let q = 0; q < quads; q++) {
    const v = q * 4;
    // Vertices: 0 = start -, 1 = start +, 2 = end -, 3 = end +.
    index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], q * 6);
    side[v] = -1;
    side[v + 1] = 1;
    side[v + 2] = -1;
    side[v + 3] = 1;
  }
  const head = new Int32Array(slots);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const dirAttr = new THREE.BufferAttribute(dir, 3).setUsage(THREE.DynamicDrawUsage);
  const birthAttr = new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aDir', dirAttr);
  geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geometry.setAttribute('aBirth', birthAttr);
  const seedAttr = new THREE.BufferAttribute(seedArr, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aSeed', seedAttr);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  // The ribbon spans the whole sky domain: a huge bound so nothing ever culls it by a stale sphere.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  geometry.boundingBox = new THREE.Box3(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(1e5, 1e5, 1e5));

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uLife: { value: CONTRAIL_LIFE },
      uStrength: { value: 1 },
      uWidthFresh: { value: WIDTH_FRESH },
      uWidthSpread: { value: WIDTH_SPREAD },
      uMaxAlpha: { value: MAX_ALPHA },
      uWobble: { value: WOBBLE_MAX },
      uDrift: { value: WIND_DRIFT },
      uWind: { value: new THREE.Vector2() },
      uColor: { value: new THREE.Color(1, 1, 1) },
    },
  ]);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'contrails';
  mesh.frustumCulled = false;
  // After the cloud puffs (4) and smoke (5), before fog banks (18) and rain (19+).
  mesh.renderOrder = 6;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => undefined;

  return {
    mesh,
    push(slot, ax, ay, az, ta, bx, by, bz, tb, seed) {
      const q = slot * QUADS_PER_SLOT + head[slot];
      head[slot] = (head[slot] + 1) % QUADS_PER_SLOT;
      let dx = bx - ax;
      let dy = by - ay;
      let dz = bz - az;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len;
      dy /= len;
      dz /= len;
      for (let k = 0; k < 4; k++) {
        const v = q * 4 + k;
        const end = k >= 2;
        pos[v * 3] = end ? bx : ax;
        pos[v * 3 + 1] = end ? by : ay;
        pos[v * 3 + 2] = end ? bz : az;
        dir[v * 3] = dx;
        dir[v * 3 + 1] = dy;
        dir[v * 3 + 2] = dz;
        birth[v] = end ? tb : ta;
        seedArr[v] = seed;
      }
      posAttr.needsUpdate = true;
      dirAttr.needsUpdate = true;
      birthAttr.needsUpdate = true;
      seedAttr.needsUpdate = true;
    },
    birthOf(slot, i) {
      return birth[(slot * QUADS_PER_SLOT + i) * 4 + 2];
    },
    headOf(slot) {
      return head[slot];
    },
    setTime(t) {
      uniforms.uTime.value = t;
    },
    setLook(tint, strength, windX = 0, windZ = 0) {
      (uniforms.uColor.value as THREE.Color).copy(tint);
      uniforms.uStrength.value = strength;
      (uniforms.uWind.value as THREE.Vector2).set(windX, windZ);
    },
    clear() {
      birth.fill(EMPTY_BIRTH);
      head.fill(0);
      birthAttr.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
