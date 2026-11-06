import { describe, expect, it } from 'vitest';
import { uiCamera } from '../src/config/tuning';
import { clampPitch, streetKeyAxes, streetLookStep } from '../src/scene/cameraMath';

const keys = (...codes: string[]) => new Set(codes);

describe('street key mapping', () => {
  it('Up and Down walk, Left and Right turn, A and D turn too, W and S look', () => {
    expect(streetKeyAxes(keys('ArrowUp'))).toEqual({ walk: 1, turn: 0, look: 0 });
    expect(streetKeyAxes(keys('ArrowDown'))).toEqual({ walk: -1, turn: 0, look: 0 });
    expect(streetKeyAxes(keys('ArrowRight'))).toEqual({ walk: 0, turn: 1, look: 0 });
    expect(streetKeyAxes(keys('ArrowLeft'))).toEqual({ walk: 0, turn: -1, look: 0 });
    expect(streetKeyAxes(keys('KeyD'))).toEqual({ walk: 0, turn: 1, look: 0 });
    expect(streetKeyAxes(keys('KeyA'))).toEqual({ walk: 0, turn: -1, look: 0 });
    expect(streetKeyAxes(keys('KeyW'))).toEqual({ walk: 0, turn: 0, look: 1 });
    expect(streetKeyAxes(keys('KeyS'))).toEqual({ walk: 0, turn: 0, look: -1 });
  });

  it('no key gives zero axes, and opposite keys cancel', () => {
    expect(streetKeyAxes(keys())).toEqual({ walk: 0, turn: 0, look: 0 });
    expect(streetKeyAxes(keys('ArrowUp', 'ArrowDown'))).toEqual({ walk: 0, turn: 0, look: 0 });
    expect(streetKeyAxes(keys('ArrowLeft', 'KeyD'))).toEqual({ walk: 0, turn: 0, look: 0 });
  });

  it('turn and look keys combine with walking', () => {
    expect(streetKeyAxes(keys('ArrowUp', 'KeyA', 'KeyW'))).toEqual({ walk: 1, turn: -1, look: 1 });
  });
});

describe('street pitch clamp', () => {
  it('limits pitch to the configured range (80 degrees each way)', () => {
    expect(uiCamera.pitchLimit).toBeCloseTo((80 * Math.PI) / 180, 9);
    expect(clampPitch(10)).toBe(uiCamera.pitchLimit);
    expect(clampPitch(-10)).toBe(-uiCamera.pitchLimit);
    expect(clampPitch(0.3)).toBe(0.3);
  });
});

describe('street look step', () => {
  const dt = 0.5;

  it('turning right lowers yaw and turning left raises it, at the turn speed', () => {
    const right = streetLookStep(0, 0, { walk: 0, turn: 1, look: 0 }, dt);
    expect(right.yaw).toBeCloseTo(-uiCamera.streetTurnSpeed * dt, 9);
    expect(right.pitch).toBe(0);
    const left = streetLookStep(0, 0, { walk: 0, turn: -1, look: 0 }, dt);
    expect(left.yaw).toBeCloseTo(uiCamera.streetTurnSpeed * dt, 9);
  });

  it('looking up raises pitch and looking down lowers it, at the pitch speed', () => {
    const up = streetLookStep(0, 0, { walk: 0, turn: 0, look: 1 }, dt);
    expect(up.pitch).toBeCloseTo(uiCamera.streetPitchSpeed * dt, 9);
    expect(up.yaw).toBe(0);
    const down = streetLookStep(0, 0, { walk: 0, turn: 0, look: -1 }, dt);
    expect(down.pitch).toBeCloseTo(-uiCamera.streetPitchSpeed * dt, 9);
  });

  it('pitch never passes the limit, up or down', () => {
    let p = 0;
    for (let i = 0; i < 1000; i++) p = streetLookStep(0, p, { walk: 0, turn: 0, look: 1 }, dt).pitch;
    expect(p).toBe(uiCamera.pitchLimit);
    for (let i = 0; i < 1000; i++) p = streetLookStep(0, p, { walk: 0, turn: 0, look: -1 }, dt).pitch;
    expect(p).toBe(-uiCamera.pitchLimit);
  });

  it('no keys leave yaw and pitch unchanged', () => {
    expect(streetLookStep(1.1, 0.4, { walk: 1, turn: 0, look: 0 }, dt)).toEqual({ yaw: 1.1, pitch: 0.4 });
  });
});
