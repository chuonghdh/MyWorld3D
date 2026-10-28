import { describe, expect, it } from 'vitest';
import {
  EYE_HEIGHT,
  clampToBounds,
  clipPlanes,
  dirFromYaw,
  easeInOut,
  panelInset,
  streetStart,
  walkStep,
  wholeMapFraming,
  yawFromDir,
} from '../src/scene/cameraMath';
import { useWorldStore } from '../src/store';

describe('clip planes', () => {
  it('matches the previous overview behaviour', () => {
    const d = Math.hypot(380, 130);
    const p = clipPlanes(d);
    expect(p.near).toBeCloseTo(d * 0.05, 6);
    expect(p.far).toBeCloseTo(Math.max(1200, d * 4), 6);
  });
  it('goes down to 0.1 at street level and keeps far at least 1200', () => {
    expect(clipPlanes(1.7).near).toBe(0.1);
    expect(clipPlanes(4).near).toBeCloseTo(0.2, 6);
    expect(clipPlanes(0).far).toBe(1200);
    expect(clipPlanes(600).near).toBe(30);
    expect(clipPlanes(600).far).toBe(2400);
  });
  it('is monotonic', () => {
    let prev = clipPlanes(0);
    for (let d = 1; d <= 700; d += 7) {
      const p = clipPlanes(d);
      expect(p.near).toBeGreaterThanOrEqual(prev.near);
      expect(p.far).toBeGreaterThanOrEqual(prev.far);
      prev = p;
    }
  });
});

describe('easing', () => {
  it('has fixed ends, symmetry and is monotonic', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.25) + easeInOut(0.75)).toBeCloseTo(1, 9);
    let prev = 0;
    for (let k = 0; k <= 1; k += 0.05) {
      expect(easeInOut(k)).toBeGreaterThanOrEqual(prev);
      prev = easeInOut(k);
    }
  });
});

describe('bounds clamp', () => {
  const b = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 };
  it('clamps with margin', () => {
    expect(clampToBounds(500, -500, b, 2)).toEqual({ x: 98, z: -48 });
    expect(clampToBounds(10, 10, b)).toEqual({ x: 10, z: 10 });
  });
  it('negative margin allows leaving the bounds', () => {
    expect(clampToBounds(500, 0, b, -40).x).toBe(140);
  });
  it('degenerate margin collapses to the centre', () => {
    expect(clampToBounds(5, 5, b, 120)).toEqual({ x: 0, z: 0 });
  });
});

describe('whole map framing', () => {
  const base = { townSize: 500, fovDeg: 35, viewW: 1600, viewH: 900 };
  it('without a panel equals the old framing', () => {
    const f = wholeMapFraming({ ...base, rightInset: 0 });
    expect(f.position[0]).toBe(0);
    expect(f.position[1]).toBeCloseTo(500 * 1.75, 6);
    expect(f.position[2]).toBeCloseTo(500 * 0.45, 6);
    expect(f.target).toEqual([0, 0, 0]);
  });
  it('keeps the town left of the panel', () => {
    const inset = 320;
    const f = wholeMapFraming({ ...base, rightInset: inset });
    const tanH = Math.tan((35 * Math.PI) / 360) * (base.viewW / base.viewH);
    const pxPerM = base.viewW / (2 * f.distance * tanH);
    const rightEdgePx = base.viewW / 2 + (250 - f.target[0]) * pxPerM;
    const leftEdgePx = base.viewW / 2 + (-250 - f.target[0]) * pxPerM;
    expect(rightEdgePx).toBeLessThanOrEqual(base.viewW - inset + 1e-6);
    expect(leftEdgePx).toBeGreaterThanOrEqual(0);
    expect(f.position[0]).toBeGreaterThan(0);
    expect(f.position[0]).toBe(f.target[0]);
  });
  it('zooms out on a narrow viewport so the town still fits', () => {
    const wide = wholeMapFraming({ ...base, rightInset: 0 });
    const narrow = wholeMapFraming({ ...base, viewW: 700, viewH: 900, rightInset: 300 });
    expect(narrow.distance).toBeGreaterThan(wide.distance);
  });
  it('panel inset reads the DOM rectangle and respects collapse', () => {
    expect(panelInset(1284, 1600, false)).toBe(324);
    expect(panelInset(1284, 1600, true)).toBe(0);
    expect(panelInset(null, 1600, false)).toBe(0);
    expect(panelInset(100, 1600, false)).toBe(800);
  });
});

describe('street walk', () => {
  const roads = [
    { start: { x: -100, z: 0 }, end: { x: 100, z: 0 }, width: 10, sidewalkWidth: 4 },
    { start: { x: 0, z: -100 }, end: { x: 0, z: 100 }, width: 10, sidewalkWidth: 4 },
  ];
  it('yaw and direction round-trip', () => {
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const d = dirFromYaw(yawFromDir(dx, dz));
      expect(d.x).toBeCloseTo(dx, 9);
      expect(d.z).toBeCloseTo(dz, 9);
    }
  });
  it('starts on the sidewalk of the nearest road, looking along it', () => {
    const s = streetStart(roads, 60, 3);
    expect(s.z).toBeCloseTo(7, 9);
    expect(s.x).toBeCloseTo(60, 9);
    const d = dirFromYaw(s.yaw);
    expect(Math.abs(d.x)).toBeCloseTo(1, 9);
    expect(d.x).toBeLessThan(0);
  });
  it('handles an empty road list', () => {
    expect(streetStart([], 5, 5)).toEqual({ x: 0, z: 0, yaw: 0 });
  });
  it('walks forward, runs faster and stays in bounds', () => {
    const b = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    const walk = walkStep(0, 0, 0, 1, 0, 1, false, b);
    const run = walkStep(0, 0, 0, 1, 0, 1, true, b);
    expect(walk.z).toBeCloseTo(-2.5, 9);
    expect(run.z).toBeCloseTo(-6, 9);
    const out = walkStep(99, 0, -Math.PI / 2, 1, 0, 10, true, b);
    expect(out.x).toBe(98);
    const diag = walkStep(0, 0, 0, 1, 1, 1, false, b);
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(2.5, 9);
    expect(EYE_HEIGHT).toBe(1.7);
  });
});

describe('setTimeOfDay', () => {
  it('sets the hour without touching undo history', () => {
    const before = useWorldStore.getState().past.length;
    useWorldStore.getState().setTimeOfDay(17.5);
    expect(useWorldStore.getState().settings.timeOfDay).toBe(17.5);
    useWorldStore.getState().setTimeOfDay(22);
    expect(useWorldStore.getState().settings.timeOfDay).toBe(22);
    expect(useWorldStore.getState().past.length).toBe(before);
  });
});
