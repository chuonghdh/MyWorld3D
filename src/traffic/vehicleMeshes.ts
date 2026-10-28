// Instanced meshes for vehicles: nine models (six passenger cars and vans, bus, truck, scooter), one
// InstancedMesh each, plus static parked cars and one additive headlight-glow mesh. 10 draw calls.
// Local frame: origin on the ground, +Z is the direction of travel, +X is the driver's left.
//
// Shader features (one shared material, no per-wheel CPU work):
//  - wheels spin from the per-instance odometer (aMotion.x) around their own axis,
//  - head, tail, brake and indicator lamps and the bus interior are emissive, driven by `night`,
//    the per-instance brake flag (aMotion.y), the per-instance lit flag (aMotion.z, 0 for parked cars)
//    and the indicator side (aMotion.w),
//  - glass and trim keep fixed colours while paint parts take the per-instance colour.

import * as THREE from 'three';
import type { VehicleClass } from '../audio';
import type { CityLayout } from '../city/layout';
import type { VehicleRender } from './vehicles';
import type { VisualContext } from './meshKit';
import { VARIANTS } from './vehicles/models';
import { VARIANT_COUNT } from './vehicles/variants';
import { computeParkingSpots, type ParkingSpot } from './parking';

export interface VehicleMeshes {
  group: THREE.Group;
  /** Class to its first model (hatchback, bus, truck, scooter). Kept for older callers. */
  vehicles: Record<VehicleClass, THREE.InstancedMesh>;
  /** One InstancedMesh per variant, indexed by VehicleRender.variant. */
  variants: THREE.InstancedMesh[];
  /** Additive soft headlight pools on the road ahead of moving cars (night only). */
  glow: THREE.InstancedMesh;
  /** Shared shader uniforms: night 0/1 and time in seconds. */
  uniforms: { night: { value: number }; time: { value: number } };
  /** Parked cars written at creation (empty without a layout). */
  parked: readonly ParkingSpot[];
  /** Night look on or off (headlights, tail lights, interior, ground glow). */
  setNight(on: boolean): void;
  /** Optional: world position of the camera focus. Headlight glow is only drawn within 110 m of it. */
  setFocus(x: number, z: number): void;
  update(vehicles: readonly VehicleRender[], ctx: VisualContext): void;
  dispose(): void;
}

const GLOW_CAP = 200;
const GLOW_RANGE = 110;

// ---- shader patch ----------------------------------------------------------------------------

const VERT_PARS = /* glsl */ `
attribute vec4 aPart;
attribute vec4 aMotion;
uniform float uNight;
uniform float uTime;
varying vec3 vEmit;
`;

const NORMAL_SPIN = /* glsl */ `
vec3 objectNormal = vec3( normal );
if (aPart.x > 0.5 && aPart.x < 1.5) {
  float wa = aMotion.x / max(aPart.z, 0.05);
  float wc = cos(wa);
  float ws = sin(wa);
  objectNormal = vec3(objectNormal.x, objectNormal.y * wc - objectNormal.z * ws, objectNormal.y * ws + objectNormal.z * wc);
}
#ifdef USE_TANGENT
  vec3 objectTangent = vec3( tangent.xyz );
#endif
`;

const POSITION_SPIN = /* glsl */ `
vec3 transformed = vec3( position );
if (aPart.x > 0.5 && aPart.x < 1.5) {
  float wa = aMotion.x / max(aPart.z, 0.05);
  float wc = cos(wa);
  float ws = sin(wa);
  vec2 wd = vec2(position.y - aPart.z, position.z - aPart.w);
  transformed.y = aPart.z + wd.x * wc - wd.y * ws;
  transformed.z = aPart.w + wd.x * ws + wd.y * wc;
}
`;

const COLOR_EMIT = /* glsl */ `
vec3 paintC = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  paintC = mix(vec3(1.0), instanceColor, aPart.y);
#endif
vColor = color * paintC;
vEmit = vec3(0.0);
float pk = aPart.x;
if (pk > 1.5) {
  float lit = aMotion.z;
  float brake = aMotion.y;
  if (pk < 2.5) {
    vEmit = vec3(1.0, 0.93, 0.7) * (0.05 + uNight * 2.4) * lit;
  } else if (pk < 3.5) {
    vEmit = vec3(1.0, 0.07, 0.04) * (lit * (0.1 + uNight * 0.5) + brake * 1.9);
  } else if (pk < 4.5) {
    vEmit = vec3(1.0, 0.07, 0.04) * (brake * 2.0);
  } else if (pk < 5.5) {
    float side = position.x > 0.0 ? 1.0 : -1.0;
    float on = step(0.5, aMotion.w * side) * step(fract(uTime * 1.5), 0.5);
    vEmit = vec3(1.0, 0.55, 0.05) * on * 2.2;
  } else if (pk < 6.5) {
    vEmit = vec3(1.0, 0.82, 0.5) * uNight * 0.3 * lit;
  } else if (pk > 7.5) {
    vEmit = vec3(1.0, 0.72, 0.15) * (0.3 + uNight * 0.9);
  }
}
`;

function patchMaterial(material: THREE.MeshLambertMaterial, uniforms: VehicleMeshes['uniforms']): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = uniforms.night;
    shader.uniforms.uTime = uniforms.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', NORMAL_SPIN)
      .replace('#include <begin_vertex>', POSITION_SPIN)
      .replace('#include <color_vertex>', COLOR_EMIT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit;');
  };
  material.customProgramCacheKey = () => 'vehicle-shader-v1';
}

// ---- helpers -----------------------------------------------------------------------------------

function paletteLinear(hex: string[]): Float32Array {
  const c = new THREE.Color();
  const out = new Float32Array(Math.max(1, hex.length) * 3).fill(1);
  hex.forEach((h, i) => {
    c.set(h);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  });
  return out;
}

function writeMatrix(arr: Float32Array, index: number, x: number, y: number, z: number, heading: number, pitch: number, roll: number): void {
  const cy = Math.cos(heading), sy = Math.sin(heading);
  const cx = Math.cos(pitch), sx = Math.sin(pitch);
  const cz = Math.cos(roll), sz = Math.sin(roll);
  const o = index * 16;
  arr[o] = cy * cz + sy * sx * sz;
  arr[o + 1] = cx * sz;
  arr[o + 2] = -sy * cz + cy * sx * sz;
  arr[o + 3] = 0;
  arr[o + 4] = -cy * sz + sy * sx * cz;
  arr[o + 5] = cx * cz;
  arr[o + 6] = sy * sz + cy * sx * cz;
  arr[o + 7] = 0;
  arr[o + 8] = sy * cx;
  arr[o + 9] = -sx;
  arr[o + 10] = cy * cx;
  arr[o + 11] = 0;
  arr[o + 12] = x;
  arr[o + 13] = y;
  arr[o + 14] = z;
  arr[o + 15] = 1;
}

function glowMaterial(night: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    uniforms: { uNight: night },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        vUv = vec2(position.x + 0.5, position.z);
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying vec2 vUv;
      varying vec3 vCol;
      void main() {
        float v = vUv.y;
        float half_w = mix(0.3, 1.0, v);
        float xn = abs(vUv.x * 2.0 - 1.0) / half_w;
        float a = pow(1.0 - v, 1.7) * (1.0 - smoothstep(0.35, 1.0, xn));
        a *= smoothstep(0.0, 0.06, v);
        gl_FragColor = vec4(vCol * a * 0.55 * uNight, 1.0);
      }
    `,
  });
}

// ---- factory -----------------------------------------------------------------------------------

export function createVehicleMeshes(capacity = 256, layout?: CityLayout): VehicleMeshes {
  const group = new THREE.Group();
  group.name = 'vehicles';
  const uniforms = { night: { value: 0 }, time: { value: 0 } };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  patchMaterial(material, uniforms);

  const parked: ParkingSpot[] = layout ? computeParkingSpots(layout) : [];
  const parkedCount = new Array<number>(VARIANT_COUNT).fill(0);
  for (const p of parked) parkedCount[p.variant]++;

  const palettes = VARIANTS.map((v) => paletteLinear(v.palette));
  const paletteSize = VARIANTS.map((v) => Math.max(1, v.palette.length));

  const variants: THREE.InstancedMesh[] = [];
  const motion: Float32Array[] = [];
  for (const info of VARIANTS) {
    const cap = parkedCount[info.id] + capacity;
    const geo = info.build();
    const motionAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    motionAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aMotion', motionAttr);
    const mesh = new THREE.InstancedMesh(geo, material, cap);
    mesh.name = `vehicles-${info.name}`;
    mesh.count = parkedCount[info.id];
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Allocate the colour buffer now so the shader compiles with instance colours.
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    variants.push(mesh);
    motion.push(motionAttr.array as Float32Array);
    group.add(mesh);
  }

  // Static parked cars occupy the first slots of each variant mesh.
  const parkedFill = new Array<number>(VARIANT_COUNT).fill(0);
  for (const p of parked) {
    const mesh = variants[p.variant];
    const i = parkedFill[p.variant]++;
    writeMatrix(mesh.instanceMatrix.array as Float32Array, i, p.x, 0, p.z, p.heading, 0, 0);
    const pal = palettes[p.variant];
    const k = Math.floor(p.tint * paletteSize[p.variant]) % paletteSize[p.variant];
    const col = mesh.instanceColor!.array as Float32Array;
    col[i * 3] = pal[k * 3];
    col[i * 3 + 1] = pal[k * 3 + 1];
    col[i * 3 + 2] = pal[k * 3 + 2];
  }

  // Headlight glow: a unit quad on the ground, z in [0,1] ahead of the instance origin, x in [-0.5,0.5].
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  glowGeo.rotateX(-Math.PI / 2);
  glowGeo.translate(0, 0, 0.5);
  const glow = new THREE.InstancedMesh(glowGeo, glowMaterial(uniforms.night), GLOW_CAP);
  glow.name = 'vehicle-glow';
  glow.count = 0;
  glow.frustumCulled = false;
  glow.renderOrder = 4;
  glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glow.setColorAt(0, new THREE.Color(1, 0.9, 0.65));
  glow.instanceColor!.setUsage(THREE.DynamicDrawUsage);
  group.add(glow);

  let night = false;
  let focusX = 0;
  let focusZ = 0;
  let hasFocus = false;
  const fill = new Array<number>(VARIANT_COUNT).fill(0);

  const classMesh: Record<VehicleClass, THREE.InstancedMesh> = {
    car: variants[0],
    bus: variants[6],
    truck: variants[7],
    motorbike: variants[8],
  };

  return {
    group,
    vehicles: classMesh,
    variants,
    glow,
    uniforms,
    parked,
    setNight(on) {
      night = on;
      uniforms.night.value = on ? 1 : 0;
      glow.visible = on;
    },
    setFocus(x, z) {
      focusX = x;
      focusZ = z;
      hasFocus = true;
    },
    update(list, ctx) {
      const t = ctx.time;
      uniforms.time.value = t;
      for (let i = 0; i < VARIANT_COUNT; i++) fill[i] = parkedCount[i];

      let gn = 0;
      const gm = glow.instanceMatrix.array as Float32Array;
      const gc = glow.instanceColor!.array as Float32Array;

      for (let li = 0; li < list.length; li++) {
        const v = list[li];
        const vi = v.variant;
        const mesh = variants[vi];
        const i = fill[vi];
        if (i >= mesh.instanceMatrix.count) continue;
        fill[vi] = i + 1;

        const moving = Math.min(1, v.speed / 5);
        const ph = v.id * 1.7;
        const bob = Math.sin(t * 9 + ph) * 0.006 * moving + Math.sin(t * 5.3 + ph * 0.6) * 0.004 * moving;
        let pitch = -v.accel * 0.006;
        if (pitch > 0.04) pitch = 0.04;
        else if (pitch < -0.03) pitch = -0.03;
        pitch += Math.sin(t * 7 + ph) * 0.002 * moving;
        const lean = v.cls === 'motorbike' ? 0.22 : 0.05;
        let roll = v.yawRate * lean * Math.min(1, v.speed / 6);
        let x = v.position.x;
        let z = v.position.z;
        if (v.cls === 'motorbike') {
          // Weave inside the lane: visual only.
          const wv = Math.sin(t * 0.8 + ph * 1.3);
          const off = wv * 0.3 * moving;
          x += Math.cos(v.heading) * off;
          z -= Math.sin(v.heading) * off;
          roll += Math.cos(t * 0.8 + ph * 1.3) * 0.08 * moving;
        }
        writeMatrix(mesh.instanceMatrix.array as Float32Array, i, x, bob, z, v.heading, pitch, roll);

        const pal = palettes[vi];
        const k = Math.floor(v.tint * paletteSize[vi]) % paletteSize[vi];
        const col = mesh.instanceColor!.array as Float32Array;
        col[i * 3] = pal[k * 3];
        col[i * 3 + 1] = pal[k * 3 + 1];
        col[i * 3 + 2] = pal[k * 3 + 2];

        const m = motion[vi];
        m[i * 4] = v.wheelPhase;
        m[i * 4 + 1] = v.braking ? 1 : 0;
        m[i * 4 + 2] = 1;
        m[i * 4 + 3] = v.indicator;

        if (night && gn < GLOW_CAP - 1 && (!hasFocus || Math.abs(v.position.x - focusX) + Math.abs(v.position.z - focusZ) < GLOW_RANGE)) {
          const big = v.cls === 'bus' || v.cls === 'truck';
          const bike = v.cls === 'motorbike';
          const width = bike ? 2.6 : big ? 6.5 : 5.6;
          const len = bike ? 7 : big ? 13 : 11;
          const nose = bike ? 0.9 : big ? 5 : 2.0;
          const sy = Math.sin(v.heading);
          const cy = Math.cos(v.heading);
          const o = gn * 16;
          // Scale (width, 1, len) then rotate by heading, translate to the nose.
          gm[o] = cy * width; gm[o + 1] = 0; gm[o + 2] = -sy * width; gm[o + 3] = 0;
          gm[o + 4] = 0; gm[o + 5] = 1; gm[o + 6] = 0; gm[o + 7] = 0;
          gm[o + 8] = sy * len; gm[o + 9] = 0; gm[o + 10] = cy * len; gm[o + 11] = 0;
          gm[o + 12] = x + sy * nose; gm[o + 13] = 0.045; gm[o + 14] = z + cy * nose; gm[o + 15] = 1;
          gc[gn * 3] = 1; gc[gn * 3 + 1] = 0.9; gc[gn * 3 + 2] = 0.62;
          gn++;
          if (v.braking && gn < GLOW_CAP) {
            // Small red pool behind a braking vehicle: the light points backwards.
            const rl = 3.2;
            const rw = 3.4;
            const back = bike ? -0.9 : big ? -5.6 : -2.2;
            const o2 = gn * 16;
            gm[o2] = -cy * rw; gm[o2 + 1] = 0; gm[o2 + 2] = sy * rw; gm[o2 + 3] = 0;
            gm[o2 + 4] = 0; gm[o2 + 5] = 1; gm[o2 + 6] = 0; gm[o2 + 7] = 0;
            gm[o2 + 8] = -sy * rl; gm[o2 + 9] = 0; gm[o2 + 10] = -cy * rl; gm[o2 + 11] = 0;
            gm[o2 + 12] = x + sy * back; gm[o2 + 13] = 0.045; gm[o2 + 14] = z + cy * back; gm[o2 + 15] = 1;
            gc[gn * 3] = 0.75; gc[gn * 3 + 1] = 0.05; gc[gn * 3 + 2] = 0.03;
            gn++;
          }
        }
      }

      for (let i = 0; i < VARIANT_COUNT; i++) {
        const mesh = variants[i];
        mesh.count = fill[i];
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor!.needsUpdate = true;
        (mesh.geometry.getAttribute('aMotion') as THREE.InstancedBufferAttribute).needsUpdate = true;
      }
      glow.count = gn;
      glow.instanceMatrix.needsUpdate = true;
      glow.instanceColor!.needsUpdate = true;
    },
    dispose() {
      for (const m of variants) m.geometry.dispose();
      glowGeo.dispose();
      (glow.material as THREE.Material).dispose();
      material.dispose();
    },
  };
}
