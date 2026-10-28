// Cloud shadows on everything: ground, streets, roofs, walls, trees.
// The cloud layout is rasterised into ONE small mask texture (R8, repeating, in cloud space), and the
// shared surface materials sample it once per fragment to darken only the DIRECT sun light.
// Each fragment looks up the cloud that stands between it and the sun: the lookup point is shifted
// towards the sun by (cloudHeight - fragmentHeight) / tan(sunElevation), so a roof at 25 m gets the
// shadow of the cloud above it with correct parallax and not a ground-projected copy.
// No extra draw call, no per-frame allocation: the texture is rebuilt only when the cloud amount
// changes noticeably, and the drift is a uniform.

import * as THREE from 'three';
import { CLOUD_BASE_MAX, CLOUD_BASE_MIN, cloudScales, cloudShadowSun, cumulusVisibility, type CloudLayout } from './cloudSprites';

/** Mask resolution (texels per side). 256 over an 800 m domain is ~3 m per texel, plenty for 40 m blobs. */
export const CLOUD_MASK_SIZE = 256;
/** Share of the direct sun light removed in the middle of a cloud shadow (a deep, clearly visible shadow; ambient light still fills it in). */
export const CLOUD_DIRECT_DARKNESS = 0.95;
/** Height (m) of the cloud body that casts the shadow, before the weather scales the altitude. */
export const CLOUD_CASTER_HEIGHT = (CLOUD_BASE_MIN + CLOUD_BASE_MAX) / 2 + 10;
/** The cloud amount must move by this much before the mask is rebuilt. */
export const CLOUD_MASK_REBUILD_STEP = 0.025;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Soft blobs of every visible puff, in cloud space (the texture is periodic over the domain).
 * `out` holds size*size bytes, 0 = open sky, 255 = full shadow. Pure and deterministic.
 */
export function rasterizeCloudMask(layout: CloudLayout, coverage: number, size: number, out: Uint8Array): void {
  out.fill(0);
  const sc = cloudScales(coverage).size;
  const D = layout.domain;
  const texel = D / size;
  for (let i = 0; i < layout.count; i++) {
    const vis = cumulusVisibility(layout.info[i * 4 + 3], coverage);
    if (vis < 0.02) continue;
    const cx = layout.center[i * 3] * D + layout.offset[i * 3] * sc;
    const cz = layout.center[i * 3 + 2] * D + layout.offset[i * 3 + 2] * sc;
    const r = layout.info[i * 4] * sc * 1.1;
    const x0 = Math.floor((cx - r) / texel);
    const x1 = Math.ceil((cx + r) / texel);
    const z0 = Math.floor((cz - r) / texel);
    const z1 = Math.ceil((cz + r) / texel);
    for (let tz = z0; tz <= z1; tz++) {
      const dz = (tz + 0.5) * texel - cz;
      const row = (((tz % size) + size) % size) * size;
      for (let tx = x0; tx <= x1; tx++) {
        const dx = (tx + 0.5) * texel - cx;
        const d = Math.hypot(dx, dz) / r;
        if (d >= 1) continue;
        const v = Math.round((1 - smoothstep(0.55, 1, d)) * vis * 255);
        const idx = row + (((tx % size) + size) % size);
        if (v > out[idx]) out[idx] = v;
      }
    }
  }
}

/** Mask value (0..1) at a cloud-space position in metres, bilinear like the GPU. Used by tests. */
export function sampleCloudMask(mask: Uint8Array, size: number, domain: number, x: number, z: number): number {
  const fx = (x / domain) * size - 0.5;
  const fz = (z / domain) * size - 0.5;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const ax = fx - ix;
  const az = fz - iz;
  const at = (a: number, b: number): number => mask[(((b % size) + size) % size) * size + (((a % size) + size) % size)] / 255;
  return (
    (at(ix, iz) * (1 - ax) + at(ix + 1, iz) * ax) * (1 - az) + (at(ix, iz + 1) * (1 - ax) + at(ix + 1, iz + 1) * ax) * az
  );
}

/**
 * Where a fragment at (x, y, z) looks for its shadow-casting cloud: toward the sun, by
 * (casterHeight - y) / tan(elevation) horizontally. `parallax` is sunDir.xz / max(sunDir.y, 0.15).
 * Mirrors the fragment shader.
 */
export function cloudLookup(
  p: { x: number; y: number; z: number },
  parallax: { x: number; z: number },
  casterHeight: number,
  out: { x: number; z: number },
): { x: number; z: number } {
  const h = Math.max(0, casterHeight - p.y);
  out.x = p.x + parallax.x * h;
  out.z = p.z + parallax.z * h;
  return out;
}

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
  uCsH: { value: CLOUD_CASTER_HEIGHT },
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

export interface CloudShade {
  setCoverage(coverage: number): void;
  setSunlight(strength: number): void;
  setLighting(sunDir: { x: number; y: number; z: number }): void;
  /** Copies the field's drift into the shared uniform. Call every frame after the field moved. */
  syncDrift(): void;
  /** Rebuilds the mask now (tests). */
  rebuild(): void;
  readonly mask: Uint8Array;
  readonly texture: THREE.DataTexture;
  dispose(): void;
}

/** Drives the shared uniforms for one cloud field. `drift` is the field's own vector, shared by reference. */
export function createCloudShade(
  layout: CloudLayout,
  origin: { x: number; z: number },
  drift: THREE.Vector2,
  initialCoverage: number,
): CloudShade {
  const size = CLOUD_MASK_SIZE;
  const mask = new Uint8Array(size * size);
  const texture = new THREE.DataTexture(mask, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const u = cloudShadeUniforms;
  u.uCsMask.value = texture;
  u.uCsOrigin.value.set(origin.x, origin.z);
  u.uCsDomain.value = layout.domain;
  u.uCsDrift.value.copy(drift);

  let built = -10;
  let coverage = initialCoverage;
  let sunlight = 1;
  let sunY = 1;
  const rebuild = (): void => {
    rasterizeCloudMask(layout, coverage, size, mask);
    texture.needsUpdate = true;
    built = coverage;
  };
  const apply = (): void => {
    // No distinct shadows under a solid overcast: they fade out as the sky closes.
    const overcast = 1 - 0.9 * smoothstep(0.55, 1, coverage);
    u.uCsK.value = CLOUD_DIRECT_DARKNESS * cloudShadowSun(sunY, sunlight) * overcast;
    u.uCsH.value = CLOUD_CASTER_HEIGHT * cloudScales(coverage).alt;
  };
  rebuild();
  apply();

  return {
    mask,
    texture,
    rebuild,
    syncDrift() {
      u.uCsDrift.value.copy(drift);
    },
    setCoverage(c) {
      coverage = Math.min(1, Math.max(0, c));
      if (Math.abs(coverage - built) >= CLOUD_MASK_REBUILD_STEP) rebuild();
      apply();
    },
    setSunlight(s) {
      sunlight = Math.min(1, Math.max(0, s));
      apply();
    },
    setLighting(sunDir) {
      const len = Math.hypot(sunDir.x, sunDir.y, sunDir.z) || 1;
      sunY = sunDir.y / len;
      const k = 1 / Math.max(sunY, 0.15);
      u.uCsPar.value.set((sunDir.x / len) * k, (sunDir.z / len) * k);
      apply();
    },
    dispose() {
      if (u.uCsMask.value === texture) {
        u.uCsMask.value = null;
        u.uCsK.value = 0;
      }
      texture.dispose();
    },
  };
}
