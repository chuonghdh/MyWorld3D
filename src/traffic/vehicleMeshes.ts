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
import { patchMaterial } from './vehicleShader';
import { glowMaterial } from './vehicleGlow';

export interface VehicleMeshes {
  group: THREE.Group;
  /** Class to its first model (hatchback, bus, truck, scooter). Kept for older callers. */
  vehicles: Record<VehicleClass, THREE.InstancedMesh>;
  /** One InstancedMesh per variant, indexed by VehicleRender.variant. */
  variants: THREE.InstancedMesh[];
  /** Additive soft headlight pools on the road ahead of moving cars (night only). */
  glow: THREE.InstancedMesh;
  /** Shared shader uniforms: night 0/1, time in seconds, snow cover 0..1 (set by setSnow). */
  uniforms: { night: { value: number }; time: { value: number }; snow: { value: number } };
  /** Parked cars written at creation (empty without a layout). */
  parked: readonly ParkingSpot[];
  /** Night look on or off (tail lights, interior, ground glow). */
  setNight(on: boolean): void;
  /** Headlight level 0..1 (dusk to full night). Each car has its own seeded threshold, so cars switch on one by one. */
  setHeadlights(level: number): void;
  /** Snow cover 0..1 (eased weather value). Drives roof snow and windscreen frost. */
  setSnow(level: number): void;
  /** Kept for callers; the headlight glow no longer depends on the camera focus (it is always drawn). */
  setFocus(x: number, z: number): void;
  update(vehicles: readonly VehicleRender[], ctx: VisualContext): void;
  dispose(): void;
}

/** One headlight pool plus one brake pool per vehicle, for every vehicle the system can hold. */
const GLOW_CAP = 640;

/** Seeded per-car threshold in [0, 1): a car has its headlights on while the headlight level is above it. */
function headlightThreshold(id: number): number {
  return (Math.imul(id, 0x9e3779b1) >>> 0) / 4294967296;
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


// ---- factory -----------------------------------------------------------------------------------

export function createVehicleMeshes(capacity = 256, layout?: CityLayout): VehicleMeshes {
  const group = new THREE.Group();
  group.name = 'vehicles';
  const uniforms = { night: { value: 0 }, time: { value: 0 }, snow: { value: 0 } };
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
  // The instance matrix lifts it to 0.045 m, just above the asphalt top (0.04 m).
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
  let headlights = 0;
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
    setHeadlights(level) {
      headlights = level;
    },
    setSnow(level) {
      uniforms.snow.value = Math.min(1, Math.max(0, level));
    },
    setFocus() {
      // Intentionally empty: glow is drawn for every vehicle so it never pops at a distance.
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
        const lit = headlights > headlightThreshold(v.id) ? 1 : 0;
        m[i * 4 + 2] = lit;
        m[i * 4 + 3] = v.indicator;

        if (night && gn < GLOW_CAP - 1) {
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
          gn += lit;
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
