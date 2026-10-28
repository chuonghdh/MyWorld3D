import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createClouds } from '../src/environment/clouds';
import { getBodyMaterial, attachWeather } from '../src/buildings/materials';
import { createBarkMaterial, createFoliageMaterial, createWindUniforms } from '../src/environment/trees';
import {
  CLOUD_DIRECT_DARKNESS,
  CLOUD_LIGHTS_CHUNK,
  CLOUD_MASK_REBUILD_STEP,
  CLOUD_MASK_SIZE,
  attachCloudShade,
  cloudLookup,
  cloudShadeUniforms,
  hasCloudShade,
  rasterizeCloudMask,
  sampleCloudMask,
} from '../src/environment/cloudShade';
import {
  CLOUD_BASE_MAX,
  CLOUD_BASE_MIN,
  CLOUD_MAX_DARKNESS,
  CLOUD_MAX_DRIFT,
  CLOUD_MIN_DRIFT,
  CLOUD_TOP_MAX,
  buildCloudLayout,
  cloudDomain,
  cloudDriftVelocity,
  cloudShadowOffset,
  cloudShadowSun,
  cumulusVisibility,
  effectiveCoverage,
  puffTop,
} from '../src/environment/cloudSprites';

const area = { minX: -108, maxX: 108, minZ: -108, maxZ: 108 };
const DOMAIN = cloudDomain(217);

/** Share of the town (ground projection) under visible puffs at a cloud amount; mirrors the shader's wrap and sizes. */
function townShare(seed: number, cover: number): number {
  const l = buildCloudLayout(seed, DOMAIN);
  const discs: number[][] = [];
  const sc = 1 + 0.2 * cover;
  for (let i = 0; i < l.count; i++) {
    if (cumulusVisibility(l.info[i * 4 + 3], cover) < 0.5) continue;
    discs.push([
      (l.center[i * 3] - 0.5) * DOMAIN + l.offset[i * 3] * sc,
      (l.center[i * 3 + 2] - 0.5) * DOMAIN + l.offset[i * 3 + 2] * sc,
      l.info[i * 4] * sc,
    ]);
  }
  let hit = 0;
  let total = 0;
  for (let x = -100; x <= 100; x += 4) {
    for (let z = -100; z <= 100; z += 4) {
      total++;
      if (discs.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r)) hit++;
    }
  }
  return hit / total;
}

const meanShare = (cover: number): number => [1, 2, 3, 4, 5, 6].reduce((s, seed) => s + townShare(seed, cover), 0) / 6;

describe('cloud layout', () => {
  it('is deterministic and bounded', () => {
    const a = buildCloudLayout(3, DOMAIN);
    const b = buildCloudLayout(3, DOMAIN);
    expect(a.count).toBe(b.count);
    expect(Array.from(a.info.slice(0, 40))).toEqual(Array.from(b.info.slice(0, 40)));
    expect(a.count).toBeGreaterThan(300);
    expect(a.count).toBeLessThan(2500);
    for (let i = 0; i < a.count; i++) {
      expect(a.center[i * 3]).toBeGreaterThanOrEqual(0);
      expect(a.center[i * 3]).toBeLessThanOrEqual(1);
    }
  });

  it('keeps every cluster above the birds and below the top limit, at any weather', () => {
    const l = buildCloudLayout(5, DOMAIN);
    for (let i = 0; i < l.count; i++) {
      const base = l.center[i * 3 + 1];
      expect(base).toBeGreaterThanOrEqual(CLOUD_BASE_MIN);
      expect(base).toBeLessThanOrEqual(CLOUD_BASE_MAX);
      for (const cov of [0, 0.5, 1]) expect(puffTop(l, i, cov) + 1.5).toBeLessThanOrEqual(CLOUD_TOP_MAX);
      // Puff radii 9..30 m, cluster half width at most 48 m.
      expect(l.info[i * 4]).toBeGreaterThanOrEqual(9);
      expect(l.info[i * 4]).toBeLessThanOrEqual(30);
      expect(l.misc[i * 3 + 2]).toBeLessThanOrEqual(48);
    }
    expect(CLOUD_BASE_MIN).toBeGreaterThan(44); // birds fly up to 44 m
  });

  it('covers a moderate share of the town: fair 15-30%, more when cloudy', () => {
    const fair = meanShare(0.3);
    const mid = meanShare(0.6);
    const full = meanShare(1);
    expect(meanShare(0)).toBeGreaterThan(0.1);
    expect(fair).toBeGreaterThan(0.15);
    expect(fair).toBeLessThan(0.32);
    expect(mid).toBeGreaterThan(fair);
    expect(full).toBeGreaterThan(mid);
    expect(full).toBeLessThan(0.85);
  });

  it('shows more clusters as the cloud amount grows', () => {
    const l = buildCloudLayout(5, DOMAIN);
    const shown = (cov: number): number => {
      let n = 0;
      for (let i = 0; i < l.count; i++) if (l.misc[i * 3] === 1 && cumulusVisibility(l.info[i * 4 + 3], cov) > 0.5) n++;
      return n;
    };
    expect(shown(0)).toBeGreaterThan(0);
    expect(shown(0.5)).toBeGreaterThan(shown(0));
    expect(shown(1)).toBeGreaterThan(shown(0.5));
    expect(effectiveCoverage(2)).toBe(1);
  });
});

describe('cloud motion', () => {
  it('drifts along the wind at 0.25-0.4x its speed with a gentle minimum and a cap', () => {
    const out = { x: 0, z: 0 };
    const calm = cloudDriftVelocity({ x: 0, z: 0 }, out);
    expect(Math.hypot(calm.x, calm.z)).toBeCloseTo(CLOUD_MIN_DRIFT, 5);
    expect(CLOUD_MIN_DRIFT).toBeGreaterThanOrEqual(1);
    expect(CLOUD_MIN_DRIFT).toBeLessThanOrEqual(1.5);
    const mid = cloudDriftVelocity({ x: 10, z: 0 }, out);
    expect(mid.x / 10).toBeGreaterThanOrEqual(0.25);
    expect(mid.x / 10).toBeLessThanOrEqual(0.4);
    const gale = cloudDriftVelocity({ x: 30, z: -40 }, out);
    expect(Math.hypot(gale.x, gale.z)).toBeCloseTo(CLOUD_MAX_DRIFT, 5);
    expect(gale.x / gale.z).toBeCloseTo(30 / -40, 5); // same direction as the wind
  });
});

describe('cloud shadows from the layout', () => {
  it('lands away from the sun by height / tan(elevation)', () => {
    const out = { x: 0, z: 0 };
    const s = Math.SQRT1_2;
    const o = cloudShadowOffset({ x: s, y: s, z: 0 }, 100, out); // sun at 45 degrees in the east
    expect(o.x).toBeCloseTo(-100, 5);
    expect(o.z).toBeCloseTo(0, 5);
    const high = cloudShadowOffset({ x: 0, y: 1, z: 0 }, 100, out);
    expect(Math.hypot(high.x, high.z)).toBeCloseTo(0, 5);
    // A grazing sun is limited so a shadow never flies kilometres away.
    const low = cloudShadowOffset({ x: 1, y: 0.001, z: 0 }, 100, out);
    expect(Math.hypot(low.x, low.z)).toBeLessThan(100 / 0.15 + 1);
  });

  it('adds exactly one draw call, and the drift and sun reach the shared shadow uniforms', () => {
    expect(cloudShadowSun(0.02, 1)).toBe(0);
    expect(cloudShadowSun(-0.5, 1)).toBe(0);
    expect(cloudShadowSun(0.8, 1)).toBe(1);
    expect(cloudShadowSun(0.8, 0.5)).toBeCloseTo(0.5, 5);
    expect(CLOUD_MAX_DARKNESS).toBeLessThanOrEqual(0.35);

    const field = createClouds({ area, seed: 3 });
    expect(field.group.children).toHaveLength(1);
    const sprites = field.group.children[0] as THREE.Mesh;
    const mat = sprites.material as THREE.ShaderMaterial;
    expect((sprites.geometry as THREE.InstancedBufferGeometry).instanceCount).toBeGreaterThan(300);
    expect(mat.fog).toBe(true);
    expect(mat.depthWrite).toBe(false);

    const u = cloudShadeUniforms;
    const sunHigh = { x: 0.3, y: 0.8, z: 0.2 };
    const light = (dir: { x: number; y: number; z: number }): void =>
      field.setLighting(dir, { r: 1, g: 0.9, b: 0.8 }, { r: 0.5, g: 0.7, b: 0.9 }, 0.6);
    light(sunHigh);
    field.setSunlight(1);
    field.setCoverage(0.3);
    expect(u.uCsK.value).toBeCloseTo(CLOUD_DIRECT_DARKNESS, 5);
    expect(u.uCsPar.value.x).toBeGreaterThan(0); // the lookup points toward the sun
    field.setCoverage(1); // overcast: no distinct shadows
    expect(u.uCsK.value).toBeLessThan(CLOUD_DIRECT_DARKNESS * 0.2);
    field.setCoverage(0.3);
    light({ x: 1, y: 0.01, z: 0 });
    expect(u.uCsK.value).toBe(0); // low sun: faded out
    light(sunHigh);
    field.setSunlight(0); // night
    expect(u.uCsK.value).toBe(0);
    field.setSunlight(1);

    const before = (mat.uniforms.uDrift.value as THREE.Vector2).x;
    field.update(1, { x: 4, z: 1 });
    expect((mat.uniforms.uDrift.value as THREE.Vector2).x).toBeGreaterThan(before);
    // The mask follows the clouds.
    expect(u.uCsDrift.value.x).toBeCloseTo((mat.uniforms.uDrift.value as THREE.Vector2).x, 6);
    field.setCoverage(1);
    expect(mat.uniforms.uAltScale.value).toBeLessThan(1);
    field.dispose();
  });
});

describe('cloud shadow mask', () => {
  const layout = buildCloudLayout(3, DOMAIN);
  const raster = (cover: number): Uint8Array => {
    const out = new Uint8Array(CLOUD_MASK_SIZE * CLOUD_MASK_SIZE);
    rasterizeCloudMask(layout, cover, CLOUD_MASK_SIZE, out);
    return out;
  };
  const mean = (m: Uint8Array): number => m.reduce((s, v) => s + v, 0) / m.length / 255;

  it('is deterministic, covers more as the sky clouds over, and stays in range', () => {
    const a = raster(0.5);
    const b = raster(0.5);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(mean(raster(0.3))).toBeGreaterThan(0.05);
    expect(mean(raster(0.6))).toBeGreaterThan(mean(raster(0.3)));
    expect(mean(raster(1))).toBeGreaterThan(mean(raster(0.6)));
    expect(mean(raster(1))).toBeLessThan(0.9);
    let max = 0;
    let min = 255;
    for (const v of a) {
      max = Math.max(max, v);
      min = Math.min(min, v);
    }
    expect(max).toBeGreaterThan(200); // some texels are fully shaded
    expect(min).toBe(0); // and some are open sky
  });

  it('is periodic over the domain and samples inside 0..1', () => {
    const m = raster(0.6);
    for (let i = 0; i < 40; i++) {
      const x = (i * 37.3) % DOMAIN;
      const z = (i * 91.7) % DOMAIN;
      const v = sampleCloudMask(m, CLOUD_MASK_SIZE, DOMAIN, x, z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(sampleCloudMask(m, CLOUD_MASK_SIZE, DOMAIN, x + DOMAIN, z - DOMAIN)).toBeCloseTo(v, 6);
    }
  });

  it('looks toward the sun, less far for raised surfaces (parallax)', () => {
    const out = { x: 0, z: 0 };
    const par = { x: 1, z: 0 }; // sun at 45 degrees in the east: 1 m shift per metre of height
    const ground = cloudLookup({ x: 10, y: 0, z: 5 }, par, 95, out);
    expect(ground.x).toBeCloseTo(105, 5);
    expect(ground.z).toBeCloseTo(5, 5);
    const roof = cloudLookup({ x: 10, y: 25, z: 5 }, par, 95, out);
    expect(roof.x).toBeCloseTo(80, 5); // a roof 25 m up looks at a cloud 25 m closer
    const tall = cloudLookup({ x: 10, y: 200, z: 5 }, par, 95, out); // above the cloud: no shift
    expect(tall.x).toBeCloseTo(10, 5);
  });

  it('rebuilds the texture only when the cloud amount changes noticeably', () => {
    const field = createClouds({ area, seed: 3 });
    const tex = cloudShadeUniforms.uCsMask.value as THREE.DataTexture;
    expect(tex.image.data.length).toBe(CLOUD_MASK_SIZE * CLOUD_MASK_SIZE);
    field.setCoverage(0.3);
    const v1 = tex.version;
    field.setCoverage(0.3 + CLOUD_MASK_REBUILD_STEP / 4);
    expect(tex.version).toBe(v1);
    field.setCoverage(0.6);
    expect(tex.version).toBeGreaterThan(v1);
    field.dispose();
  });
});

describe('cloud shadow patch on the shared materials', () => {
  const compile = (m: THREE.Material) => {
    const sh = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: '#include <common>\n#include <project_vertex>\nvoid main(){}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <lights_fragment_begin>\n}',
    };
    m.onBeforeCompile(sh as never, null as never);
    return sh;
  };

  it('splices the lookup into the building body, the bark, the foliage and attached street materials', () => {
    expect(CLOUD_LIGHTS_CHUNK).toContain('directLight.color *= csShade');
    const mats: THREE.Material[] = [
      getBodyMaterial(),
      createBarkMaterial(),
      attachCloudShade(new THREE.MeshStandardMaterial()),
      createFoliageMaterial({ species: 'oak', season: 'summer', uniforms: createWindUniforms(10) } as never),
    ];
    for (const m of mats) {
      const sh = compile(m);
      expect(hasCloudShade(sh.fragmentShader)).toBe(true);
      expect(sh.vertexShader).toContain('vCsPos');
      expect(sh.uniforms.uCsMask).toBe(cloudShadeUniforms.uCsMask);
      expect(m.customProgramCacheKey()).toMatch(/cs1|building-body-v4/);
    }
  });

  it('does not stack when attached twice and keeps the weather patch of the street materials', () => {
    const m = attachWeather(new THREE.MeshStandardMaterial());
    attachCloudShade(m);
    attachCloudShade(m);
    const sh = compile(m);
    expect(sh.fragmentShader.match(/float cloudShadeAt/g)).toHaveLength(1);
    expect(sh.fragmentShader).toContain('uWet');
    expect(m.customProgramCacheKey()).toContain('wx1');
    expect(m.customProgramCacheKey()).toContain('cs1');
  });
});
