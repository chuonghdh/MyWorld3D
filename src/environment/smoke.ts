// Chimney smoke: soft camera-facing puffs released intermittently from a subset of chimneys.
// One InstancedMesh (one draw call). Billboarding happens in the vertex shader from the
// view matrix, so there is no per-frame CPU orientation work. Typed arrays, no per-frame allocation.

import * as THREE from 'three';
import { createRng } from '../core/rng';
import type { Season } from '../core/types';

export interface SmokeEmitter {
  x: number;
  y: number;
  z: number;
}

export interface SmokeContext {
  season: Season;
  /** Hour of day, 0-24. */
  timeOfDay: number;
  lightsOn: boolean;
  sunColor: { r: number; g: number; b: number };
  ambient: number;
}

export interface SmokeSystem {
  readonly mesh: THREE.Object3D;
  setEmitters(emitters: readonly SmokeEmitter[], seed?: number): void;
  update(dt: number, wind: { x: number; z: number }, ctx: SmokeContext): void;
  readonly activeCount: number;
  readonly emitterCount: number;
  dispose(): void;
}

const WIND_FACTOR = 0.6;
const R0 = 0.35;
const R1 = 2.2;
const PEAK_OPACITY = 0.5;
const MAX_STEP = 0.1;

const SEASON_BASE: Record<Season, number> = { winter: 0.72, autumn: 0.7, spring: 0.35, summer: 0.1 };

const VERT = /* glsl */ `
attribute vec4 aPos;   // xyz = centre, w = radius
attribute vec2 aMisc;  // x = rotation, y = opacity
varying vec2 vUv;
varying float vAlpha;
varying float vRot;
void main() {
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float c = cos(aMisc.x);
  float s = sin(aMisc.x);
  vec2 q = position.xy;
  vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vec3 world = aPos.xyz + (right * r.x + up * r.y) * aPos.w;
  vUv = position.xy * 2.0;
  vAlpha = aMisc.y;
  vRot = aMisc.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vRot;
void main() {
  float d = length(vUv);
  if (d >= 1.0) discard;
  float lobes = 1.0 + 0.18 * sin(3.0 * atan(vUv.y, vUv.x) + vRot * 2.0);
  float a = smoothstep(1.0, 0.0, d * lobes);
  float alpha = a * vAlpha * uOpacity;
  gl_FragColor = vec4(uColor, alpha);
}
`;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Circular gaussian bump around `centre` hour. */
function hourBump(h: number, centre: number, width: number): number {
  let d = Math.abs(h - centre) % 24;
  if (d > 12) d = 24 - d;
  return Math.exp(-(d * d) / (2 * width * width));
}

/** Fraction of emitters eligible to smoke for a context, 0-1. Smooth in timeOfDay. */
export function smokeEligibility(ctx: SmokeContext): number {
  const h = ((ctx.timeOfDay % 24) + 24) % 24;
  const night = Math.max(hourBump(h, 22, 3.5), hourBump(h, 2, 3.5));
  let f = 0.5 + 0.9 * hourBump(h, 19, 2.2) + 0.6 * hourBump(h, 7, 1.8) + 0.5 * night;
  if (ctx.lightsOn) f += 0.25;
  return Math.min(1, Math.max(0, SEASON_BASE[ctx.season] * f));
}

export function createSmoke(opts: { maxParticles?: number; maxEmitters?: number } = {}): SmokeSystem {
  const maxParticles = Math.max(1, Math.floor(opts.maxParticles ?? 1500));
  const maxEmitters = Math.max(0, Math.floor(opts.maxEmitters ?? 160));

  // Particle state.
  const px = new Float32Array(maxParticles);
  const py = new Float32Array(maxParticles);
  const pz = new Float32Array(maxParticles);
  const vx = new Float32Array(maxParticles);
  const vy = new Float32Array(maxParticles);
  const vz = new Float32Array(maxParticles);
  const age = new Float32Array(maxParticles);
  const life = new Float32Array(maxParticles); // 0 = dead
  const rot = new Float32Array(maxParticles);
  const spin = new Float32Array(maxParticles);
  const phase = new Float32Array(maxParticles);
  const grow = new Float32Array(maxParticles); // per-puff size multiplier
  let next = 0; // ring cursor, overwrites the oldest when full
  let highWater = 0;
  let active = 0;

  // Emitter state (struct of arrays).
  const ex = new Float32Array(maxEmitters);
  const ey = new Float32Array(maxEmitters);
  const ez = new Float32Array(maxEmitters);
  const thr = new Float32Array(maxEmitters); // eligibility threshold 0-1
  const onLen = new Float32Array(maxEmitters);
  const offLen = new Float32Array(maxEmitters);
  const cyc = new Float32Array(maxEmitters); // time inside the cycle
  const puffTimer = new Float32Array(maxEmitters);
  const puffGap = new Float32Array(maxEmitters);
  let emitterCount = 0;

  let rng = createRng(1);
  let time = 0;

  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(maxParticles * 4), 4);
  const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(maxParticles * 2), 2);
  aPos.setUsage(THREE.DynamicDrawUsage);
  aMisc.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute('aPos', aPos);
  geometry.setAttribute('aMisc', aMisc);

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(0.9, 0.9, 0.92) },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, maxParticles);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.renderOrder = 5;

  function spawn(e: number): void {
    const i = next;
    next = (next + 1) % maxParticles;
    if (life[i] > 0) active--;
    if (next > highWater) highWater = next;
    if (i >= highWater) highWater = i + 1;
    px[i] = ex[e] + (rng() - 0.5) * 0.12;
    py[i] = ey[e];
    pz[i] = ez[e] + (rng() - 0.5) * 0.12;
    vx[i] = 0;
    vz[i] = 0;
    vy[i] = 0.8 + rng() * 0.6;
    age[i] = 0;
    life[i] = 7 + rng() * 4;
    rot[i] = rng() * Math.PI * 2;
    spin[i] = (rng() - 0.5) * 0.3;
    phase[i] = rng() * Math.PI * 2;
    grow[i] = 0.8 + rng() * 0.4;
    active++;
  }

  function clearParticles(): void {
    life.fill(0);
    next = 0;
    highWater = 0;
    active = 0;
    mesh.count = 0;
  }

  const system: SmokeSystem = {
    mesh,
    get activeCount() {
      return active;
    },
    get emitterCount() {
      return emitterCount;
    },

    setEmitters(emitters, seed = 1) {
      clearParticles();
      rng = createRng(seed * 7919 + 17);
      const n = emitters.length;
      const order = new Array<number>(n);
      for (let i = 0; i < n; i++) order[i] = i;
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
      }
      emitterCount = Math.min(n, maxEmitters);
      for (let k = 0; k < emitterCount; k++) {
        const src = emitters[order[k]];
        ex[k] = src.x;
        ey[k] = src.y;
        ez[k] = src.z;
        thr[k] = rng();
        onLen[k] = 20 + rng() * 40;
        offLen[k] = 30 + rng() * 90;
        cyc[k] = rng() * (onLen[k] + offLen[k]);
        puffGap[k] = 0.35 + rng() * 0.45;
        puffTimer[k] = rng() * puffGap[k];
      }
    },

    update(dt, wind, ctx) {
      const step = Math.min(Math.max(Number.isFinite(dt) ? dt : 0, 0), MAX_STEP);
      if (step <= 0) return;
      time += step;

      // Emission.
      if (emitterCount > 0) {
        const eligible = smokeEligibility(ctx);
        for (let e = 0; e < emitterCount; e++) {
          cyc[e] += step;
          const total = onLen[e] + offLen[e];
          if (cyc[e] >= total) cyc[e] -= total;
          if (cyc[e] >= onLen[e] || thr[e] >= eligible) continue;
          puffTimer[e] -= step;
          if (puffTimer[e] <= 0) {
            spawn(e);
            puffGap[e] = 0.35 + rng() * 0.45;
            puffTimer[e] += puffGap[e];
          }
        }
      }

      // Particles.
      const wx = wind.x * WIND_FACTOR;
      const wz = wind.z * WIND_FACTOR;
      const kWind = Math.min(1, 0.45 * step);
      const damp = Math.exp(-0.22 * step);
      const posArr = aPos.array as Float32Array;
      const miscArr = aMisc.array as Float32Array;
      const windSpeed = Math.hypot(wind.x, wind.z);
      const turb = 0.12 + 0.05 * Math.min(windSpeed, 6);
      const night = Math.min(1, Math.max(0, (0.65 - ctx.ambient) / 0.5));
      const opacityScale = 1 - 0.4 * night;

      for (let i = 0; i < highWater; i++) {
        const o = i * 4;
        if (life[i] <= 0) {
          posArr[o + 3] = 0;
          miscArr[i * 2 + 1] = 0;
          continue;
        }
        age[i] += step;
        if (age[i] >= life[i]) {
          life[i] = 0;
          active--;
          posArr[o + 3] = 0;
          miscArr[i * 2 + 1] = 0;
          continue;
        }
        const u = age[i] / life[i];
        vx[i] += (wx - vx[i]) * kWind;
        vz[i] += (wz - vz[i]) * kWind;
        vy[i] *= damp;
        const t = time * 0.7 + phase[i];
        px[i] += (vx[i] + Math.sin(t * 1.3) * turb) * step;
        pz[i] += (vz[i] + Math.cos(t * 1.1) * turb) * step;
        py[i] += vy[i] * step;
        rot[i] += spin[i] * step;

        const radius = (R0 + (R1 - R0) * Math.pow(u, 0.65)) * grow[i];
        const fadeIn = smoothstep(0, 0.07, u);
        const fadeOut = Math.pow(1 - u, 1.6);
        posArr[o] = px[i];
        posArr[o + 1] = py[i];
        posArr[o + 2] = pz[i];
        posArr[o + 3] = radius;
        miscArr[i * 2] = rot[i];
        miscArr[i * 2 + 1] = PEAK_OPACITY * fadeIn * fadeOut * opacityScale;
      }

      mesh.count = highWater;
      aPos.needsUpdate = true;
      aMisc.needsUpdate = true;

      // Colour: pale grey-white warmed by the sun, blue-grey and dimmer at night.
      const ambientLum = 0.55 + 0.45 * Math.min(1, Math.max(0, ctx.ambient / 0.65));
      const sr = 0.6 + 0.4 * ctx.sunColor.r;
      const sg = 0.6 + 0.4 * ctx.sunColor.g;
      const sb = 0.6 + 0.4 * ctx.sunColor.b;
      const dr = 0.9 * sr * ambientLum;
      const dg = 0.9 * sg * ambientLum;
      const db = 0.92 * sb * ambientLum;
      const col = (material.uniforms.uColor.value as THREE.Color);
      col.setRGB(dr + (0.3 - dr) * night, dg + (0.34 - dg) * night, db + (0.44 - db) * night);
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
  return system;
}
