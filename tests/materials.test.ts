import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getBodyMaterial,
  getGlassLitMaterial,
  getGlassMaterial,
  glassUniforms,
  setGlassEnvironment,
  setNightLights,
} from '../src/buildings/materials';
import { getSignMaterial, SIGNS, SIGN_COUNT, signUv } from '../src/buildings/signs';

const VERT = '#include <common>\nvoid main() {\n#include <begin_vertex>\n}';
const FRAG =
  '#include <common>\nvoid main() {\n#include <color_fragment>\n#include <normal_fragment_maps>\n#include <opaque_fragment>\n}';

function compile(m: THREE.Material) {
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: VERT, fragmentShader: FRAG };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  return shader;
}

describe('body material', () => {
  it('is shared and keeps its basics', () => {
    const m = getBodyMaterial();
    expect(getBodyMaterial()).toBe(m);
    expect(m.name).toBe('building-body');
    expect(m.vertexColors).toBe(true);
  });

  it('injects the surface patterns with fwidth anti-aliasing', () => {
    const s = compile(getBodyMaterial());
    expect(s.vertexShader).toContain('attribute float aSurface');
    expect(s.vertexShader).toContain('vSurface');
    for (const fn of ['patBrick', 'patTerracotta', 'patSlate', 'patZinc', 'patTimber', 'patStucco', 'patStone', 'patConcrete']) {
      expect(s.fragmentShader).toContain(fn);
    }
    expect(s.fragmentShader).toContain('fwidth');
    expect(s.fragmentShader).not.toContain('#include <color_fragment>\n#include <color_fragment>');
  });
});

describe('glass materials', () => {
  it('are shared instances', () => {
    expect(getGlassMaterial()).toBe(getGlassMaterial());
    expect(getGlassLitMaterial()).toBe(getGlassLitMaterial());
    expect(getGlassMaterial()).not.toBe(getGlassLitMaterial());
  });

  it('inject the reflection and share uniforms', () => {
    for (const m of [getGlassMaterial(), getGlassLitMaterial()]) {
      const s = compile(m);
      expect(s.fragmentShader).toContain('uSkyColor');
      expect(s.fragmentShader).toContain('uSunDir');
      expect(s.uniforms.uSkyColor).toBe(glassUniforms.uSkyColor);
    }
  });

  it('setGlassEnvironment updates the uniforms', () => {
    setGlassEnvironment('#ff0000', { x: 0, y: 3, z: 0 }, '#00ff00');
    expect(glassUniforms.uSkyColor.value.r).toBeCloseTo(1);
    expect(glassUniforms.uSunDir.value.y).toBeCloseTo(1);
    expect(glassUniforms.uSunColor.value.g).toBeCloseTo(1);
  });
});

describe('signs and night switch', () => {
  it('sign material is shared and works without a canvas', () => {
    const m = getSignMaterial();
    expect(getSignMaterial()).toBe(m);
    expect(m.name).toBe('building-sign');
    expect(m.vertexColors).toBe(true);
    expect(m.roughness).toBe(0.6);
  });

  it('setNightLights drives glassLit and signs', () => {
    setNightLights(true);
    expect(getGlassLitMaterial().emissiveIntensity).toBeGreaterThan(0);
    expect(getSignMaterial().emissiveIntensity).toBeGreaterThan(0);
    setNightLights(false);
    expect(getGlassLitMaterial().emissiveIntensity).toBe(0);
    expect(getSignMaterial().emissiveIntensity).toBe(0);
  });

  it('sign ids are unique and cells are disjoint inside [0,1]', () => {
    expect(new Set(SIGNS.map((s) => s.id)).size).toBe(SIGN_COUNT);
    const cells = SIGNS.map((_, i) => signUv(i));
    for (const c of cells) {
      expect(c.u0).toBeGreaterThanOrEqual(0);
      expect(c.v0).toBeGreaterThanOrEqual(0);
      expect(c.u1).toBeLessThanOrEqual(1);
      expect(c.v1).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        const overlap = a.u0 < b.u1 - 1e-9 && b.u0 < a.u1 - 1e-9 && a.v0 < b.v1 - 1e-9 && b.v0 < a.v1 - 1e-9;
        expect(overlap).toBe(false);
      }
    }
  });
});
