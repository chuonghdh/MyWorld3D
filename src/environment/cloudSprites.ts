// Low, lazy cumulus floating over the town, a little above the birds (they fly up to ~44 m).
// One draw call: a single instanced mesh of camera-facing puffs (a cluster is a cauliflower dome with a
// flat grey base), lit by the sun colour with a fake sphere normal, so tops are bright, bellies are
// grey and the rims are shaded whether the camera is on the street or looking down from above.
// Their shadows are not drawn here: cloudShade.ts rasterises the same layout into a mask that the
// shared surface materials sample, so roofs, walls, trees and streets are shaded in the town's lighting.
// The clusters live in a wrapping square domain centred on the town, so they drift forever without
// respawning, and fade by cloud amount, domain edge, camera distance and fog so nothing pops.

import * as THREE from 'three';
import {
  buildCloudLayout,
  clamp01,
  cloudDomain,
  cloudScales,
  effectiveCoverage,
  smooth,
  type CloudLayout,
} from './cloudLayout';

export * from './cloudLayout';

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

export interface CloudSprites {
  /** The lit puffs (draw call 1). */
  readonly mesh: THREE.Mesh;
  /** Drift of the whole field in metres (shared with the shadow mask). */
  readonly drift: THREE.Vector2;
  readonly domain: number;
  readonly origin: { x: number; z: number };
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

  // Values shared by reference so every consumer of the field agrees.
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
  // The geometry is an InstancedBufferGeometry, so a plain Mesh draws every puff in one call.
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cloud-sprites';
  mesh.frustumCulled = false;
  // After the opaque scene, before smoke (5), fog banks (18) and rain (19+).
  mesh.renderOrder = 4;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => undefined; // nothing may pick the clouds

  const drift = shared.uDrift.value;
  const amb = new THREE.Color();
  const WHITE = new THREE.Color(1, 1, 1);
  let sky = { r: 0.6, g: 0.65, b: 0.75 };
  let ambient = 0.6;
  const applyAmbient = (): void => {
    const k = 0.1 + 0.9 * smooth(0.1, 0.65, ambient);
    amb.setRGB(sky.r, sky.g, sky.b);
    // Cloud shade is a lightened sky colour: clouds are whiter than the sky around them.
    amb.lerp(WHITE, 0.45).multiplyScalar(k);
    (uniforms.uAmbient.value as THREE.Color).copy(amb);
  };

  return {
    mesh,
    drift,
    domain,
    origin: { x: origin.x, z: origin.z },
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
      uniforms.uSunK.value = clamp01(strength);
    },
    setLighting(sunDir, sunColor, skyColor, amb2) {
      shared.uSunDir.value.set(sunDir.x, sunDir.y, sunDir.z).normalize();
      (uniforms.uSunColor.value as THREE.Color).setRGB(sunColor.r, sunColor.g, sunColor.b);
      sky = skyColor;
      ambient = amb2;
      applyAmbient();
    },
    dispose() {
      quad.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
