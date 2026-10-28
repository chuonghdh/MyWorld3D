import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createClouds } from '../src/environment/clouds';
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

  it('fades with a low sun, is capped at 35% and uses one draw call next to the clouds', () => {
    expect(cloudShadowSun(0.02, 1)).toBe(0);
    expect(cloudShadowSun(-0.5, 1)).toBe(0);
    expect(cloudShadowSun(0.8, 1)).toBe(1);
    expect(cloudShadowSun(0.8, 0.5)).toBeCloseTo(0.5, 5);
    expect(CLOUD_MAX_DARKNESS).toBeLessThanOrEqual(0.35);

    const field = createClouds({ area, seed: 3 });
    const sprites = field.group.children.find((c) => c.name === 'cloud-sprites') as THREE.Mesh;
    const shadows = field.group.children.find((c) => c.name === 'cloud-shadows') as THREE.Mesh;
    expect(field.group.children).toHaveLength(2);
    expect(sprites.geometry).toBe(shadows.geometry);
    expect((sprites.geometry as THREE.InstancedBufferGeometry).instanceCount).toBeGreaterThan(300);
    const mat = sprites.material as THREE.ShaderMaterial;
    const smat = shadows.material as THREE.ShaderMaterial;
    expect(mat.fog).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(smat.depthWrite).toBe(false);
    expect(mat.uniforms.uDrift).toBe(smat.uniforms.uDrift); // shadows drift with their clouds

    field.setLighting({ x: 0.3, y: 0.8, z: 0.2 }, { r: 1, g: 0.9, b: 0.8 }, { r: 0.5, g: 0.7, b: 0.9 }, 0.6);
    field.setSunlight(1);
    expect(smat.uniforms.uShadowK.value).toBeCloseTo(1, 5);
    field.setLighting({ x: 1, y: 0.01, z: 0 }, { r: 1, g: 0.5, b: 0.3 }, { r: 0.5, g: 0.4, b: 0.4 }, 0.3);
    expect(smat.uniforms.uShadowK.value).toBe(0);
    expect((mat.uniforms.uSunDir.value as THREE.Vector3).length()).toBeCloseTo(1, 5);

    const before = (mat.uniforms.uDrift.value as THREE.Vector2).x;
    field.update(0.05, { x: 4, z: 1 });
    expect((mat.uniforms.uDrift.value as THREE.Vector2).x).toBeGreaterThan(before);
    field.setCoverage(1);
    expect(mat.uniforms.uAltScale.value).toBeLessThan(1);
    field.dispose();
  });
});
