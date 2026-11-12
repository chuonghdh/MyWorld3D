import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NearClassifier } from '../src/traffic/people/lod';
import { createPeopleMeshes } from '../src/traffic/people/peopleMeshes';
import { trafficLife } from '../src/config/tuning';
import type { PedestrianRender } from '../src/traffic/pedestrians';

const R = 30;
const M = 4;

describe('NearClassifier', () => {
  it('puts everyone near when inside the radius and far when outside', () => {
    const c = new NearClassifier(8, R, M);
    for (let id = 1; id <= 4; id++) expect(c.classify(id, 10 * 10, true)).toBe(true);
    for (let id = 5; id <= 8; id++) expect(c.classify(id, 100 * 100, true)).toBe(false);
  });

  it('has hysteresis at the border', () => {
    const c = new NearClassifier(8, R, M);
    expect(c.classify(1, 31 * 31, true)).toBe(false); // outside the enter radius
    expect(c.classify(1, 29 * 29, true)).toBe(true);
    expect(c.classify(1, 33 * 33, true)).toBe(true); // between r and r + margin: stays near
    expect(c.classify(1, 35 * 35, true)).toBe(false); // beyond r + margin: leaves
    expect(c.classify(1, 33 * 33, true)).toBe(false); // does not re-enter until inside r
  });

  it('keeps people far when the near set is full and resets a reused slot', () => {
    const c = new NearClassifier(4, R, M);
    expect(c.classify(1, 1, false)).toBe(false);
    expect(c.classify(1, 1, true)).toBe(true);
    expect(c.classify(5, 33 * 33, true)).toBe(false); // slot 1 reused by id 5: no inherited near state
  });
});

function fakePed(id: number, x: number, z: number): PedestrianRender {
  return {
    id, position: { x, z }, y: 0, heading: 0, dog: null, body: 0, female: 0, hairStyle: 0,
    top: 0, pants: 0, hair: 0, skin: 0, accent: 0, traits: 0, pose: 0, speed: 1.2, phase: 0, umbrellaRank: 0.99, scale: 1,
  };
}

describe('people mesh LOD routing', () => {
  const ctx = { time: 1, night: false, season: 'summer' as const, rain: 0 };
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.7, 0);
  const render = (m: ReturnType<typeof createPeopleMeshes>): void => {
    (m.bodies[0].onBeforeRender as (...a: unknown[]) => void)(null, null, camera);
  };
  const total = (ms: THREE.InstancedMesh[]): number => ms.reduce((n, x) => n + x.count, 0);

  it('draws everything far until a camera has rendered', () => {
    const m = createPeopleMeshes(64, 8);
    m.update([fakePed(1, 1, 1), fakePed(2, 500, 500)], ctx);
    expect(total(m.nearBodies)).toBe(0);
    expect(total(m.bodies)).toBe(2);
    m.dispose();
  });

  it('routes by distance after a render and keeps the total', () => {
    const m = createPeopleMeshes(64, 8);
    render(m);
    m.update([fakePed(1, 5, 5), fakePed(2, 500, 500), fakePed(3, 20, 0)], ctx);
    expect(total(m.nearBodies)).toBe(2);
    expect(total(m.bodies)).toBe(1);
    m.dispose();
  });

  it('sends the overflow beyond nearMaxInstances to the far set', () => {
    const m = createPeopleMeshes(256, 8);
    render(m);
    const n = trafficLife.nearMaxInstances + 10;
    const list: PedestrianRender[] = [];
    for (let i = 1; i <= n; i++) list.push(fakePed(i, 5, 5));
    m.update(list, ctx);
    expect(m.nearBodies[0].count).toBe(trafficLife.nearMaxInstances);
    expect(m.bodies[0].count).toBe(10);
    m.dispose();
  });

  it('has its own, denser geometry and its own face material for the near meshes', () => {
    const m = createPeopleMeshes(16, 4);
    for (let i = 0; i < 4; i++) {
      expect(m.nearBodies[i].geometry.getAttribute('position').count).toBeGreaterThan(m.bodies[i].geometry.getAttribute('position').count);
      const nm = m.nearBodies[i].material as THREE.MeshLambertMaterial;
      expect(nm).not.toBe(m.bodies[i].material);
      expect(nm.defines).toHaveProperty('PERSON_NEAR');
      expect((m.bodies[i].material as THREE.MeshLambertMaterial).defines ?? {}).not.toHaveProperty('PERSON_NEAR');
    }
    m.dispose();
  });
  it('keeps the near face, surface and rim code out of the far material', () => {
    const m = createPeopleMeshes(16, 4);
    const sources = (mat: THREE.Material): { v: string; f: string } => {
      const shader = {
        uniforms: {} as Record<string, unknown>,
        vertexShader: ['#include <common>', '#include <beginnormal_vertex>', '#include <begin_vertex>', '#include <color_vertex>'].join(' '),
        fragmentShader: ['#include <common>', '#include <color_fragment>', '#include <lights_fragment_end>'].join(' '),
      };
      (mat.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
      return { v: shader.vertexShader, f: shader.fragmentShader };
    };
    const ids = ['PERSON_NEAR', 'setFace', 'faceColour', 'setSurface', 'clothColour', 'vSurf', 'uAoK', 'uRimK', 'uClothK', 'uHairK', 'uSkinK', 'hairColour', 'skinTint', 'RimLight', 'rimLight'];
    for (let i = 0; i < 4; i++) {
      const far = sources(m.bodies[i].material as THREE.Material);
      const near = sources(m.nearBodies[i].material as THREE.Material);
      for (const id of ids) {
        expect(far.v.includes(id) || far.f.includes(id)).toBe(false);
      }
      expect(near.v).toContain('setSurface');
      expect(near.f).toContain('clothColour');
      expect(near.f).toContain('rimLight');
    }
    m.dispose();
  });
});
