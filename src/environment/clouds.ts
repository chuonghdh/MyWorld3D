// Drifting cloud shadows. Instead of shadow-casting meshes (hard, hexagonal, as dark as the sun
// is strong) the clouds are one soft, procedural darkening decal that floats just above the
// ground and slides with the wind. One draw call, no shadow-map cost, darkness capped.

import * as THREE from 'three';
import { createRng } from '../core/rng';

/** Fraction of the wind velocity that clouds follow (they drift slower than the air at ground level). */
export const CLOUD_WIND_FACTOR = 0.25;
/** Slow constant drift in m/s (east), so clouds move even in calm air. */
export const CLOUD_BASE_DRIFT = 0.3;
/** Darkest the ground may get under a cloud shadow (0.35 = 35% darker). */
export const CLOUD_MAX_DARKNESS = 0.35;
/** Height of the decal above the ground. Above sidewalks (0.15) and street overlays (below 0.19). */
export const CLOUD_DECAL_Y = 0.2;

export interface CloudArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CloudOptions {
  area: CloudArea;
  /** Rough cloud amount; about 14 clusters means a mostly cloudy sky. Kept from the mesh version. */
  count?: number;
  /** Unused since the shadows became a decal; kept so callers keep compiling. */
  height?: [number, number];
  seed?: number;
}

export interface CloudField {
  readonly group: THREE.Group;
  update(dt: number, windVector: { x: number; z: number }): void;
  /** Cloud cover 0 (clear) .. 1 (overcast). Drives the weather overlay. */
  setCoverage(coverage: number): void;
  /** Sun strength 0..1; shadows fade as the sun sets so they never darken a night street. */
  setSunlight(strength: number): void;
  dispose(): void;
}

/** Coverage the old `count` option maps to. */
export function coverageForCount(count: number): number {
  return Math.min(0.9, Math.max(0.1, count / 20));
}

/** Shadow alpha (0..CLOUD_MAX_DARKNESS) for a noise value; exported for tests. */
export function cloudShadowAlpha(noise: number, coverage: number, sunlight: number): number {
  const thr = 0.78 - 0.4 * Math.min(1, Math.max(0, coverage));
  const t = Math.min(1, Math.max(0, (noise - thr) / 0.24));
  const smooth = t * t * (3 - 2 * t);
  return smooth * CLOUD_MAX_DARKNESS * Math.min(1, Math.max(0, sunlight));
}

const VERTEX = /* glsl */ `
varying vec2 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec2 uOffset;
uniform float uCoverage;
uniform float uSunlight;
uniform float uMaxDark;
varying vec2 vWorld;
varying vec2 vUv;

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
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s / 0.9375;
}
void main() {
  float n = fbm((vWorld + uOffset) / 70.0);
  float thr = 0.78 - 0.4 * uCoverage;
  float d = smoothstep(thr, thr + 0.24, n);
  // Fade out towards the decal edge so it never ends in a visible line.
  vec2 e = abs(vUv - 0.5) * 2.0;
  float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, e.y));
  float a = d * edge * uMaxDark * uSunlight;
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.02, 0.03, 0.07, a);
}
`;

export function createClouds(opts: CloudOptions): CloudField {
  const area = opts.area;
  const rng = createRng(opts.seed ?? 7);
  const margin = 160;
  const width = area.maxX - area.minX + margin * 2;
  const depth = area.maxZ - area.minZ + margin * 2;

  const group = new THREE.Group();
  group.name = 'clouds';

  const geometry = new THREE.PlaneGeometry(width, depth);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uOffset: { value: new THREE.Vector2(rng() * 500, rng() * 500) },
      uCoverage: { value: coverageForCount(opts.count ?? 10) },
      uSunlight: { value: 1 },
      uMaxDark: { value: CLOUD_MAX_DARKNESS },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  // The scene used to hide cloud meshes with `colorWrite = false` and force `castShadow = true`.
  // This decal must stay visible and must never enter a shadow map, whatever the caller does.
  Object.defineProperty(material, 'colorWrite', { get: () => true, set: () => undefined });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cloud-shadows';
  mesh.position.set((area.minX + area.maxX) / 2, CLOUD_DECAL_Y, (area.minZ + area.maxZ) / 2);
  mesh.renderOrder = 3;
  mesh.receiveShadow = false;
  Object.defineProperty(mesh, 'castShadow', { get: () => false, set: () => undefined });
  mesh.frustumCulled = false;
  group.add(mesh);

  const offset = material.uniforms.uOffset.value as THREE.Vector2;

  return {
    group,
    update(dt: number, wind: { x: number; z: number }): void {
      const step = Math.min(Math.max(dt, 0), 0.1);
      // The pattern is sampled at (world + offset), so it moves the opposite way to the offset.
      offset.x -= (wind.x * CLOUD_WIND_FACTOR + CLOUD_BASE_DRIFT) * step;
      offset.y -= wind.z * CLOUD_WIND_FACTOR * step;
    },
    setCoverage(coverage: number): void {
      material.uniforms.uCoverage.value = Math.min(1, Math.max(0, coverage));
    },
    setSunlight(strength: number): void {
      material.uniforms.uSunlight.value = Math.min(1, Math.max(0, strength));
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}
