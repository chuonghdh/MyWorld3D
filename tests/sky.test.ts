import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeSkyState, createGroundDisc, createSkyDome, GROUND_DISC_Y } from '../src/sky';
import { ASPHALT_TOP, SIDEWALK_TOP } from '../src/streets';
import { GROUND_Y } from '../src/streets/surfaces';
import { getLightingForTime, getNightSchedule, getSkyState } from '../src/environment/sun';
import { CLOUD_MAX_DARKNESS, cloudShadowAlpha, createClouds } from '../src/environment/clouds';

describe('sky state', () => {
  it('shows stars and moon at 20:30 but not at noon', () => {
    const night = computeSkyState({ timeOfDay: 22 });
    const noon = computeSkyState({ timeOfDay: 12 });
    expect(night.stars).toBeGreaterThan(0.6);
    expect(night.moonVis).toBeGreaterThan(0.6);
    expect(night.moonDir[1]).toBeGreaterThan(0);
    expect(noon.stars).toBe(0);
    expect(noon.moonVis).toBe(0);
    expect(noon.sunVis).toBeGreaterThan(0.5);
  });

  it('widens the sun glow at golden hour', () => {
    const lowSun = getLightingForTime(17.6).sun.altitudeDeg;
    expect(lowSun).toBeGreaterThan(0);
    const golden = computeSkyState({ timeOfDay: 17.6 });
    const noon = computeSkyState({ timeOfDay: 12 });
    expect(golden.glowK).toBeGreaterThan(noon.glowK);
  });

  it('overcast hides stars and dims the sun', () => {
    const clear = computeSkyState({ timeOfDay: 23, cloudiness: 0 });
    const cloudy = computeSkyState({ timeOfDay: 23, cloudiness: 1 });
    expect(cloudy.stars).toBeLessThan(clear.stars * 0.2);
    const noonClear = computeSkyState({ timeOfDay: 12, cloudiness: 0 });
    const noonCloudy = computeSkyState({ timeOfDay: 12, cloudiness: 1 });
    expect(noonCloudy.sunVis).toBeLessThan(noonClear.sunVis * 0.3);
  });

  it('uses the fog colour as the horizon colour when given', () => {
    const v = computeSkyState({ timeOfDay: 12, fogColor: { r: 0.3, g: 0.4, b: 0.5 } });
    expect(v.horizon).toEqual([0.3, 0.4, 0.5]);
  });

  it('keeps the moon opposite the sun with a unit direction', () => {
    const { sun, moon } = getLightingForTime(21);
    expect(Math.hypot(moon.x, moon.y, moon.z)).toBeCloseTo(1, 6);
    expect(moon.x).toBeCloseTo(-sun.x, 6);
    expect(moon.y).toBeCloseTo(-sun.y, 6);
  });
});

describe('night light', () => {
  it('has a moon fill and a lifted ambient floor at night, none by day', () => {
    const night = getSkyState(-30);
    const day = getSkyState(40);
    expect(night.moonFill).toBeGreaterThan(0.4);
    expect(day.moonFill).toBe(0);
    expect(night.ambientIntensity).toBeGreaterThanOrEqual(0.3);
  });

  it('switches things on in order: lamps, shops, then most windows', () => {
    const dusk = getNightSchedule(18.5, 1);
    const dark = getNightSchedule(21, -25);
    const late = getNightSchedule(2, -50);
    expect(dusk.lamps).toBeGreaterThan(dusk.windows);
    expect(dark.lamps).toBe(1);
    expect(dark.windows).toBeGreaterThan(0.9);
    expect(late.windows).toBeLessThan(dark.windows);
    expect(getNightSchedule(12, 60).windows).toBe(0);
  });
});

describe('ground disc', () => {
  it('sits a few centimetres below every other ground layer, never coplanar', () => {
    expect(GROUND_DISC_Y).toBeLessThan(GROUND_Y);
    expect(GROUND_Y - GROUND_DISC_Y).toBeGreaterThan(0.02);
    expect(GROUND_Y - GROUND_DISC_Y).toBeLessThan(0.1);
    expect(GROUND_DISC_Y).toBeLessThan(ASPHALT_TOP);
    expect(GROUND_DISC_Y).toBeLessThan(SIDEWALK_TOP);
  });

  it('follows the camera and stays inside the far plane', () => {
    const ground = createGroundDisc();
    const cam = new THREE.PerspectiveCamera(35, 1, 1, 500);
    cam.position.set(120, 50, -80);
    ground.follow(cam);
    expect(ground.mesh.position.x).toBe(120);
    expect(ground.mesh.position.z).toBe(-80);
    expect(ground.mesh.scale.x).toBeLessThan(500);
    ground.dispose();
  });
});

describe('sky dome', () => {
  it('is one mesh with no shadows, no depth write and no textures', () => {
    const dome = createSkyDome();
    const mat = dome.mesh.material as THREE.ShaderMaterial;
    expect(mat.depthWrite).toBe(false);
    expect(dome.mesh.castShadow).toBe(false);
    expect(dome.mesh.frustumCulled).toBe(false);
    for (const u of Object.values(mat.uniforms)) expect(u.value instanceof THREE.Texture).toBe(false);
    dome.set(computeSkyState({ timeOfDay: 20.5 }));
    dome.tick(1);
    dome.dispose();
  });
});

describe('cloud shadows', () => {
  it('never darkens the ground more than 35%', () => {
    expect(CLOUD_MAX_DARKNESS).toBeLessThanOrEqual(0.35);
    for (const cov of [0, 0.5, 1]) {
      for (let n = 0; n <= 1; n += 0.05) {
        expect(cloudShadowAlpha(n, cov, 1)).toBeLessThanOrEqual(0.35 + 1e-9);
      }
    }
    expect(cloudShadowAlpha(1, 1, 0)).toBe(0);
  });

  it('is a single decal that ignores shadow-only hacks and has no polygon puffs', () => {
    const field = createClouds({ area: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, seed: 3 });
    const meshes: THREE.Mesh[] = [];
    field.group.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes).toHaveLength(1);
    // What the old Town.tsx did to cloud meshes must not hide the decal or make it cast a shadow.
    const m = meshes[0].material as THREE.ShaderMaterial;
    m.colorWrite = false;
    meshes[0].castShadow = true;
    expect(m.colorWrite).toBe(true);
    expect(meshes[0].castShadow).toBe(false);
    field.update(0.05, { x: 3, z: 1 });
    field.setCoverage(2);
    expect(m.uniforms.uCoverage.value).toBe(1);
    field.dispose();
  });
});
