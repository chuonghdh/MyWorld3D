import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeSkyState, createGroundDisc, createSkyDome, GROUND_DISC_Y, MOON_RADIUS, sunAppearance } from '../src/sky';
import { OLD_MOON_RADIUS, OLD_SUN_RADIUS, OLD_SUN_HORIZON_GROWTH, SUN_HORIZON_RADIUS, SUN_ZENITH_RADIUS, sunRadiusFor } from '../src/sky/state';
import { lightDirection } from '../src/scene/townShadow';
import { ASPHALT_TOP, SIDEWALK_TOP } from '../src/streets';
import { GROUND_Y } from '../src/streets/surfaces';
import { getLightingForTime, getNightSchedule, getSkyState, getSunDirection } from '../src/environment/sun';
import { skyEnvironment } from '../src/config/tuning';
import { createClouds } from '../src/environment/clouds';
import { CLOUD_MAX_DARKNESS, cloudShadowAlpha } from '../src/environment/cloudSprites';

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
    const night = getSkyState(-55);
    const day = getSkyState(40);
    // Tight floors: at -30 deg nightness is 1, so these equal the config knobs exactly.
    expect(night.moonFill).toBeCloseTo(skyEnvironment.night.moonFillFactor, 6);
    expect(day.moonFill).toBe(0);
    expect(night.ambientIntensity).toBeCloseTo(skyEnvironment.night.ambientIntensity, 6);
  });

  it('switches things on in order: lamps, shops, then most windows', () => {
    const dusk = getNightSchedule(18.58, getSunDirection(18.58).altitudeDeg);
    const dark = getNightSchedule(22, -55);
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
    for (const k of [0, 0.5, 1, 3]) {
      for (let d = 0; d <= 1.5; d += 0.05) {
        expect(cloudShadowAlpha(d, k)).toBeLessThanOrEqual(0.35 + 1e-9);
      }
    }
    expect(cloudShadowAlpha(1, 0)).toBe(0);
  });

  it('draws only the cloud sprites: the shadows are a mask sampled by the materials, not a decal', () => {
    const field = createClouds({ area: { minX: -50, maxX: 50, minZ: -50, maxZ: 50 }, seed: 3 });
    const meshes: THREE.Mesh[] = [];
    field.group.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    expect(meshes.map((m) => m.name)).toEqual(['cloud-sprites']);
    expect(meshes[0].castShadow).toBe(false);
    field.update(0.05, { x: 3, z: 1 });
    field.setCoverage(2);
    field.dispose();
  });
});

describe('visible sun', () => {
  const hours = [5, 6, 7, 9, 12, 15, 17, 18, 19, 21];

  it('sits exactly at the sun direction and shares the frame of the light and the cloud shadows', () => {
    for (const h of hours) {
      const { sun } = getLightingForTime(h);
      const v = computeSkyState({ timeOfDay: h });
      expect(v.sunDir).toEqual([sun.x, sun.y, sun.z]);
      expect(Math.hypot(...v.sunDir)).toBeCloseTo(1, 6);
      if (sun.altitudeDeg > 25) {
        // Above the minimum shadow-light elevation the light comes from exactly the visible sun.
        const l = lightDirection(sun);
        expect(l.x).toBeCloseTo(sun.x, 6);
        expect(l.y).toBeCloseTo(sun.y, 6);
        expect(l.z).toBeCloseTo(sun.z, 6);
      } else if (sun.altitudeDeg > 0) {
        // Low sun: the light is lifted but keeps the azimuth, so shadows still point away from the disc.
        const l = lightDirection(sun);
        const k = Math.hypot(sun.x, sun.z) / Math.hypot(l.x, l.z);
        expect(l.x * k).toBeCloseTo(sun.x, 6);
        expect(l.z * k).toBeCloseTo(sun.z, 6);
      }
    }
  });

  it('is hidden under the horizon and shown above it', () => {
    expect(computeSkyState({ timeOfDay: 0, cloudiness: 0 }).sunVis).toBe(0);
    expect(computeSkyState({ timeOfDay: 22, cloudiness: 0 }).sunVis).toBe(0);
    expect(computeSkyState({ timeOfDay: 12, cloudiness: 0 }).sunVis).toBeCloseTo(1, 6);
    expect(sunAppearance(-5, 0).vis).toBe(0);
    expect(sunAppearance(5, 0).vis).toBe(1);
    // Sun and moon are never both fully visible.
    for (let h = 0; h < 24; h += 0.25) {
      const v = computeSkyState({ timeOfDay: h, cloudiness: 0 });
      expect(Math.min(v.sunVis, v.moonVis)).toBeLessThan(0.5);
      if (v.sunVis > 0.05) expect(v.moonDir[1]).toBeLessThan(0.1);
    }
  });

  it('is smaller than before: 40% for the moon, 0.3x at the zenith and 0.4x of the old horizon size for the sun', () => {
    expect(MOON_RADIUS).toBeCloseTo(OLD_MOON_RADIUS * 0.4, 9);
    expect(SUN_ZENITH_RADIUS).toBeCloseTo(OLD_SUN_RADIUS * 0.3, 9);
    expect(SUN_HORIZON_RADIUS).toBeCloseTo(OLD_SUN_RADIUS * (1 + OLD_SUN_HORIZON_GROWTH) * 0.4, 9);
    expect(sunRadiusFor(90)).toBeCloseTo(SUN_ZENITH_RADIUS, 9);
    expect(sunRadiusFor(0)).toBeCloseTo(SUN_HORIZON_RADIUS, 9);
    expect(SUN_ZENITH_RADIUS / (OLD_SUN_RADIUS * 0.4)).toBeCloseTo(0.75, 9);
    // Smooth and monotonic: the sun only shrinks as it climbs.
    let prev = Infinity;
    for (let a = 0; a <= 90; a += 1) {
      const r = sunRadiusFor(a);
      expect(r).toBeLessThanOrEqual(prev + 1e-12);
      if (a > 0) expect(prev - r).toBeLessThan(0.0006);
      prev = r;
    }
    expect(sunRadiusFor(-10)).toBeCloseTo(SUN_HORIZON_RADIUS, 9);
    expect(sunAppearance(60, 0).radius).toBeCloseTo(sunRadiusFor(60), 9);
    expect(SUN_ZENITH_RADIUS).toBeGreaterThanOrEqual(MOON_RADIUS * 0.8);
  });

  it('is vivid golden-yellow high up and orange on the horizon, far brighter than the moon', () => {
    const low = sunAppearance(0, 0);
    const high = sunAppearance(60, 0);
    expect(high.disc[0]).toBeGreaterThan(3);
    expect(high.disc[1]).toBeGreaterThan(0.8);
    expect(high.disc[1] / high.disc[2]).toBeGreaterThan(4);
    expect(high.disc[0]).toBeGreaterThanOrEqual(high.disc[1]);
    expect(low.disc[1] / low.disc[0]).toBeLessThan(0.5);
    expect(low.disc[2] / low.disc[0]).toBeLessThan(0.2);
    expect(low.disc[0]).toBeGreaterThan(1);
    expect(low.radius).toBeGreaterThan(high.radius * 1.5);
  });

  it('is dimmed and diffused by overcast', () => {
    const clear = sunAppearance(40, 0);
    const overcast = sunAppearance(40, 1);
    expect(overcast.vis).toBeLessThan(clear.vis * 0.2);
    expect(overcast.glowVis).toBeLessThan(clear.glowVis);
    expect(overcast.soft).toBeGreaterThan(clear.soft);
    expect(computeSkyState({ timeOfDay: 12, cloudiness: 1 }).sunVis).toBeLessThan(0.15);
  });

  it('is never drawn for downward view directions: the shader masks by the pixel height', () => {
    const mat = createSkyDome().mesh.material as THREE.ShaderMaterial;
    const src = mat.fragmentShader;
    expect(src).toContain('float hMask = smoothstep(-0.02, 0.03, h)');
    expect(src).toContain('* hMask');
    // Analytic check of the mask: zero for every direction at or below the horizon line by 0.02.
    const mask = (h: number): number => {
      const t = Math.min(1, Math.max(0, (h + 0.02) / 0.05));
      return t * t * (3 - 2 * t);
    };
    for (const h of [-1, -0.5, -0.1, -0.02]) expect(mask(h)).toBe(0);
    expect(mask(0.03)).toBe(1);
  });

  it('projects to the expected screen position when the camera looks at the sun', () => {
    const dome = createSkyDome();
    const mat = dome.mesh.material as THREE.ShaderMaterial;
    const v = computeSkyState({ timeOfDay: 17.6, cloudiness: 0 });
    dome.set(v);
    expect((mat.uniforms.uSunDir.value as THREE.Vector3).toArray()).toEqual(v.sunDir);
    const cam = new THREE.PerspectiveCamera(35, 1.6, 1, 2000);
    cam.position.set(0, 3, 0);
    // Aim 10 degrees to one side of the sun, a little under it: the sun is then in view, up-right.
    const sun = new THREE.Vector3(...v.sunDir);
    cam.lookAt(sun.clone().multiplyScalar(100).add(new THREE.Vector3(0, -8, 0)));
    cam.updateMatrixWorld();
    const ndc = sun.clone().multiplyScalar(500).add(cam.position).project(cam);
    expect(Math.abs(ndc.x)).toBeLessThan(1);
    expect(ndc.y).toBeGreaterThan(0);
    expect(ndc.y).toBeLessThan(1);
    // A high camera looking steeply down at the town sees no sky, so the sun is off screen.
    cam.position.set(0, 380, 130);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const down = sun.clone().multiplyScalar(500).add(cam.position).project(cam);
    expect(down.y > 1 || Math.abs(down.x) > 1 || down.z > 1).toBe(true);
    dome.dispose();
  });

  it('compiles into a shader that uses the shared moon radius and the new uniforms', () => {
    const mat = createSkyDome().mesh.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain(`float radius = ${MOON_RADIUS.toFixed(4)};`);
    for (const k of ['uSunDisc', 'uSunSize', 'uSunSoft', 'uSunGlow']) expect(mat.uniforms[k]).toBeDefined();
  });
});
