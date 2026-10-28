import { describe, expect, it } from 'vitest';
import { distanceGain, distanceLowpassHz, dopplerRatio, equalPowerPan, zoomAttenuation } from '../src/audio/math';
import { listenerFromCamera } from '../src/audio/listener';
import { createRandom } from '../src/audio/synth';

describe('audio math', () => {
  it('distanceGain is 1 inside ref, falls with distance and stops at max', () => {
    expect(distanceGain(0, 4, 100, 1)).toBe(1);
    expect(distanceGain(4, 4, 100, 1)).toBe(1);
    expect(distanceGain(8, 4, 100, 1)).toBeCloseTo(0.5);
    expect(distanceGain(100, 4, 100, 1)).toBeCloseTo(distanceGain(900, 4, 100, 1));
    expect(distanceGain(20, 4, 100, 2)).toBeLessThan(distanceGain(20, 4, 100, 1));
  });

  it('distanceLowpassHz runs from 18 kHz to 1.2 kHz', () => {
    expect(distanceLowpassHz(0)).toBeCloseTo(18000);
    expect(distanceLowpassHz(300)).toBeCloseTo(1200);
    expect(distanceLowpassHz(1000)).toBeCloseTo(1200);
    expect(distanceLowpassHz(50)).toBeGreaterThan(distanceLowpassHz(100));
  });

  it('dopplerRatio raises pitch when approaching and is clamped', () => {
    expect(dopplerRatio(0)).toBe(1);
    expect(dopplerRatio(20)).toBeGreaterThan(1);
    expect(dopplerRatio(-20)).toBeLessThan(1);
    expect(dopplerRatio(1000)).toBe(1.15);
    expect(dopplerRatio(-1000)).toBe(0.85);
  });

  it('equalPowerPan keeps constant power', () => {
    for (const p of [-1, -0.3, 0, 0.7, 1]) {
      const g = equalPowerPan(p);
      expect(g.left ** 2 + g.right ** 2).toBeCloseTo(1);
    }
    expect(equalPowerPan(-1).right).toBeCloseTo(0);
  });

  it('zoomAttenuation follows 1/(1+h/150) with a floor', () => {
    expect(zoomAttenuation(0)).toBe(1);
    expect(zoomAttenuation(150)).toBeCloseTo(0.5);
    expect(zoomAttenuation(5000)).toBe(0.12);
  });

  it('createRandom with a seed is deterministic', () => {
    const a = createRandom(7);
    const b = createRandom(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('listenerFromCamera', () => {
  const up = { x: 0, y: 1, z: 0 };

  it('uses the camera position at street level', () => {
    const l = listenerFromCamera({ x: 3, y: 1.7, z: 4 }, { x: 1, y: 0, z: 0 }, up);
    expect([l.x, l.y, l.z]).toEqual([3, 1.7, 4]);
    expect(l.forward).toEqual({ x: 1, y: 0, z: 0 });
    expect(l.height).toBe(1.7);
  });

  it('sits on the ground point the camera looks at when high', () => {
    const s = Math.SQRT1_2;
    const l = listenerFromCamera({ x: 0, y: 50, z: 0 }, { x: 0, y: -s, z: -s }, up);
    expect(l.x).toBeCloseTo(0);
    expect(l.z).toBeCloseTo(-50);
    expect(l.y).toBe(2);
    expect(l.forward.z).toBeCloseTo(-1);
    expect(l.forward.y).toBe(0);
  });

  it('clamps the ray to 400 m', () => {
    const l = listenerFromCamera({ x: 0, y: 100, z: 0 }, { x: 0, y: -0.01, z: -1 }, up);
    expect(Math.hypot(l.x, l.z)).toBeLessThanOrEqual(400.5);
    expect(l.z).toBeLessThan(-300);
  });

  it('handles a straight-down view using the camera up for yaw', () => {
    const l = listenerFromCamera({ x: 10, y: 200, z: 20 }, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(l.x).toBeCloseTo(10);
    expect(l.z).toBeCloseTo(20);
    expect(l.forward.x).toBeCloseTo(1);
  });

  it('handles a camera looking level or up while high', () => {
    const l = listenerFromCamera({ x: 0, y: 30, z: 0 }, { x: 0, y: 0.5, z: -1 }, up);
    expect(Number.isFinite(l.x + l.z)).toBe(true);
    expect(l.y).toBe(2);
  });
});
