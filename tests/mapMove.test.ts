import { describe, expect, it } from 'vitest';
import { mapLookAxes, mapLookStep, mapMoveAxis, mapMoveSpeedAt, moveCameraAlong } from '../src/scene/pivotMath';
import type { V3 } from '../src/scene/cameraMath';

const B = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const FWD: [number, number, number] = [0, 0, -1];

describe('map move keys', () => {
  it('Up forward, Down back, both or none cancel', () => {
    expect(mapMoveAxis(new Set(['ArrowUp']))).toBe(1);
    expect(mapMoveAxis(new Set(['ArrowDown']))).toBe(-1);
    expect(mapMoveAxis(new Set(['ArrowUp', 'ArrowDown']))).toBe(0);
    expect(mapMoveAxis(new Set())).toBe(0);
  });
});

describe('moveCameraAlong (camera moves, orbit target does not)', () => {
  const LIM = { groundY: 0, bounds: B, margin: -40 };
  it('moves the camera along the view direction, forward and back', () => {
    expect(moveCameraAlong([0, 50, 0], FWD, 10, LIM)).toEqual([0, 50, -10]);
    expect(moveCameraAlong([3, 40, 5], FWD, -7, LIM)).toEqual([3, 40, 12]);
  });
  it('a pitched view moves the camera height too', () => {
    const d: V3 = [0, -Math.SQRT1_2, -Math.SQRT1_2];
    const p = moveCameraAlong([0, 50, 0], d, 10, LIM);
    expect(p[1]).toBeCloseTo(50 - 10 * Math.SQRT1_2, 9);
    expect(p[2]).toBeCloseTo(-10 * Math.SQRT1_2, 9);
  });
  it('stops the camera at ground when looking down', () => {
    expect(moveCameraAlong([0, 50, 0], [0, -1, 0], 100, LIM)[1]).toBeCloseTo(0, 9);
    expect(moveCameraAlong([0, 0, 0], [0, -1, 0], 10, LIM)[1]).toBe(0);
  });
  it('stops the camera at the town bounds plus margin', () => {
    expect(moveCameraAlong([95, 20, 0], [1, 0, 0], 1000, LIM)[0]).toBeCloseTo(140, 9);
    expect(moveCameraAlong([-95, 20, 0], [-1, 0, 0], 1000, LIM)[0]).toBeCloseTo(-140, 9);
  });
  it('a zero step leaves the camera where it is', () => {
    expect(moveCameraAlong([3, 4, 5], FWD, 0, LIM)).toEqual([3, 4, 5]);
  });
});

describe('map look keys', () => {
  it('Left/Right and A/D turn, W/S tilt; Up/Down are not look keys', () => {
    expect(mapLookAxes(new Set(['ArrowRight']))).toEqual({ walk: 0, turn: 1, look: 0 });
    expect(mapLookAxes(new Set(['ArrowLeft']))).toEqual({ walk: 0, turn: -1, look: 0 });
    expect(mapLookAxes(new Set(['KeyW']))).toEqual({ walk: 0, turn: 0, look: 1 });
    expect(mapLookAxes(new Set(['KeyS']))).toEqual({ walk: 0, turn: 0, look: -1 });
    expect(mapLookAxes(new Set(['KeyD']))).toEqual({ walk: 0, turn: 1, look: 0 });
    expect(mapLookAxes(new Set(['KeyA']))).toEqual({ walk: 0, turn: -1, look: 0 });
    expect(mapLookAxes(new Set(['KeyA', 'KeyD', 'ArrowUp']))).toEqual({ walk: 0, turn: 0, look: 0 });
  });
  it('Left turns the view left (towards -X from -Z) and keeps the elevation', () => {
    const d: V3 = [0, 0, -1];
    const l = mapLookStep(d, { walk: 0, turn: -1, look: 0 }, 0.5);
    expect(l[0]).toBeLessThan(0);
    expect(l[1]).toBeCloseTo(0, 9);
    const r = mapLookStep(d, { walk: 0, turn: 1, look: 0 }, 0.5);
    expect(r[0]).toBeGreaterThan(0);
  });
  it('keeps a unit direction and the same yaw sign for a pitched view', () => {
    const d: V3 = [0, -Math.SQRT1_2, -Math.SQRT1_2];
    const l = mapLookStep(d, { walk: 0, turn: -1, look: 0 }, 0.3);
    expect(Math.hypot(l[0], l[1], l[2])).toBeCloseTo(1, 9);
    expect(l[1]).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(l[0]).toBeLessThan(0);
  });
  it('W tilts up and S tilts down, clamped to the pitch limit (80 degrees)', () => {
    const limit = (80 * Math.PI) / 180;
    let d: V3 = [0, 0, -1];
    for (let i = 0; i < 1000; i++) d = mapLookStep(d, { walk: 0, turn: 0, look: 1 }, 0.1);
    expect(Math.asin(d[1])).toBeCloseTo(limit, 6);
    for (let i = 0; i < 2000; i++) d = mapLookStep(d, { walk: 0, turn: 0, look: -1 }, 0.1);
    expect(Math.asin(d[1])).toBeCloseTo(-limit, 6);
  });
  it('no axes leaves the direction unchanged', () => {
    const d: V3 = [0.6, 0.0, -0.8];
    expect(mapLookStep(d, { walk: 0, turn: 0, look: 0 }, 1)).toEqual(d);
  });
});

describe('keyboard helpers are pure and do not touch the orbit target', () => {
  it('moveCameraAlong returns a new camera position and leaves its inputs unchanged', () => {
    const cam: V3 = [1, 40, 2];
    const dir: V3 = [0, 0, -1];
    const out = moveCameraAlong(cam, dir, 5, { groundY: 0, bounds: B, margin: -40 });
    expect(out).toEqual([1, 40, -3]);
    expect(cam).toEqual([1, 40, 2]);
    expect(dir).toEqual([0, 0, -1]);
  });
  it('mapLookStep turns a direction only, with no pivot input', () => {
    const dir: V3 = [0, 0, -1];
    const out = mapLookStep(dir, { walk: 0, turn: 1, look: 0 }, 0.2);
    expect(dir).toEqual([0, 0, -1]);
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(1, 9);
  });
});

describe('mapMoveSpeedAt (speed rises with camera height)', () => {
  const C = { low: 15, high: 40, lowHeight: 25, highHeight: 400 };
  it('is the low speed at and below the low height', () => {
    expect(mapMoveSpeedAt(0, C)).toBe(15);
    expect(mapMoveSpeedAt(25, C)).toBe(15);
    expect(mapMoveSpeedAt(-5, C)).toBe(15);
  });
  it('is the high speed at and above the high height', () => {
    expect(mapMoveSpeedAt(400, C)).toBe(40);
    expect(mapMoveSpeedAt(1000, C)).toBe(40);
  });
  it('is linear in between (middle value at the middle height)', () => {
    expect(mapMoveSpeedAt(212.5, C)).toBeCloseTo(27.5, 9);
    expect(mapMoveSpeedAt(100, C)).toBeCloseTo(15 + (25 * 75) / 375, 9);
    expect(mapMoveSpeedAt(300, C)).toBeGreaterThan(mapMoveSpeedAt(200, C));
  });
});
