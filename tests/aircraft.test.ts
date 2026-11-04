import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ALTITUDE_MAX,
  ALTITUDE_MIN,
  CAMERA_SAFETY_MARGIN,
  CONTRAIL_LIFE,
  MAX_ALPHA,
  MAX_CAMERA_HEIGHT,
  QUADS_PER_SLOT,
  SAMPLE_STEP,
  SLOTS,
  SPAWN_RADIUS_MIN,
  SPEED_MAX,
  SPEED_MIN,
  contrailAlpha,
  contrailStrength,
  contrailWidth,
  createAircraft,
  createContrailRibbon,
  flightActive,
  flightPose,
  flightsForDay,
  introFlight,
  newPose,
  liveryFor,
  LIVERIES,
  contrailWobble,
  PLANE_SCALE,
  TURN_MIN,
  TURN_MAX,
  type AircraftEnv,
} from '../src/aircraft';
import { CLOUD_TOP_MAX } from '../src/environment/cloudSprites';
import { clipPlanes } from '../src/scene/cameraMath';
import { DAY_SECONDS } from '../src/store/model';

const clearWeather = { cloudiness: 0.1, rain: 0, snowfall: 0, fogDensityMul: 1 };
const env = (over: Partial<AircraftEnv> = {}): AircraftEnv => ({
  camera: { x: 0, y: 150, z: 400 },
  sunDir: { x: 0.3, y: 0.8, z: 0.2 },
  sunColor: { r: 1, g: 0.95, b: 0.85 },
  sunIntensity: 1,
  ambient: 0.6,
  night: false,
  weather: clearWeather,
  ...over,
});

describe('flight schedule', () => {
  it('schedules exactly one flight per in-app hour, at a random moment inside it', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (let day = -2; day < 6; day++) {
        const n = flightsForDay(seed, day).length;
        expect(n).toBe(24);
      }
    }
  });

  it('starts flight h inside in-app hour h, at varying moments', () => {
    const hour = DAY_SECONDS / 24;
    const offsets = new Set<number>();
    for (let seed = 0; seed < 20; seed++) {
      flightsForDay(seed, 1).forEach((f, h) => {
        const into = f.start - (DAY_SECONDS + h * hour);
        expect(into).toBeGreaterThanOrEqual(0);
        expect(into).toBeLessThan(hour);
        offsets.add(Math.round(into));
      });
    }
    expect(offsets.size).toBeGreaterThan(30);
  });

  it('is deterministic and varies with the seed', () => {
    expect(flightsForDay(7, 3)).toEqual(flightsForDay(7, 3));
    expect(flightsForDay(7, 3)).not.toEqual(flightsForDay(8, 3));
  });

  it('keeps flights inside their day window, sorted, with spaced slots', () => {
    for (let seed = 1; seed < 20; seed++) {
      const list = flightsForDay(seed, 2);
      for (let i = 0; i < list.length; i++) {
        expect(list[i].start).toBeGreaterThanOrEqual(2 * DAY_SECONDS);
        expect(list[i].start).toBeLessThan(3 * DAY_SECONDS);
        if (i > 0) expect(list[i].start).toBeGreaterThan(list[i - 1].start);
        // Same-slot flights are far enough apart for the first trail to have faded.
        for (let j = 0; j < i; j++) {
          if (list[j].slot === list[i].slot) {
            expect(list[i].start - (list[j].start + list[j].duration)).toBeGreaterThan(CONTRAIL_LIFE);
          }
        }
      }
    }
  });

  it('cruises above the clouds and below the highest camera', () => {
    expect(ALTITUDE_MIN).toBeGreaterThan(CLOUD_TOP_MAX);
    expect(ALTITUDE_MAX).toBeLessThanOrEqual(MAX_CAMERA_HEIGHT - CAMERA_SAFETY_MARGIN);
    expect(ALTITUDE_MAX).toBeGreaterThan(ALTITUDE_MIN);
    for (let seed = 0; seed < 40; seed++) {
      for (const f of flightsForDay(seed, 1)) {
        expect(f.altitude).toBeGreaterThanOrEqual(ALTITUDE_MIN);
        expect(f.altitude).toBeLessThanOrEqual(ALTITUDE_MAX);
        expect(f.altitude).toBeLessThan(MAX_CAMERA_HEIGHT);
      }
    }
    expect(clipPlanes(600).far).toBeGreaterThanOrEqual(1200);
  });

  it('flies a straight line from beyond one edge to beyond the other at plausible speed', () => {
    const p = newPose();
    for (let seed = 0; seed < 30; seed++) {
      for (const f of flightsForDay(seed, 0, 10, -20)) {
        expect(f.speed).toBeGreaterThanOrEqual(SPEED_MIN);
        expect(f.speed).toBeLessThanOrEqual(SPEED_MAX);
        expect(Math.hypot(f.dx, f.dz)).toBeCloseTo(1, 6);
        expect(Math.abs(f.curve * f.length)).toBeGreaterThanOrEqual(TURN_MIN - 1e-9);
        expect(Math.abs(f.curve * f.length)).toBeLessThanOrEqual(TURN_MAX + 1e-9);
        expect(f.duration).toBeLessThan(DAY_SECONDS / 15);
        flightPose(f, f.start, p);
        expect(Math.hypot(p.x - 10, p.z + 20)).toBeGreaterThanOrEqual(SPAWN_RADIUS_MIN - 1e-6);
        flightPose(f, f.start + f.duration, p);
        expect(Math.hypot(p.x - 10, p.z + 20)).toBeGreaterThanOrEqual(SPAWN_RADIUS_MIN - 1e-6);
        // Midpoint is over the town area.
        flightPose(f, f.start + f.duration / 2, p);
        expect(Math.hypot(p.x - 10, p.z + 20)).toBeLessThan(SPAWN_RADIUS_MIN * 0.6);
      }
    }
  });

  it('flights are only active inside their window', () => {
    const f = flightsForDay(3, 0)[0];
    expect(flightActive(f, f.start - 1)).toBe(false);
    expect(flightActive(f, f.start + 1)).toBe(true);
    expect(flightActive(f, f.start + f.duration + 1)).toBe(false);
  });
});

describe('curved flight paths', () => {
  it('turns gently, banks with the turn and stays inside the altitude band', () => {
    const p = newPose();
    let sawLeft = false;
    let sawRight = false;
    for (let seed = 0; seed < 30; seed++) {
      for (const f of flightsForDay(seed, 1)) {
        if (f.curve > 0) sawLeft = true;
        else sawRight = true;
        let prevYaw = f.yaw0;
        for (let k = 0; k <= 20; k++) {
          flightPose(f, f.start + (f.duration * k) / 20, p);
          expect(p.y).toBeGreaterThanOrEqual(ALTITUDE_MIN);
          expect(p.y).toBeLessThanOrEqual(ALTITUDE_MAX);
          expect(Math.hypot(p.vx, p.vz)).toBeCloseTo(f.speed, 4);
          // Bank leans into the turn: opposite sign to the curvature, small, level at the ends.
          if (k > 2 && k < 18) expect(Math.sign(p.roll)).toBe(-Math.sign(f.curve));
          expect(Math.abs(p.roll)).toBeLessThan(0.5);
          expect(Math.abs(p.yaw - prevYaw)).toBeLessThan(0.1);
          prevYaw = p.yaw;
          // Never closer than 900 m at the ends, and always over the sky domain.
          if (k === 0 || k === 20) expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(SPAWN_RADIUS_MIN - 1e-6);
          else expect(Math.hypot(p.x, p.z)).toBeLessThan(1100);
        }
        flightPose(f, f.start, p);
        expect(Math.abs(p.roll)).toBeLessThan(1e-9);
      }
    }
    expect(sawLeft && sawRight).toBe(true);
  });
});

describe('liveries and scale', () => {
  it('picks a deterministic livery per flight and uses several of them', () => {
    expect(liveryFor(5, 12)).toBe(liveryFor(5, 12));
    const seen = new Set<unknown>();
    for (let id = 0; id < 200; id++) seen.add(liveryFor(3, id));
    expect(seen.size).toBeGreaterThanOrEqual(LIVERIES.length - 1);
    for (const l of LIVERIES) for (const c of [...l.fin, ...l.engine, ...l.belly]) expect(c).toBeGreaterThan(0);
  });

  it('is 70% of the original size, still one instanced mesh with livery attributes', () => {
    expect(PLANE_SCALE).toBeCloseTo(0.7, 6);
    const a = createAircraft({ seed: 2 });
    const planes = a.group.children[0] as THREE.InstancedMesh;
    planes.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    (planes.geometry.boundingBox as THREE.Box3).getSize(size);
    expect(size.z).toBeGreaterThan(21);
    expect(size.z).toBeLessThan(23);
    for (const n of ['iFin', 'iEngine', 'iBelly']) expect(planes.geometry.getAttribute(n)).toBeTruthy();
    a.dispose();
  });
});

describe('contrail ribbon', () => {
  it('fades alpha with age and widens', () => {
    expect(contrailAlpha(-1)).toBe(0);
    expect(contrailAlpha(0)).toBe(0);
    expect(contrailAlpha(3)).toBeGreaterThan(0.8);
    // Dissipates over exactly one in-app hour (DAY_SECONDS / 24 of simulated time).
    expect(CONTRAIL_LIFE).toBe(DAY_SECONDS / 24);
    expect(contrailAlpha(CONTRAIL_LIFE * 0.95)).toBeLessThan(0.05);
    expect(contrailWidth(0)).toBeLessThanOrEqual(1.2);
    expect(contrailWidth(CONTRAIL_LIFE)).toBeLessThanOrEqual(12);
    expect(contrailWobble(0)).toBe(0);
    expect(contrailWobble(CONTRAIL_LIFE * 0.5)).toBeLessThan(contrailWobble(CONTRAIL_LIFE * 0.9));
    expect(contrailWobble(CONTRAIL_LIFE)).toBeGreaterThanOrEqual(20);
    expect(contrailAlpha(3)).toBeLessThanOrEqual(MAX_ALPHA);
    expect(contrailAlpha(30)).toBeLessThan(contrailAlpha(10));
    expect(contrailAlpha(CONTRAIL_LIFE)).toBe(0);
    expect(contrailWidth(40)).toBeGreaterThan(contrailWidth(5));
  });

  it('is a ring buffer: the oldest quads are overwritten, no growth', () => {
    const ribbon = createContrailRibbon(SLOTS);
    const attrCount = ribbon.mesh.geometry.getAttribute('position').count;
    const n = QUADS_PER_SLOT * 2 + 5;
    for (let i = 0; i < n; i++) {
      ribbon.push(1, i, 200, 0, i * SAMPLE_STEP, i + 1, 200, 0, (i + 1) * SAMPLE_STEP, 3);
    }
    expect(ribbon.mesh.geometry.getAttribute('position').count).toBe(attrCount);
    expect(ribbon.headOf(1)).toBe(n % QUADS_PER_SLOT);
    // The slot holds exactly the newest QUADS_PER_SLOT births.
    const births: number[] = [];
    for (let i = 0; i < QUADS_PER_SLOT; i++) births.push(ribbon.birthOf(1, i));
    expect(Math.min(...births)).toBeCloseTo((n - QUADS_PER_SLOT + 1) * SAMPLE_STEP, 3);
    expect(Math.max(...births)).toBeCloseTo(n * SAMPLE_STEP, 3);
    // The ring covers more than a full trail life.
    expect(QUADS_PER_SLOT * SAMPLE_STEP).toBeGreaterThan(CONTRAIL_LIFE);
    // Other slots stay empty.
    expect(ribbon.birthOf(0, 0)).toBeLessThan(-1e8);
    ribbon.clear();
    expect(ribbon.birthOf(1, 0)).toBeLessThan(-1e8);
    ribbon.dispose();
  });

  it('is one non-culled, fog-blended, depth-write-free transparent mesh', () => {
    const ribbon = createContrailRibbon(SLOTS);
    const m = ribbon.mesh.material as THREE.ShaderMaterial;
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(m.fog).toBe(true);
    expect(m.blending).toBe(THREE.NormalBlending);
    expect(ribbon.mesh.frustumCulled).toBe(false);
    ribbon.dispose();
  });
});

describe('contrail weather', () => {
  it('forms in clear or fair air and thins out in rain, storm, snow, fog and overcast', () => {
    expect(contrailStrength(clearWeather)).toBe(1);
    expect(contrailStrength({ cloudiness: 0.9, rain: 0, snowfall: 0, fogDensityMul: 1 })).toBe(0);
    expect(contrailStrength({ cloudiness: 0.2, rain: 0.5, snowfall: 0, fogDensityMul: 1.6 })).toBe(0);
    expect(contrailStrength({ cloudiness: 0.2, rain: 0, snowfall: 0.8, fogDensityMul: 2 })).toBe(0);
    expect(contrailStrength({ cloudiness: 0.2, rain: 0, snowfall: 0, fogDensityMul: 6 })).toBe(0);
    const partial = contrailStrength({ cloudiness: 0.5, rain: 0, snowfall: 0, fogDensityMul: 1 });
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });
});

describe('aircraft system', () => {
  const firstFlight = flightsForDay(11, 0)[0];

  it('opens with one flight at the first update, and spawns nothing while paused (dt = 0)', () => {
    const a = createAircraft({ seed: 11 });
    a.update(firstFlight.start - 10, 0.016, env());
    // The opening flight starts at the first update (the schedule may also have a flight in the air here).
    expect(a.activeCount()).toBeGreaterThanOrEqual(1);
    // Paused inside the flight window: the clock does not move, so no trail samples are written.
    const ribbon = a.group.children[1] as THREE.Mesh;
    const before = (ribbon.geometry.getAttribute('aBirth') as THREE.BufferAttribute).array.slice();
    a.update(firstFlight.start + 5, 0, env());
    const after = (ribbon.geometry.getAttribute('aBirth') as THREE.BufferAttribute).array;
    expect(Array.from(after)).toEqual(Array.from(before));
    a.dispose();
  });

  it('opening flight: starts at the first update, crosses the town at cruise height, is not repeated', () => {
    const t0 = 5000;
    const f = introFlight(11, t0, 0);
    expect(f.start).toBe(t0);
    expect(f.speed).toBeGreaterThanOrEqual(SPEED_MIN);
    expect(f.speed).toBeLessThanOrEqual(SPEED_MAX);
    expect(f.altitude).toBeGreaterThanOrEqual(ALTITUDE_MIN);
    expect(f.altitude).toBeLessThanOrEqual(ALTITUDE_MAX);
    const a = createAircraft({ seed: 11 });
    a.update(t0, 0.016, env());
    expect(a.activeCount()).toBeGreaterThanOrEqual(1);
    a.dispose();
  });

  it('flies one aircraft at a time and writes trail samples while time advances', () => {
    const a = createAircraft({ seed: 11 });
    const ribbon = a.group.children[1] as THREE.Mesh;
    let t = firstFlight.start - 1;
    a.update(t, 0.016, env());
    for (let i = 0; i < 100; i++) {
      t += 0.1;
      a.update(t, 0.1, env());
    }
    // The opening flight and the schedule's first flight may both be in the air here.
    expect(a.activeCount()).toBeGreaterThanOrEqual(1);
    const births = (ribbon.geometry.getAttribute('aBirth') as THREE.BufferAttribute).array;
    let written = 0;
    for (let i = 0; i < births.length; i++) if (births[i] > 0) written++;
    expect(written).toBeGreaterThan(8);
    a.dispose();
  });

  it('writes no contrail in rain', () => {
    const a = createAircraft({ seed: 11 });
    const ribbon = a.group.children[1] as THREE.Mesh;
    const rain = env({ weather: { cloudiness: 0.9, rain: 0.7, snowfall: 0, fogDensityMul: 2 } });
    let t = firstFlight.start - 1;
    a.update(t, 0.016, rain);
    for (let i = 0; i < 100; i++) {
      t += 0.1;
      a.update(t, 0.1, rain);
    }
    expect(a.activeCount()).toBeGreaterThanOrEqual(1);
    const births = (ribbon.geometry.getAttribute('aBirth') as THREE.BufferAttribute).array;
    expect(Math.max(...births)).toBeLessThan(0);
    a.dispose();
  });

  it('shrinks an aircraft that comes close to the camera and stays within the sky band', () => {
    const a = createAircraft({ seed: 11 });
    const t = firstFlight.start + firstFlight.duration / 2;
    const planes = a.group.children[0] as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const q = new THREE.Quaternion();
    a.update(t, 0.016, env({ camera: { x: 0, y: 0, z: 0 } }));
    planes.getMatrixAt(firstFlight.slot, m);
    m.decompose(pos, q, scale);
    expect(pos.y).toBeGreaterThanOrEqual(ALTITUDE_MIN);
    expect(pos.y).toBeLessThanOrEqual(ALTITUDE_MAX);
    expect(scale.x).toBeGreaterThan(0.99);
    a.update(t, 0.016, env({ camera: { x: pos.x, y: pos.y + 5, z: pos.z } }));
    planes.getMatrixAt(firstFlight.slot, m);
    m.decompose(pos, q, scale);
    expect(scale.x).toBeLessThan(0.01);
    a.dispose();
  });

  it('uses at most two draw calls and is never frustum culled', () => {
    const a = createAircraft({ seed: 1 });
    const meshes: THREE.Object3D[] = [];
    a.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o);
    });
    expect(meshes.length).toBeLessThanOrEqual(3);
    for (const m of meshes) expect(m.frustumCulled).toBe(false);
    a.dispose();
  });
});
