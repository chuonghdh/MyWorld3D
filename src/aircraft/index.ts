// Airliners crossing the sky high above the clouds, each trailing a long soft contrail.
// Draw calls: 1 instanced aircraft mesh + 1 contrail ribbon. Flights come from schedule.ts, a pure
// function of simulated time, so a paused clock spawns nothing and a time jump stays consistent.

import * as THREE from 'three';
import { createPlaneGeometry } from './planeMesh';
import { liveryFor } from './livery';
import {
  CONTRAIL_LIFE,
  SAMPLE_STEP,
  contrailDayFactor,
  contrailStrength,
  contrailTint,
  createContrailRibbon,
} from './contrail';
import { SLOTS, flightActive, flightPose, flightsForDay, introFlight, newPose, type Flight } from './schedule';
import type { AudioAircraft } from '../audio/frame';
import { DAY_SECONDS } from '../store/model';

export * from './schedule';
export * from './contrail';
export { PLANE_LENGTH, PLANE_SCALE } from './planeMesh';
export * from './livery';

/** Distance to the camera (m) under which an aircraft shrinks away, so it never meets the near plane. */
const NEAR_HIDE = 45;
const NEAR_SHOW = 110;
/** The contrail starts this far behind the aircraft (at the engines' exhaust), in metres. */
const TRAIL_OFFSET = 10;
/** Largest number of trail samples written in one frame (a time jump never stalls). */
const MAX_SAMPLES_PER_FRAME = 40;

export interface AircraftEnv {
  camera: { x: number; y: number; z: number };
  /** Unit vector towards the sun (or the moon at night). */
  sunDir: { x: number; y: number; z: number };
  sunColor: { r: number; g: number; b: number };
  sunIntensity: number;
  ambient: number;
  /** Lights are on (night): nav lights blink, the hull is dark. */
  night: boolean;
  weather: { cloudiness: number; rain: number; snowfall: number; fogDensityMul: number };
  /** Wind velocity on the ground plane (m/s); old contrails drift with it. */
  wind?: { x: number; z: number };
}

export interface AircraftSystem {
  readonly group: THREE.Group;
  /** Advances to simulated time `t`. With dt <= 0 (paused) nothing moves and nothing spawns. */
  update(t: number, dt: number, env: AircraftEnv): void;
  /** Number of aircraft currently in the air. */
  activeCount(): number;
  /** Aircraft in the air as sound sources (position and velocity); a pooled array, valid until the next update. */
  audioSources(): readonly AudioAircraft[];
  dispose(): void;
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aLight;
attribute float aPart;
attribute vec3 iFin;
attribute vec3 iEngine;
attribute vec3 iBelly;
varying vec3 vColor;
varying float vLight;
varying vec3 vNormal;
#include <fog_pars_vertex>
void main() {
  vColor = aColor;
  // Per-aircraft livery: tail fin and engines take the instance colours; the lower fuselage takes the belly colour.
  if (aPart > 2.5) vColor = iFin;
  else if (aPart > 1.5) vColor = iEngine;
  else if (aPart < 0.5) vColor = mix(aColor, iBelly, 1.0 - smoothstep(-0.62, -0.42, position.y));
  vLight = aLight;
  vNormal = mat3(instanceMatrix) * normal;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform float uSunK;
uniform float uNight;
uniform float uTime;
varying vec3 vColor;
varying float vLight;
varying vec3 vNormal;
#include <fog_pars_fragment>
void main() {
  vec3 col;
  if (vLight > 0.5) {
    // Red beacon blinks once a second; the white strobe double-flashes every 1.4 s.
    float red = step(fract(uTime * 1.0), 0.18);
    float ph = fract(uTime / 1.4);
    float white = step(ph, 0.06) + step(0.16, ph) * step(ph, 0.22);
    float on = vLight < 1.5 ? red : white;
    vec3 lamp = vLight < 1.5 ? vec3(1.0, 0.1, 0.08) : vec3(1.0, 0.97, 0.9);
    col = mix(vColor * 0.2, lamp * 3.0, on * uNight) ;
    col = mix(col, lamp, (1.0 - uNight) * 0.6);
  } else {
    vec3 n = normalize(vNormal);
    float wrap = dot(n, uSunDir) * 0.5 + 0.5;
    // Flat-ish: the sun only adds a gentle gradient on top of the ambient light.
    col = vColor * (uAmbient + uSunColor * uSunK * (0.35 + 0.65 * wrap));
    col = clamp(col, vec3(0.0), vec3(1.2));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

export function createAircraft(opts: { seed: number; centerX?: number; centerZ?: number }): AircraftSystem {
  const cx = opts.centerX ?? 0;
  const cz = opts.centerZ ?? 0;
  const seed = opts.seed;

  const geometry = createPlaneGeometry();
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uAmbient: { value: new THREE.Color(0.5, 0.5, 0.55) },
      uSunK: { value: 1 },
      uNight: { value: 0 },
      uTime: { value: 0 },
    },
  ]);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, fog: true });
  // Per-slot livery colours (instance attributes): tail fin, engines, belly stripe.
  const finArr = new Float32Array(SLOTS * 3).fill(0.93);
  const engArr = new Float32Array(SLOTS * 3).fill(0.6);
  const bellyArr = new Float32Array(SLOTS * 3).fill(0.93);
  const finAttr = new THREE.InstancedBufferAttribute(finArr, 3);
  const engAttr = new THREE.InstancedBufferAttribute(engArr, 3);
  const bellyAttr = new THREE.InstancedBufferAttribute(bellyArr, 3);
  geometry.setAttribute('iFin', finAttr);
  geometry.setAttribute('iEngine', engAttr);
  geometry.setAttribute('iBelly', bellyAttr);
  const planes = new THREE.InstancedMesh(geometry, material, SLOTS);
  planes.name = 'aircraft';
  planes.frustumCulled = false;
  planes.castShadow = false;
  planes.receiveShadow = false;
  planes.raycast = () => undefined;
  planes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  planes.renderOrder = 3;

  const ribbon = createContrailRibbon(SLOTS);
  const group = new THREE.Group();
  group.name = 'aircraft';
  group.add(planes, ribbon.mesh);

  // Scratch objects: nothing below allocates per frame.
  const pose = newPose();
  const prev = { x: 0, y: 0, z: 0, t: 0 };
  const quat = new THREE.Quaternion();
  const rollQ = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const posV = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const matrix = new THREE.Matrix4();
  const tint = new THREE.Color();
  const ambient = new THREE.Color();

  let currentDay = Number.NaN;
  let days: Flight[][] = [[], []];
  // Every flight source the loops read: yesterday, today, and the opening flight (set on the first update).
  const lists: Flight[][] = [[], [], []];
  let introSet = false;
  // Per slot: id of the flight being trailed, next sample time and whether `prev` holds a point.
  // -Infinity = no flight (the opening flight has a negative id).
  const slotFlight = new Float64Array(SLOTS).fill(-Infinity);
  const slotNext = new Float64Array(SLOTS);
  const slotHas = new Uint8Array(SLOTS);
  const slotPrev = new Float64Array(SLOTS * 4);
  const slotActive = new Int8Array(SLOTS);
  const slotLivery = new Float64Array(SLOTS).fill(-1);
  const sources: AudioAircraft[] = [];
  let lastT = Number.NaN;
  let active = 0;

  for (let i = 0; i < SLOTS; i++) planes.setMatrixAt(i, hidden);
  planes.instanceMatrix.needsUpdate = true;

  const loadDays = (day: number): void => {
    days = [flightsForDay(seed, day - 1, cx, cz), flightsForDay(seed, day, cx, cz)];
    lists[0] = days[0];
    lists[1] = days[1];
    currentDay = day;
  };

  // The opening flight takes the first trail slot with no scheduled flight near its time, so slots never share.
  const pickIntroSlot = (t0: number): number => {
    const probe = introFlight(seed, t0, 0, cx, cz);
    const end = probe.start + probe.duration + CONTRAIL_LIFE;
    for (let s = 0; s < SLOTS; s++) {
      let busy = false;
      for (let li = 0; li < 2 && !busy; li++) {
        for (const f of lists[li]) {
          if (f.slot === s && f.start < end && f.start + f.duration > t0 - CONTRAIL_LIFE) busy = true;
        }
      }
      if (!busy) return s;
    }
    return 0;
  };

  const sample = (f: Flight, tt: number, out: typeof prev): void => {
    flightPose(f, tt, pose);
    // The trail leaves from behind the aircraft, so it never starts inside the hull.
    out.x = pose.x - Math.sin(pose.yaw) * TRAIL_OFFSET;
    out.y = pose.y;
    out.z = pose.z - Math.cos(pose.yaw) * TRAIL_OFFSET;
    out.t = tt;
  };

  const advanceTrails = (t: number, strength: number): void => {
    for (let li = 0; li < lists.length; li++) {
      const list = lists[li];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const s = f.slot;
        const end = f.start + f.duration;
        if (t < f.start || slotFlight[s] === f.id && slotNext[s] > end) continue;
        if (slotFlight[s] !== f.id) {
          // Only adopt a flight that is still in the air or ended less than a trail life ago.
          if (t > end + CONTRAIL_LIFE) continue;
          if (slotFlight[s] > f.id) continue;
          slotFlight[s] = f.id;
          slotNext[s] = Math.max(f.start, t - CONTRAIL_LIFE);
          slotHas[s] = 0;
        }
        let guard = 0;
        while (slotNext[s] <= Math.min(t, end) && guard++ < MAX_SAMPLES_PER_FRAME) {
          const tt = slotNext[s];
          sample(f, tt, prev);
          if (slotHas[s] && strength > 0.02) {
            ribbon.push(
              s,
              slotPrev[s * 4], slotPrev[s * 4 + 1], slotPrev[s * 4 + 2], slotPrev[s * 4 + 3],
              prev.x, prev.y, prev.z, prev.t,
              f.id % 97,
            );
          }
          slotPrev[s * 4] = prev.x;
          slotPrev[s * 4 + 1] = prev.y;
          slotPrev[s * 4 + 2] = prev.z;
          slotPrev[s * 4 + 3] = prev.t;
          slotHas[s] = 1;
          slotNext[s] = tt + SAMPLE_STEP;
        }
        if (guard >= MAX_SAMPLES_PER_FRAME) slotHas[s] = 0; // after a jump, do not bridge the gap
      }
    }
  };

  return {
    group,
    update(t, dt, env) {
      const day = Math.floor(t / DAY_SECONDS);
      if (day !== currentDay) loadDays(day);
      if (!introSet && Number.isFinite(t)) {
        introSet = true;
        lists[2] = [introFlight(seed, t, pickIntroSlot(t), cx, cz)];
      }
      const moved = dt > 0 && t !== lastT;
      if (Number.isFinite(lastT) && t < lastT) {
        // Time ran backwards (a reset or scrub): forget every trail.
        ribbon.clear();
        slotFlight.fill(-Infinity);
        slotHas.fill(0);
      }
      lastT = t;

      const strength = contrailStrength(env.weather);
      if (moved) advanceTrails(t, strength);

      // Aircraft instances.
      active = 0;
      slotActive.fill(0);
      for (let li = 0; li < lists.length; li++) {
        const list = lists[li];
        for (let i = 0; i < list.length; i++) {
          const f = list[i];
          if (!flightActive(f, t)) continue;
          flightPose(f, t, pose);
          const dxc = pose.x - env.camera.x;
          const dyc = pose.y - env.camera.y;
          const dzc = pose.z - env.camera.z;
          const dist = Math.sqrt(dxc * dxc + dyc * dyc + dzc * dzc);
          const k = Math.min(1, Math.max(0, (dist - NEAR_HIDE) / (NEAR_SHOW - NEAR_HIDE)));
          quat.setFromAxisAngle(yAxis, pose.yaw);
          rollQ.setFromAxisAngle(zAxis, pose.roll);
          quat.multiply(rollQ);
          posV.set(pose.x, pose.y, pose.z);
          scaleV.setScalar(k * k * (3 - 2 * k));
          matrix.compose(posV, quat, scaleV);
          planes.setMatrixAt(f.slot, matrix);
          slotActive[f.slot] = 1;
          if (slotLivery[f.slot] !== f.id) {
            slotLivery[f.slot] = f.id;
            const l = liveryFor(seed, f.id);
            finArr.set(l.fin, f.slot * 3);
            engArr.set(l.engine, f.slot * 3);
            bellyArr.set(l.belly, f.slot * 3);
            finAttr.needsUpdate = engAttr.needsUpdate = bellyAttr.needsUpdate = true;
          }
          let src = sources[active];
          if (!src) {
            src = { id: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
            sources[active] = src;
          }
          src.id = f.id;
          src.x = pose.x;
          src.y = pose.y;
          src.z = pose.z;
          src.vx = pose.vx;
          src.vy = pose.vy;
          src.vz = pose.vz;
          active++;
        }
      }
      sources.length = active;
      for (let s = 0; s < SLOTS; s++) if (!slotActive[s]) planes.setMatrixAt(s, hidden);
      planes.instanceMatrix.needsUpdate = true;

      // Lighting and look.
      uniforms.uTime.value = t;
      uniforms.uSunDir.value.set(env.sunDir.x, env.sunDir.y, env.sunDir.z).normalize();
      const sun = Math.min(1, Math.max(0, env.sunIntensity));
      (uniforms.uSunColor.value as THREE.Color).setRGB(env.sunColor.r, env.sunColor.g, env.sunColor.b);
      uniforms.uSunK.value = sun * 0.8;
      // Dark hull at night (ambient ~0.3), bright by day (ambient ~0.65).
      ambient.setScalar(0.05 + 0.5 * Math.min(1, Math.max(0, (env.ambient - 0.25) / 0.4)));
      (uniforms.uAmbient.value as THREE.Color).copy(ambient);
      uniforms.uNight.value = env.night ? 1 : 0;
      ribbon.setTime(t);
      contrailTint(env.sunColor, env.sunIntensity, env.ambient, tint);
      ribbon.setLook(tint, strength * contrailDayFactor(env.sunIntensity, env.ambient), env.wind?.x ?? 0, env.wind?.z ?? 0);
    },
    activeCount: () => active,
    audioSources: () => sources,
    dispose() {
      geometry.dispose();
      material.dispose();
      planes.dispose();
      ribbon.dispose();
    },
  };
}
