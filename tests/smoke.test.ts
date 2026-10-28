import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSmoke, type SmokeContext, type SmokeEmitter } from '../src/environment/smoke';

const sun = { r: 1, g: 0.95, b: 0.85 };
const winterEve: SmokeContext = { season: 'winter', timeOfDay: 19, lightsOn: true, sunColor: sun, ambient: 0.3 };
const summerNoon: SmokeContext = { season: 'summer', timeOfDay: 13, lightsOn: false, sunColor: sun, ambient: 0.65 };
const noWind = { x: 0, z: 0 };

function emitters(n: number): SmokeEmitter[] {
  return Array.from({ length: n }, (_, i) => ({ x: (i % 20) * 10, y: 8, z: Math.floor(i / 20) * 10 }));
}

function run(s: ReturnType<typeof createSmoke>, secs: number, wind: { x: number; z: number }, ctx: SmokeContext) {
  let peak = 0;
  for (let t = 0; t < secs; t += 0.1) {
    s.update(0.1, wind, ctx);
    peak = Math.max(peak, s.activeCount);
  }
  return peak;
}

describe('smoke', () => {
  it('caps emitters and is deterministic per seed', () => {
    const a = createSmoke({ maxEmitters: 50 });
    a.setEmitters(emitters(300), 5);
    expect(a.emitterCount).toBe(50);
    const b = createSmoke({ maxEmitters: 50 });
    b.setEmitters(emitters(300), 5);
    const seqA: number[] = [];
    const seqB: number[] = [];
    for (let i = 0; i < 300; i++) {
      a.update(0.1, noWind, winterEve);
      b.update(0.1, noWind, winterEve);
      seqA.push(a.activeCount);
      seqB.push(b.activeCount);
    }
    expect(seqA).toEqual(seqB);
  });

  it('emits in winter evening, bounded by maxParticles', () => {
    const s = createSmoke({ maxParticles: 200 });
    s.setEmitters(emitters(160), 3);
    const peak = run(s, 60, noWind, winterEve);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(200);
  });

  it('summer midday has far fewer particles than winter evening', () => {
    const w = createSmoke();
    w.setEmitters(emitters(160), 3);
    const s = createSmoke();
    s.setEmitters(emitters(160), 3);
    let wSum = 0;
    let sSum = 0;
    for (let t = 0; t < 120; t += 0.1) {
      w.update(0.1, noWind, winterEve);
      s.update(0.1, noWind, summerNoon);
      wSum += w.activeCount;
      sSum += s.activeCount;
    }
    expect(wSum).toBeGreaterThan(0);
    expect(sSum).toBeLessThan(wSum * 0.3);
  });

  it('drifts downwind and has no NaN', () => {
    const s = createSmoke();
    s.setEmitters([{ x: 0, y: 5, z: 0 }], 2);
    // Force eligibility with many seeds is unnecessary: use many emitters at x=0.
    s.setEmitters(Array.from({ length: 100 }, () => ({ x: 0, y: 5, z: 0 })), 2);
    run(s, 40, { x: 4, z: 0 }, winterEve);
    expect(s.activeCount).toBeGreaterThan(0);
    const attr = (s.mesh as THREE.InstancedMesh).geometry.getAttribute('aPos');
    let sum = 0;
    let n = 0;
    for (let i = 0; i < (s.mesh as THREE.InstancedMesh).count; i++) {
      const x = attr.getX(i);
      const y = attr.getY(i);
      const z = attr.getZ(i);
      const r = attr.getW(i);
      expect([x, y, z, r].every(Number.isFinite)).toBe(true);
      if (r > 0) {
        sum += x;
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
    expect(sum / n).toBeGreaterThan(0);
  });

  it('particles die after emitters are removed', () => {
    const s = createSmoke();
    s.setEmitters(emitters(100), 4);
    run(s, 20, noWind, winterEve);
    expect(s.activeCount).toBeGreaterThan(0);
    // setEmitters resets state, so keep emitters but stop eligibility instead.
    const off: SmokeContext = { ...summerNoon, season: 'summer', timeOfDay: 13 };
    run(s, 30, noWind, { ...off, ambient: 0.65 });
    // Residual eligible emitters in summer may remain; now remove entirely.
    s.setEmitters([], 4);
    expect(s.emitterCount).toBe(0);
    run(s, 30, noWind, winterEve);
    expect(s.activeCount).toBe(0);
  });

  it('is safe with dt = 0 and dispose, and uses one InstancedMesh', () => {
    const s = createSmoke();
    s.setEmitters(emitters(10), 1);
    expect(() => s.update(0, noWind, winterEve)).not.toThrow();
    expect(s.mesh).toBeInstanceOf(THREE.InstancedMesh);
    expect(s.mesh.frustumCulled).toBe(false);
    expect(() => s.dispose()).not.toThrow();
  });
});
