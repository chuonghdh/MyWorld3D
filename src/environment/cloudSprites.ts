// Low, lazy cumulus floating over the town, a little above the birds (they fly up to ~44 m).
// Two draw calls in total:
//   1. the clouds: one instanced mesh of camera-facing puffs (a cluster is a cauliflower dome with a
//      flat grey base), lit by the sun colour with a fake sphere normal, so tops are bright, bellies
//      are grey and the rims are shaded whether the camera is on the street or looking down from above;
//   2. their shadows: one soft blob per cluster, projected along the sun direction onto the ground
//      from the SAME layout and drift, so a shadow always sits under its cloud.
// The clusters live in a wrapping square domain centred on the town, so they drift forever without
// respawning, and fade by cloud amount, domain edge, camera distance and fog so nothing pops.

import * as THREE from 'three';
import { createRng } from '../core/rng';

/** Lowest cluster base and highest puff top, metres above the ground (birds fly at 26..44 m). */
export const CLOUD_BASE_MIN = 70;
export const CLOUD_BASE_MAX = 100;
export const CLOUD_TOP_MAX = 140;
/** Mean spacing of cluster centres in metres; the domain is split into a grid of this cell size. */
export const CLOUD_CELL = 90;
/** Darkest the ground may get under a cloud shadow (0.35 = 35% darker). */
export const CLOUD_MAX_DARKNESS = 0.35;
/** Height of the shadow decal above the ground: above sidewalks (0.15), below street overlays (0.19..). */
export const CLOUD_DECAL_Y = 0.2;
/** Clouds drift this fraction of the wind speed, never slower than the minimum or faster than the maximum (m/s). */
export const CLOUD_WIND_FACTOR = 0.32;
export const CLOUD_MIN_DRIFT = 1.2;
export const CLOUD_MAX_DRIFT = 4;
/** Kept for older callers: the gentle drift that applies in calm air. */
export const CLOUD_BASE_DRIFT = CLOUD_MIN_DRIFT;

export interface CloudLayout {
  /** Number of puffs (instances). */
  count: number;
  /** Number of clusters. */
  clusters: number;
  /** Side of the wrapping domain in metres. */
  domain: number;
  /** vec3 per puff: wrapped cluster centre (x, z in 0..1 of the domain) and base altitude in metres. */
  center: Float32Array;
  /** vec3 per puff: offset from the cluster centre in metres. */
  offset: Float32Array;
  /** vec4 per puff: half width, half height (metres), noise seed, visibility threshold 0..1. */
  info: Float32Array;
  /** vec3 per puff: 1 for the first puff of a cluster (casts the shadow), height inside the cluster 0..1, cluster half width. */
  misc: Float32Array;
}

/** Side of the wrapping domain for a town of the given size: wide enough that its edge fades outside the town. */
export function cloudDomain(townExtent: number): number {
  return Math.min(1400, Math.max(800, townExtent * 1.8));
}

/** Deterministic cloud field; clusters sit on a jittered grid so they rarely overlap. */
export function buildCloudLayout(seed: number, domain = 800): CloudLayout {
  const grid = Math.min(16, Math.max(6, Math.round(domain / CLOUD_CELL)));
  const rng = createRng(seed * 31 + 5);
  const maxPuffs = grid * grid * 12;
  const center = new Float32Array(maxPuffs * 3);
  const offset = new Float32Array(maxPuffs * 3);
  const info = new Float32Array(maxPuffs * 4);
  const misc = new Float32Array(maxPuffs * 3);
  let n = 0;

  for (let gz = 0; gz < grid; gz++) {
    for (let gx = 0; gx < grid; gx++) {
      const cx = (gx + 0.3 + 0.4 * rng()) / grid;
      const cz = (gz + 0.3 + 0.4 * rng()) / grid;
      const alt = CLOUD_BASE_MIN + rng() * (CLOUD_BASE_MAX - CLOUD_BASE_MIN);
      const half = 18 + rng() * 22 + (rng() < 0.15 ? 8 : 0); // cluster width 36..96 m
      const thr = rng() * 0.92;
      const puffs = 8 + Math.floor(rng() * 5);
      for (let k = 0; k < puffs; k++) {
        const u = k === 0 ? 0 : rng() * 2 - 1;
        const v = k === 0 ? 0 : rng() * 2 - 1;
        const f = Math.max(0, 1 - Math.hypot(u, v) / 1.42);
        const radius = Math.min(30, Math.max(9, half * (0.4 + 0.35 * f)));
        const ry = radius * 0.8;
        // Keep the highest rim under CLOUD_TOP_MAX even with the weather scaling (radius up to +20%, bob 1.5 m).
        const room = CLOUD_TOP_MAX - 2 - alt - ry * 1.2 - 1.5;
        const oy = Math.max(0, Math.min(radius * 0.3 + f * half * 0.7 * (0.5 + 0.5 * rng()), room));
        const h = Math.min(1, oy / Math.max(1, half * 0.7));
        center.set([cx, alt, cz], n * 3);
        offset.set([u * half, oy, v * half * 0.6], n * 3);
        // Neighbouring puffs of one cluster share the threshold (a small spread softens the pop-in).
        info.set([radius, ry, rng() * 10, Math.min(0.98, thr + rng() * 0.04)], n * 4);
        misc.set([k === 0 ? 1 : 0, h, half], n * 3);
        n++;
      }
    }
  }
  return {
    count: n,
    clusters: grid * grid,
    domain,
    center: center.slice(0, n * 3),
    offset: offset.slice(0, n * 3),
    info: info.slice(0, n * 4),
    misc: misc.slice(0, n * 3),
  };
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Fair-weather clouds exist even on a clear day; overcast fills the sky. Mirrors the shaders. */
export function effectiveCoverage(coverage: number): number {
  return 0.28 + 0.72 * clamp01(coverage);
}

/** How visible a cluster with the given threshold is at a cloud amount (0..1). Mirrors the shaders. */
export function cumulusVisibility(threshold: number, coverage: number): number {
  return smooth(threshold, threshold + 0.1, effectiveCoverage(coverage));
}

/** Weather scaling of altitude, puff size and cluster height (shared by the shaders and the tests). */
export function cloudScales(coverage: number): { alt: number; size: number; height: number } {
  const c = clamp01(coverage);
  return { alt: 1 - 0.12 * c, size: 1 + 0.2 * c, height: 1 - 0.3 * c };
}

/** Highest point (metres) of puff `i` at a cloud amount, ignoring the 1.5 m bob. Mirrors the vertex shader. */
export function puffTop(layout: CloudLayout, i: number, coverage: number): number {
  const s = cloudScales(coverage);
  return layout.center[i * 3 + 1] * s.alt + layout.offset[i * 3 + 1] * s.height + layout.info[i * 4 + 1] * s.size;
}

/** Drift velocity (m/s) along the wind: a fraction of the wind speed, with a gentle minimum and a cap. */
export function cloudDriftVelocity(
  wind: { x: number; z: number },
  out: { x: number; z: number },
): { x: number; z: number } {
  const speed = Math.hypot(wind.x, wind.z);
  if (speed < 0.05) {
    out.x = CLOUD_MIN_DRIFT; // calm air: drift gently east
    out.z = 0;
    return out;
  }
  const mag = Math.min(CLOUD_MAX_DRIFT, Math.max(CLOUD_MIN_DRIFT, speed * CLOUD_WIND_FACTOR));
  out.x = (wind.x / speed) * mag;
  out.z = (wind.z / speed) * mag;
  return out;
}

/**
 * Where the shadow of something `height` metres up lands, relative to the point right under it:
 * away from the sun by height / tan(elevation). `sunDir` points from the ground towards the sun.
 * The elevation is limited to ~9 degrees so a grazing sun does not throw shadows kilometres away.
 */
export function cloudShadowOffset(
  sunDir: { x: number; y: number; z: number },
  height: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  const len = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
  const sy = Math.max(sunDir.y / len, 0.15);
  out.x = (-sunDir.x / len / sy) * height;
  out.z = (-sunDir.z / len / sy) * height;
  return out;
}

/** Shadow strength 0..1 for a sun elevation: the shadows fade out as the sun gets low or sets. */
export function cloudShadowSun(sunDirY: number, sunlight: number): number {
  return smooth(0.08, 0.35, sunDirY) * clamp01(sunlight);
}

/** Ground darkness (0..CLOUD_MAX_DARKNESS) for a blob density 0..1; exported for tests and mirrored in the shader. */
export function cloudShadowAlpha(density: number, strength: number): number {
  return clamp01(density) * CLOUD_MAX_DARKNESS * clamp01(strength);
}

const COMMON_VERTEX_HEAD = /* glsl */ `
attribute vec3 aCenter;
attribute vec3 aOffset;
attribute vec4 aInfo;
attribute vec3 aMisc;
uniform vec2 uDrift;
uniform vec3 uOrigin;
uniform float uDomain;
uniform float uCover;
uniform float uAltScale;
uniform float uSizeScale;
uniform float uHeightScale;
uniform float uTime;
`;

// Wrapped cluster centre on the ground plane, domain-edge fade and cluster visibility.
const COMMON_CLUSTER = /* glsl */ `
  vec2 w = fract(aCenter.xz + uDrift / uDomain);
  float edge = 1.0 - smoothstep(0.36, 0.5, max(abs(w.x - 0.5), abs(w.y - 0.5)));
  vec2 c = uOrigin.xz + (w - 0.5) * uDomain;
  float vis = smoothstep(aInfo.w, aInfo.w + 0.1, uCover);
`;

const VERTEX = /* glsl */ `
${COMMON_VERTEX_HEAD}
varying vec2 vUv;
varying float vSeed;
varying float vH;
varying float vFade;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
${COMMON_CLUSTER}
  float bob = sin(uTime * 0.25 + aInfo.z * 6.283) * 1.5;
  vec3 centre = vec3(c.x + aOffset.x * uSizeScale,
                     aCenter.y * uAltScale + aOffset.y * uHeightScale + bob,
                     c.y + aOffset.z * uSizeScale);
  vec4 mvPosition = viewMatrix * vec4(centre, 1.0);
  float size = max(aInfo.x, aInfo.y) * uSizeScale;
  float dist = length(mvPosition.xyz);
  float far = projectionMatrix[3][2] / (projectionMatrix[2][2] + 1.0);
  // Fully gone ~10 m + 0.6 size from the camera, fully there 30 m later: never engulfs the camera or meets the near plane.
  float nearFade = smoothstep(size * 0.6 + 10.0, size * 0.6 + 40.0, dist);
  float farFade = 1.0 - smoothstep(far * 0.6, far * 0.9, dist);
  float fade = edge * vis * nearFade * farFade;
  vFade = fade;
  vUv = position.xy;
  vSeed = aInfo.z;
  vH = aMisc.y;
  vWorld = centre;
  mvPosition.xy += position.xy * vec2(aInfo.x, aInfo.y) * uSizeScale;
  if (fade < 0.004) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    gl_Position = projectionMatrix * mvPosition;
  }
  #include <fog_vertex>
}
`;

const NOISE = /* glsl */ `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uSunK;
uniform float uCover;
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vH;
varying float vFade;
varying vec3 vWorld;
#include <fog_pars_fragment>
${NOISE}
// Octaves drift in different directions, so the billows slowly morph instead of sliding.
float fbm(vec2 p, float t) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    s += a * vnoise(p + t * 0.02 * (fi + 1.0) * vec2(cos(fi * 2.4), sin(fi * 2.4)));
    p = p * 2.07 + 13.3;
    a *= 0.5;
  }
  return s / 0.875;
}

void main() {
  vec2 p = vUv;
  float r2 = dot(p, p);
  if (r2 >= 1.0) discard;
  float r = sqrt(r2);
  float n = fbm(p * 1.7 + vSeed * 37.0, uTime);
  float dens = smoothstep(0.0, 0.55, (1.0 - r) * 1.25 + (n - 0.5) * 0.85);
  float alpha = dens * 0.94 * vFade;
  if (alpha < 0.004) discard;

  // Fake sphere normal in view space, bent by the noise, rotated to world space (transpose of the view rotation).
  vec3 nView = normalize(vec3(p * 0.9 + (n - 0.5) * 0.35, sqrt(max(1.0 - r2, 0.0)) + 0.15));
  vec3 wn = normalize(nView * mat3(viewMatrix));
  float lit = pow(clamp(dot(wn, uSunDir) * 0.5 + 0.5, 0.0, 1.0), 1.5);
  // Up-facing parts are bright whatever the camera does: tops from above, grey bellies and shaded rims.
  float hh = clamp(mix(vH, wn.y * 0.5 + 0.5, 0.6), 0.0, 1.0);

  vec3 direct = uSunColor * lit * uSunK * (0.3 + 0.7 * hh) * 1.2 * (1.0 - 0.5 * uCover);
  vec3 ambient = uAmbient * (0.55 + 0.45 * hh);
  vec3 col = (ambient + direct) * (0.8 + 0.2 * hh);
  // Darker pockets inside the billows.
  col *= 1.0 - (1.0 - n) * 0.22 * dens;
  // Silver lining on thin edges that face the sun.
  vec3 v = normalize(vWorld - cameraPosition);
  float forward = pow(max(dot(v, uSunDir), 0.0), 6.0);
  col += uSunColor * forward * uSunK * (1.0 - smoothstep(0.0, 0.7, dens)) * 0.55;

  // Rain and storm clouds turn grey and heavy.
  float luma = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(col, vec3(luma) * 0.7, uCover * 0.55);
  col *= 1.0 - 0.3 * smoothstep(0.75, 1.0, uCover);
  col = clamp(col, vec3(0.0), vec3(1.3));

  gl_FragColor = vec4(col, alpha);
  #include <fog_fragment>
}
`;

const SHADOW_VERTEX = /* glsl */ `
${COMMON_VERTEX_HEAD}
uniform vec3 uSunDir;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
void main() {
  if (aMisc.x < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
${COMMON_CLUSTER}
  float height = aCenter.y * uAltScale + aMisc.z * 0.35 * uHeightScale;
  vec2 off = -uSunDir.xz / max(uSunDir.y, 0.15) * height;
  vec2 halfSize = vec2(aMisc.z * 1.2, aMisc.z * 0.9) * uSizeScale;
  vFade = edge * vis;
  vUv = position.xy;
  vSeed = aInfo.z;
  if (vFade < 0.004) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 world = vec3(c.x + off.x + position.x * halfSize.x, ${CLOUD_DECAL_Y.toFixed(2)}, c.y + off.y + position.y * halfSize.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const SHADOW_FRAGMENT = /* glsl */ `
uniform float uShadowK;
uniform float uTime;
uniform float uMaxDark;
varying vec2 vUv;
varying float vSeed;
varying float vFade;
${NOISE}
void main() {
  float r = length(vUv);
  if (r >= 1.0) discard;
  // Lumpy, softly feathered blob: noise bends the radius, a smoothstep fades the rim over its whole width.
  float n = vnoise(vUv * 2.2 + vSeed * 17.0 + uTime * 0.01) * 0.6 + vnoise(vUv * 4.7 + vSeed * 5.0) * 0.4;
  float d = smoothstep(1.0, 0.15, r + (n - 0.5) * 0.45);
  float a = d * uMaxDark * uShadowK * vFade;
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.02, 0.03, 0.07, a);
}
`;

export interface CloudSprites {
  /** The lit puffs (draw call 1). */
  readonly mesh: THREE.Mesh;
  /** The ground shadows (draw call 2). */
  readonly shadowMesh: THREE.Mesh;
  readonly layout: CloudLayout;
  update(dt: number, velocity: { x: number; z: number }): void;
  setCoverage(coverage: number): void;
  /** Sun strength 0..1 (already dimmed by the weather). */
  setSunlight(strength: number): void;
  setLighting(
    sunDir: { x: number; y: number; z: number },
    sunColor: { r: number; g: number; b: number },
    skyColor: { r: number; g: number; b: number },
    ambient: number,
  ): void;
  dispose(): void;
}

export function createCloudSprites(origin: { x: number; z: number }, seed: number, townExtent = 217): CloudSprites {
  const domain = cloudDomain(townExtent);
  const layout = buildCloudLayout(seed, domain);
  const geometry = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  geometry.setAttribute('aCenter', new THREE.InstancedBufferAttribute(layout.center, 3));
  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(layout.offset, 3));
  geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(layout.info, 4));
  geometry.setAttribute('aMisc', new THREE.InstancedBufferAttribute(layout.misc, 3));
  geometry.instanceCount = layout.count;

  // Values shared by reference between the cloud and shadow materials, so both always agree.
  const shared = {
    uDrift: { value: new THREE.Vector2(0, 0) },
    uOrigin: { value: new THREE.Vector3(origin.x, 0, origin.z) },
    uDomain: { value: domain },
    uCover: { value: effectiveCoverage(0.25) },
    uAltScale: { value: 1 },
    uSizeScale: { value: 1 },
    uHeightScale: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uTime: { value: 0 },
  };
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uAmbient: { value: new THREE.Color(0.6, 0.65, 0.75) },
      uSunK: { value: 1 },
    },
  ]);
  Object.assign(uniforms, shared);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });
  const shadowUniforms = { ...shared, uShadowK: { value: 1 }, uMaxDark: { value: CLOUD_MAX_DARKNESS } };
  const shadowMaterial = new THREE.ShaderMaterial({
    uniforms: shadowUniforms,
    vertexShader: SHADOW_VERTEX,
    fragmentShader: SHADOW_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  // Whatever a caller does to the flags, the shadow must stay visible and must never enter a shadow map.
  Object.defineProperty(shadowMaterial, 'colorWrite', { get: () => true, set: () => undefined });

  // The geometry is an InstancedBufferGeometry, so a plain Mesh draws every puff in one call.
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cloud-sprites';
  mesh.frustumCulled = false;
  // After the opaque scene and the shadows, before smoke (5), fog banks (18) and rain (19+).
  mesh.renderOrder = 4;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => undefined; // nothing may pick the clouds

  const shadowMesh = new THREE.Mesh(geometry, shadowMaterial);
  shadowMesh.name = 'cloud-shadows';
  shadowMesh.frustumCulled = false;
  shadowMesh.renderOrder = 3;
  shadowMesh.receiveShadow = false;
  Object.defineProperty(shadowMesh, 'castShadow', { get: () => false, set: () => undefined });
  shadowMesh.raycast = () => undefined;

  const drift = shared.uDrift.value;
  const amb = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1);
  let sky = { r: 0.6, g: 0.65, b: 0.75 };
  let ambient = 0.6;
  let sunlight = 1;
  let sunY = 1;
  const applyAmbient = (): void => {
    const k = 0.1 + 0.9 * smooth(0.1, 0.65, ambient);
    amb.setRGB(sky.r, sky.g, sky.b);
    // Cloud shade is a lightened sky colour: clouds are whiter than the sky around them.
    amb.lerp(WHITE, 0.45).multiplyScalar(k);
    (uniforms.uAmbient.value as THREE.Color).copy(amb);
  };
  const applyShadow = (): void => {
    shadowUniforms.uShadowK.value = cloudShadowSun(sunY, sunlight);
  };

  return {
    mesh,
    shadowMesh,
    layout,
    update(dt, v) {
      const step = Math.min(Math.max(dt, 0), 0.1);
      drift.x += v.x * step;
      drift.y += v.z * step;
      // Keep the numbers small; the domain is periodic, so wrapping by whole domains changes nothing.
      if (Math.abs(drift.x) > domain * 64) drift.x %= domain;
      if (Math.abs(drift.y) > domain * 64) drift.y %= domain;
      shared.uTime.value += step;
    },
    setCoverage(coverage) {
      const s = cloudScales(coverage);
      shared.uCover.value = effectiveCoverage(coverage);
      shared.uAltScale.value = s.alt;
      shared.uSizeScale.value = s.size;
      shared.uHeightScale.value = s.height;
    },
    setSunlight(strength) {
      sunlight = clamp01(strength);
      uniforms.uSunK.value = sunlight;
      applyShadow();
    },
    setLighting(sunDir, sunColor, skyColor, amb2) {
      shared.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z).normalize();
      sunY = shared.uSunDir.value.y;
      (uniforms.uSunColor.value as THREE.Color).setRGB(sunColor.r, sunColor.g, sunColor.b);
      sky = skyColor;
      ambient = amb2;
      applyAmbient();
      applyShadow();
    },
    dispose() {
      quad.dispose();
      geometry.dispose();
      material.dispose();
      shadowMaterial.dispose();
    },
  };
}
