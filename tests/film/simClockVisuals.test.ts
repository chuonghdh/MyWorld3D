// Shader clocks for visual motion follow simulation time (runtime.simTime), not the wall clock, so the auto film
// (fixed 1/fps steps, encoded slower than real time) shows wind sway and fountain water at film speed.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { generateCity } from '../../src/city';
import { DEFAULT_SETTINGS } from '../../src/store/model';
import { createStreetscape, MESH_NAMES } from '../../src/streets';
import { runtime } from '../../src/core/runtime';
import { setBuildingWind, tickBuildingWind, windUniforms } from '../../src/buildings/shaders/wind';

afterEach(() => {
  vi.restoreAllMocks();
  runtime.simTime = 0;
});

function findWater(): THREE.Mesh {
  for (const seed of [DEFAULT_SETTINGS.seed, 1, 7, 42, 1234, 4242]) {
    const layout = generateCity({ ...DEFAULT_SETTINGS, seed });
    const s = createStreetscape(layout);
    const m = s.group.getObjectByName(MESH_NAMES.water) as THREE.Mesh | undefined;
    if (m) return m;
  }
  throw new Error('no seed with fountain water');
}

describe('visual shader clocks follow sim time', () => {
  it('fountain water time is runtime.simTime, not performance.now()', () => {
    vi.spyOn(performance, 'now').mockReturnValue(987_654);
    const mesh = findWater();
    const mat = mesh.material as THREE.ShaderMaterial;
    runtime.simTime = 12.25;
    mesh.onBeforeRender(null as never, null as never, null as never, null as never, mat, null as never);
    expect(mat.uniforms.uTime!.value).toBeCloseTo(12.25, 9);
    runtime.simTime = 12.25 + 1 / 30;
    mesh.onBeforeRender(null as never, null as never, null as never, null as never, mat, null as never);
    expect(mat.uniforms.uTime!.value).toBeCloseTo(12.25 + 1 / 30, 9);
  });

  it('building wind time is the sim time from setBuildingWind; the render tick does not overwrite it', () => {
    vi.spyOn(performance, 'now').mockReturnValue(987_654);
    setBuildingWind(3.5, { x: 1, z: 0 }, 0);
    tickBuildingWind();
    expect(windUniforms.uWTime.value).toBe(3.5);
  });
});
